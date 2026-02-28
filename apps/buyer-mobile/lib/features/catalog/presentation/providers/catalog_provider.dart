import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/catalog_repository.dart';
import '../../data/models/category_model.dart';
import '../../data/models/product_model.dart';

// ──────────────────────────────────────────────
// Categories provider
// ──────────────────────────────────────────────

final categoriesProvider = FutureProvider<List<CategoryModel>>((ref) {
  final repository = ref.read(catalogRepositoryProvider);
  return repository.getCategories();
});

// ──────────────────────────────────────────────
// Browse products state
// ──────────────────────────────────────────────

class BrowseProductsParams {
  final String? categoryId;
  final String? search;
  final String? condition;
  final String? sortBy;

  const BrowseProductsParams({
    this.categoryId,
    this.search,
    this.condition,
    this.sortBy,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is BrowseProductsParams &&
          runtimeType == other.runtimeType &&
          categoryId == other.categoryId &&
          search == other.search &&
          condition == other.condition &&
          sortBy == other.sortBy;

  @override
  int get hashCode =>
      categoryId.hashCode ^
      search.hashCode ^
      condition.hashCode ^
      sortBy.hashCode;

  BrowseProductsParams copyWith({
    String? categoryId,
    String? search,
    String? condition,
    String? sortBy,
    bool clearCategoryId = false,
    bool clearSearch = false,
    bool clearCondition = false,
    bool clearSortBy = false,
  }) {
    return BrowseProductsParams(
      categoryId: clearCategoryId ? null : (categoryId ?? this.categoryId),
      search: clearSearch ? null : (search ?? this.search),
      condition: clearCondition ? null : (condition ?? this.condition),
      sortBy: clearSortBy ? null : (sortBy ?? this.sortBy),
    );
  }
}

class BrowseProductsState {
  final List<BrowseProductModel> products;
  final PaginationMeta? pagination;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;

  const BrowseProductsState({
    this.products = const [],
    this.pagination,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
  });

  BrowseProductsState copyWith({
    List<BrowseProductModel>? products,
    PaginationMeta? pagination,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    bool clearError = false,
  }) {
    return BrowseProductsState(
      products: products ?? this.products,
      pagination: pagination ?? this.pagination,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
    );
  }

  bool get hasMore => pagination?.hasMore ?? false;
}

class BrowseProductsNotifier extends StateNotifier<BrowseProductsState> {
  final CatalogRepository _repository;
  final BrowseProductsParams _params;

  BrowseProductsNotifier(this._repository, this._params)
      : super(const BrowseProductsState()) {
    loadProducts();
  }

  Future<void> loadProducts() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.browseProducts(
        categoryId: _params.categoryId,
        search: _params.search,
        condition: _params.condition,
        sortBy: _params.sortBy,
      );
      state = state.copyWith(
        products: result.data,
        pagination: result.pagination,
        isLoading: false,
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: _extractErrorMessage(e),
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Une erreur est survenue. Veuillez reessayer.',
      );
    }
  }

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore) return;

    state = state.copyWith(isLoadingMore: true);
    try {
      final result = await _repository.browseProducts(
        categoryId: _params.categoryId,
        search: _params.search,
        condition: _params.condition,
        sortBy: _params.sortBy,
        cursor: state.pagination?.nextCursor,
      );
      state = state.copyWith(
        products: [...state.products, ...result.data],
        pagination: result.pagination,
        isLoadingMore: false,
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoadingMore: false,
        error: _extractErrorMessage(e),
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingMore: false,
        error: 'Une erreur est survenue. Veuillez reessayer.',
      );
    }
  }

  Future<void> refresh() async {
    state = const BrowseProductsState();
    await loadProducts();
  }

  String _extractErrorMessage(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return 'Connexion lente. Veuillez reessayer.';
    }
    if (e.type == DioExceptionType.connectionError) {
      return 'Pas de connexion internet.';
    }
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      final error = data['error'];
      if (error is Map && error['message'] != null) {
        return error['message'].toString();
      }
      return error.toString();
    }
    return 'Une erreur est survenue. Veuillez reessayer.';
  }
}

final browseProductsProvider = StateNotifierProvider.family<
    BrowseProductsNotifier, BrowseProductsState, BrowseProductsParams>(
  (ref, params) {
    final repository = ref.read(catalogRepositoryProvider);
    return BrowseProductsNotifier(repository, params);
  },
);

// ──────────────────────────────────────────────
// Product detail provider
// ──────────────────────────────────────────────

final productDetailProvider =
    FutureProvider.family<ProductDetailModel, String>((ref, id) {
  final repository = ref.read(catalogRepositoryProvider);
  return repository.getProductDetail(id);
});

// ──────────────────────────────────────────────
// Home page products (popular + newest)
// ──────────────────────────────────────────────

final popularProductsProvider = FutureProvider<List<BrowseProductModel>>((ref) async {
  final repository = ref.read(catalogRepositoryProvider);
  final result = await repository.browseProducts(
    sortBy: 'popular',
    limit: 10,
  );
  return result.data;
});

final newestProductsProvider = FutureProvider<List<BrowseProductModel>>((ref) async {
  final repository = ref.read(catalogRepositoryProvider);
  final result = await repository.browseProducts(
    sortBy: 'newest',
    limit: 20,
  );
  return result.data;
});
