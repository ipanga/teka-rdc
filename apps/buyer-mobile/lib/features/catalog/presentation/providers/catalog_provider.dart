import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../city/presentation/providers/city_provider.dart';
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
  final String? cityId;

  /// Price range (CDF) for the price facet. Null = unbounded on that side.
  final String? minPrice;
  final String? maxPrice;

  /// Promotion facet: only products with an active seller-set discount.
  final bool onPromotion;

  /// Pre-encoded JSON of the attribute facet filter (attributeId -> values).
  /// Kept as a String so this param stays value-equatable for the provider
  /// family key (a Map would break ==/hashCode).
  final String? attributesJson;

  /// Comma-separated brand ids for the brand facet (OR within). Kept as a
  /// String so this param stays value-equatable for the provider family key.
  final String? brandIds;

  /// Search-analytics tag: which surface and why. Passive — it changes nothing
  /// about the results.
  ///
  /// DELIBERATELY EXCLUDED from `==` and `hashCode`. This class is the key of a
  /// `StateNotifierProvider.family`, and `BrowseProductsNotifier`'s constructor
  /// fetches. Including a value that varies per interaction (SUBMIT for typing,
  /// SUGGESTION for a chip on the same term) would mint a NEW notifier and a new
  /// network request for each, and Riverpod would keep the old ones alive — an
  /// extra request and a leak, caused purely by telemetry.
  ///
  /// The consequence, accepted: for a given (search, cityId) the tag of the
  /// FIRST fetch wins, because a later identical params object hits the cached
  /// family entry and issues no request at all. That is the correct outcome
  /// anyway — no second request means no second demand row.
  final String? searchIntent;

  const BrowseProductsParams({
    this.categoryId,
    this.search,
    this.condition,
    this.sortBy,
    this.cityId,
    this.minPrice,
    this.maxPrice,
    this.onPromotion = false,
    this.attributesJson,
    this.brandIds,
    this.searchIntent,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is BrowseProductsParams &&
          runtimeType == other.runtimeType &&
          categoryId == other.categoryId &&
          search == other.search &&
          condition == other.condition &&
          sortBy == other.sortBy &&
          cityId == other.cityId &&
          minPrice == other.minPrice &&
          maxPrice == other.maxPrice &&
          onPromotion == other.onPromotion &&
          attributesJson == other.attributesJson &&
          brandIds == other.brandIds;

  @override
  int get hashCode =>
      categoryId.hashCode ^
      search.hashCode ^
      condition.hashCode ^
      sortBy.hashCode ^
      cityId.hashCode ^
      minPrice.hashCode ^
      maxPrice.hashCode ^
      onPromotion.hashCode ^
      attributesJson.hashCode ^
      brandIds.hashCode;

  BrowseProductsParams copyWith({
    String? categoryId,
    String? search,
    String? condition,
    String? sortBy,
    String? cityId,
    String? minPrice,
    String? maxPrice,
    bool? onPromotion,
    String? attributesJson,
    String? brandIds,
    String? searchIntent,
    bool clearCategoryId = false,
    bool clearSearch = false,
    bool clearCondition = false,
    bool clearSortBy = false,
    bool clearCityId = false,
    bool clearPrice = false,
    bool clearAttributes = false,
    bool clearBrandIds = false,
  }) {
    return BrowseProductsParams(
      categoryId: clearCategoryId ? null : (categoryId ?? this.categoryId),
      search: clearSearch ? null : (search ?? this.search),
      condition: clearCondition ? null : (condition ?? this.condition),
      sortBy: clearSortBy ? null : (sortBy ?? this.sortBy),
      cityId: clearCityId ? null : (cityId ?? this.cityId),
      minPrice: clearPrice ? null : (minPrice ?? this.minPrice),
      maxPrice: clearPrice ? null : (maxPrice ?? this.maxPrice),
      onPromotion: onPromotion ?? this.onPromotion,
      attributesJson:
          clearAttributes ? null : (attributesJson ?? this.attributesJson),
      brandIds: clearBrandIds ? null : (brandIds ?? this.brandIds),
      searchIntent: searchIntent ?? this.searchIntent,
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

  /// [intentOverride] lets a caller record the fetch as something other than
  /// the params' own intent — used by [refresh], where re-running the same
  /// search after an error or a pull-to-refresh is not new demand.
  Future<void> loadProducts({String? intentOverride}) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.browseProducts(
        categoryId: _params.categoryId,
        search: _params.search,
        condition: _params.condition,
        sortBy: _params.sortBy,
        cityId: _params.cityId,
        minPrice: _params.minPrice,
        maxPrice: _params.maxPrice,
        onPromotion: _params.onPromotion,
        attributesJson: _params.attributesJson,
        brandIds: _params.brandIds,
        searchSource: 'BUYER_MOBILE',
        // Defaults to SUBMIT so a search that reaches here untagged is still
        // recorded — the screen sets SUGGESTION when the term came from a chip.
        searchIntent: intentOverride ?? _params.searchIntent ?? 'SUBMIT',
      );
      state = state.copyWith(
        products: result.data,
        pagination: result.pagination,
        isLoading: false,
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: extractDioErrorMessage(e),
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Une erreur est survenue. Veuillez réessayer.',
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
        cityId: _params.cityId,
        minPrice: _params.minPrice,
        maxPrice: _params.maxPrice,
        onPromotion: _params.onPromotion,
        attributesJson: _params.attributesJson,
        brandIds: _params.brandIds,
        cursor: state.pagination?.nextCursor,
        searchSource: 'BUYER_MOBILE',
        // Paging through results the buyer already searched for is not a new
        // demand signal. (The API also skips any request carrying a cursor —
        // this is belt and braces, and keeps the intent honest in the log.)
        searchIntent: 'REFINE',
      );
      state = state.copyWith(
        products: [...state.products, ...result.data],
        pagination: result.pagination,
        isLoadingMore: false,
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoadingMore: false,
        error: extractDioErrorMessage(e),
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingMore: false,
        error: 'Une erreur est survenue. Veuillez réessayer.',
      );
    }
  }

  Future<void> refresh() async {
    state = const BrowseProductsState();
    // Pull-to-refresh and the error-retry button re-run a search the buyer
    // already made. Recording it again would inflate demand for whichever terms
    // happen to fail on a flaky connection.
    await loadProducts(intentOverride: 'REFINE');
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

final popularProductsProvider =
    FutureProvider<List<BrowseProductModel>>((ref) async {
  final repository = ref.read(catalogRepositoryProvider);
  final cityId = ref.watch(cityProvider).selectedCity?.id;
  // Backend enum is `popularity` (see browse-products-query.dto.ts).
  // Previously sent `popular` which produced a 400 with message
  // "sortBy must be one of the following values" — surfaced as
  // "Une erreur" on the home screen.
  final result = await repository.browseProducts(
    sortBy: 'popularity',
    limit: 10,
    cityId: cityId,
  );
  return result.data;
});

final newestProductsProvider =
    FutureProvider<List<BrowseProductModel>>((ref) async {
  final repository = ref.read(catalogRepositoryProvider);
  final cityId = ref.watch(cityProvider).selectedCity?.id;
  final result = await repository.browseProducts(
    sortBy: 'newest',
    limit: 20,
    cityId: cityId,
  );
  return result.data;
});

/// Home "Promotions" strip — products with an active seller-set discount.
final promoProductsProvider =
    FutureProvider<List<BrowseProductModel>>((ref) async {
  final repository = ref.read(catalogRepositoryProvider);
  final cityId = ref.watch(cityProvider).selectedCity?.id;
  final result = await repository.browseProducts(
    onPromotion: true,
    limit: 10,
    cityId: cityId,
  );
  return result.data;
});
