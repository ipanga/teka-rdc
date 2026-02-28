import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  const ProductsListState({
    this.products = const [],
    this.total = 0,
    this.page = 1,
    this.limit = 20,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
    this.statusFilter,
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
    );
  }
}

class ProductsListNotifier extends StateNotifier<ProductsListState> {
  final ProductsRepository _repository;

  ProductsListNotifier(this._repository) : super(const ProductsListState()) {
    loadProducts();
  }

  Future<void> loadProducts() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final statusApi = state.statusFilter != null
          ? productStatusToApi(state.statusFilter!)
          : null;
      final result = await _repository.getProducts(
        page: 1,
        limit: state.limit,
        status: statusApi,
      );
      state = state.copyWith(
        products: result.items,
        total: result.total,
        page: 1,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore) return;
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
      );
      state = state.copyWith(
        products: [...state.products, ...result.items],
        total: result.total,
        page: nextPage,
        isLoadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingMore: false,
        error: e.toString(),
      );
    }
  }

  void setStatusFilter(ProductStatus? status) {
    if (status == state.statusFilter) return;
    state = ProductsListState(
      statusFilter: status,
      limit: state.limit,
    );
    loadProducts();
  }
}

final sellerProductsProvider =
    StateNotifierProvider<ProductsListNotifier, ProductsListState>((ref) {
  return ProductsListNotifier(ref.read(productsRepositoryProvider));
});

// -- Single product detail --

final productDetailProvider =
    FutureProvider.family<SellerProductModel, String>((ref, id) async {
  final repository = ref.read(productsRepositoryProvider);
  return repository.getProduct(id);
});

// -- Categories --

final categoriesProvider =
    FutureProvider<List<CategoryModel>>((ref) async {
  final repository = ref.read(productsRepositoryProvider);
  return repository.getCategories();
});
