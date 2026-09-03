import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/models/product_model.dart';
import '../../data/products_repository.dart';

// -- Products list state & notifier --

class ProductsListState {
  final List<SellerProductModel> products;
  final int total;
  final int page;
  final int limit;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;
  final ProductStatus? statusFilter;
  final String search;
  final int searchResetVersion;

  const ProductsListState({
    this.products = const [],
    this.total = 0,
    this.page = 1,
    this.limit = 20,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
    this.statusFilter,
    this.search = '',
    this.searchResetVersion = 0,
  });

  bool get hasMore => page * limit < total;

  ProductsListState copyWith({
    List<SellerProductModel>? products,
    int? total,
    int? page,
    int? limit,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    ProductStatus? statusFilter,
    String? search,
    bool clearFilter = false,
    bool clearError = false,
  }) {
    return ProductsListState(
      products: products ?? this.products,
      total: total ?? this.total,
      page: page ?? this.page,
      limit: limit ?? this.limit,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
      statusFilter: clearFilter ? null : (statusFilter ?? this.statusFilter),
      search: search ?? this.search,
      searchResetVersion: searchResetVersion,
    );
  }
}

class ProductsListNotifier extends StateNotifier<ProductsListState> {
  final ProductsRepository _repository;

  // Starts in a loading state and does NOT auto-fetch. The first load is driven
  // by `sellerProductsProvider` once auth resolves to authenticated — firing in
  // the constructor races token restoration on cold start (request with no
  // bearer → 401 → cached error until "Réessayer"). See dashboardStatsProvider.
  ProductsListNotifier(this._repository)
      : super(const ProductsListState(isLoading: true));

  int _request = 0;

  /// Opening an action always refreshes its queue, even on a previously visited tab.
  void openActionFilter(ProductStatus? status) {
    state = ProductsListState(
        statusFilter: status,
        limit: state.limit,
        searchResetVersion: state.searchResetVersion + 1);
    loadProducts();
  }

  Future<void> loadProducts() async {
    if (!mounted) return;
    final request = ++_request;
    state =
        state.copyWith(isLoading: true, isLoadingMore: false, clearError: true);
    try {
      final statusApi = state.statusFilter != null
          ? productStatusToApi(state.statusFilter!)
          : null;
      final result = await _repository.getProducts(
        page: 1,
        limit: state.limit,
        status: statusApi,
        search: state.search,
      );
      if (!mounted || request != _request) return;
      state = state.copyWith(
        products: result.items,
        total: result.total,
        page: 1,
        isLoading: false,
      );
    } catch (e) {
      if (!mounted || request != _request) return;
      state = state.copyWith(
        isLoading: false,
        error: friendlyErrorMessage(e),
      );
    }
  }

  Future<void> loadMore() async {
    if (!mounted || state.isLoading || state.isLoadingMore || !state.hasMore) {
      return;
    }
    final request = _request;
    state = state.copyWith(isLoadingMore: true);
    try {
      final nextPage = state.page + 1;
      final statusApi = state.statusFilter != null
          ? productStatusToApi(state.statusFilter!)
          : null;
      final result = await _repository.getProducts(
        page: nextPage,
        limit: state.limit,
        status: statusApi,
        search: state.search,
      );
      if (!mounted || request != _request) return;
      state = state.copyWith(
        products: [...state.products, ...result.items],
        total: result.total,
        page: nextPage,
        isLoadingMore: false,
      );
    } catch (e) {
      if (!mounted || request != _request) return;
      state = state.copyWith(
        isLoadingMore: false,
        error: friendlyErrorMessage(e),
      );
    }
  }

  void setStatusFilter(ProductStatus? status) {
    if (status == state.statusFilter) return;
    state = ProductsListState(
      statusFilter: status,
      limit: state.limit,
      search: state.search,
      searchResetVersion: state.searchResetVersion,
    );
    loadProducts();
  }

  void setSearch(String search) {
    if (search == state.search) return;
    state = ProductsListState(
        search: search,
        statusFilter: state.statusFilter,
        limit: state.limit,
        searchResetVersion: state.searchResetVersion);
    loadProducts();
  }

  /// Lifecycle actions — withdraw / restore / duplicate. Each refreshes the
  /// list so the moved product reflects its new status. Returns the (possibly
  /// new) product, or null on error.
  Future<SellerProductModel?> withdraw(String id) async {
    try {
      final p = await _repository.withdrawProduct(id);
      await loadProducts();
      return p;
    } catch (e) {
      if (mounted) state = state.copyWith(error: friendlyErrorMessage(e));
      return null;
    }
  }

  Future<SellerProductModel?> restore(String id) async {
    try {
      final p = await _repository.restoreProduct(id);
      await loadProducts();
      return p;
    } catch (e) {
      if (mounted) state = state.copyWith(error: friendlyErrorMessage(e));
      return null;
    }
  }

  Future<SellerProductModel?> duplicate(String id) async {
    try {
      final p = await _repository.duplicateProduct(id);
      await loadProducts();
      return p;
    } catch (e) {
      if (mounted) state = state.copyWith(error: friendlyErrorMessage(e));
      return null;
    }
  }
}

final sellerProductsProvider =
    StateNotifierProvider<ProductsListNotifier, ProductsListState>((ref) {
  final id = ref.watch(authenticatedSellerIdProvider);
  final notifier = ProductsListNotifier(ref.watch(productsRepositoryProvider));
  if (id != null) {
    // Let a same-turn task/filter select its first request. This avoids fetching
    // an unfiltered page immediately before the requested action queue.
    Future.microtask(() {
      if (notifier.mounted && notifier._request == 0) notifier.loadProducts();
    });
  }
  return notifier;
});

// -- Single product detail --

/// A product's status can change WITHOUT the seller doing anything — an admin
/// approves or rejects it out of band. Every `ref.invalidate` in this app is
/// triggered by a seller action (submit, withdraw, edit, images), so a plain
/// keep-alive provider served the status captured on first view for the rest of
/// the app's life: a product approved minutes ago still read "En attente" until
/// the app was killed, while the products list — which has pull-to-refresh —
/// showed it correctly.
///
/// `autoDispose` drops the cache when the last listener goes, so leaving the
/// detail screen and coming back refetches. The screen also pulls to refresh,
/// for the seller who is already looking at it when the decision lands.
final productDetailProvider = FutureProvider.autoDispose
    .family<SellerProductModel, String>((ref, id) async {
  final repository = ref.watch(productsRepositoryProvider);
  return repository.getProduct(id);
});

// -- Categories --

final categoriesProvider = FutureProvider<List<CategoryModel>>((ref) async {
  final repository = ref.read(productsRepositoryProvider);
  return repository.getCategories();
});
