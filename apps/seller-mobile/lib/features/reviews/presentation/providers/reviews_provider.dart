import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../products/data/models/product_model.dart';
import '../../../products/data/products_repository.dart';
import '../../data/models/review_model.dart';
import '../../data/reviews_repository.dart';

class SellerReviewsState {
  final String? selectedProductId;
  final List<SellerProductModel> products;
  final List<ReviewModel> reviews;
  final ReviewStatsModel? stats;
  final bool isLoadingProducts;
  final bool isLoadingReviews;
  final bool isLoadingMore;
  final String? error;
  final int page;
  final int total;
  final int limit;

  const SellerReviewsState({
    this.selectedProductId,
    this.products = const [],
    this.reviews = const [],
    this.stats,
    this.isLoadingProducts = false,
    this.isLoadingReviews = false,
    this.isLoadingMore = false,
    this.error,
    this.page = 1,
    this.total = 0,
    this.limit = 10,
  });

  bool get hasMore => page * limit < total;

  SellerReviewsState copyWith({
    String? selectedProductId,
    List<SellerProductModel>? products,
    List<ReviewModel>? reviews,
    ReviewStatsModel? stats,
    bool? isLoadingProducts,
    bool? isLoadingReviews,
    bool? isLoadingMore,
    String? error,
    int? page,
    int? total,
    int? limit,
    bool clearError = false,
    bool clearStats = false,
    bool clearSelectedProduct = false,
  }) {
    return SellerReviewsState(
      selectedProductId: clearSelectedProduct
          ? null
          : (selectedProductId ?? this.selectedProductId),
      products: products ?? this.products,
      reviews: reviews ?? this.reviews,
      stats: clearStats ? null : (stats ?? this.stats),
      isLoadingProducts: isLoadingProducts ?? this.isLoadingProducts,
      isLoadingReviews: isLoadingReviews ?? this.isLoadingReviews,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
      page: page ?? this.page,
      total: total ?? this.total,
      limit: limit ?? this.limit,
    );
  }
}

class SellerReviewsNotifier extends StateNotifier<SellerReviewsState> {
  final ReviewsRepository _reviewsRepository;
  final ProductsRepository _productsRepository;

  SellerReviewsNotifier(this._reviewsRepository, this._productsRepository)
      : super(const SellerReviewsState()) {
    loadProducts();
  }

  Future<void> loadProducts() async {
    state = state.copyWith(isLoadingProducts: true, clearError: true);
    try {
      final result = await _productsRepository.getProducts(
        page: 1,
        limit: 100,
        status: 'ACTIVE',
      );
      if (mounted) {
        state = state.copyWith(
          products: result.items,
          isLoadingProducts: false,
        );
        // Auto-select first product if none selected
        if (state.selectedProductId == null && result.items.isNotEmpty) {
          selectProduct(result.items.first.id);
        }
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(
          isLoadingProducts: false,
          error: e.toString(),
        );
      }
    }
  }

  void selectProduct(String productId) {
    if (productId == state.selectedProductId) return;
    state = state.copyWith(
      selectedProductId: productId,
      reviews: [],
      page: 1,
      total: 0,
      clearStats: true,
    );
    loadReviews();
    loadStats();
  }

  Future<void> loadReviews() async {
    final productId = state.selectedProductId;
    if (productId == null) return;

    state = state.copyWith(isLoadingReviews: true, clearError: true);
    try {
      final result = await _reviewsRepository.getProductReviews(
        productId,
        page: 1,
        limit: state.limit,
      );
      if (mounted) {
        state = state.copyWith(
          reviews: result.items,
          page: 1,
          total: result.total,
          isLoadingReviews: false,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(
          isLoadingReviews: false,
          error: e.toString(),
        );
      }
    }
  }

  Future<void> loadMoreReviews() async {
    final productId = state.selectedProductId;
    if (productId == null || state.isLoadingMore || !state.hasMore) return;

    state = state.copyWith(isLoadingMore: true);
    try {
      final nextPage = state.page + 1;
      final result = await _reviewsRepository.getProductReviews(
        productId,
        page: nextPage,
        limit: state.limit,
      );
      if (mounted) {
        state = state.copyWith(
          reviews: [...state.reviews, ...result.items],
          page: nextPage,
          total: result.total,
          isLoadingMore: false,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(isLoadingMore: false);
      }
    }
  }

  Future<void> loadStats() async {
    final productId = state.selectedProductId;
    if (productId == null) return;

    try {
      final stats = await _reviewsRepository.getReviewStats(productId);
      if (mounted) {
        state = state.copyWith(stats: stats);
      }
    } catch (_) {
      // Stats load failure is non-critical
    }
  }

  Future<void> refresh() async {
    await loadReviews();
    await loadStats();
  }
}

final sellerReviewsProvider =
    StateNotifierProvider<SellerReviewsNotifier, SellerReviewsState>((ref) {
  return SellerReviewsNotifier(
    ref.read(reviewsRepositoryProvider),
    ref.read(productsRepositoryProvider),
  );
});
