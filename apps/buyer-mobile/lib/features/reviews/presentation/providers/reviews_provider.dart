import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../data/models/review_model.dart';
import '../../data/reviews_repository.dart';

class ReviewsState {
  final List<ReviewModel> reviews;
  final ReviewStatsModel? stats;
  final ReviewModel? myReview;
  final CanReviewModel? canReviewResult;
  final bool isLoading;
  final bool isSubmitting;
  final String? error;
  final int page;
  final int totalPages;

  const ReviewsState({
    this.reviews = const [],
    this.stats,
    this.myReview,
    this.canReviewResult,
    this.isLoading = false,
    this.isSubmitting = false,
    this.error,
    this.page = 1,
    this.totalPages = 1,
  });

  ReviewsState copyWith({
    List<ReviewModel>? reviews,
    ReviewStatsModel? stats,
    ReviewModel? myReview,
    CanReviewModel? canReviewResult,
    bool? isLoading,
    bool? isSubmitting,
    String? error,
    int? page,
    int? totalPages,
    bool clearError = false,
    bool clearMyReview = false,
  }) {
    return ReviewsState(
      reviews: reviews ?? this.reviews,
      stats: stats ?? this.stats,
      myReview: clearMyReview ? null : (myReview ?? this.myReview),
      canReviewResult: canReviewResult ?? this.canReviewResult,
      isLoading: isLoading ?? this.isLoading,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      error: clearError ? null : (error ?? this.error),
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
    );
  }

  bool get hasNextPage => page < totalPages;
}

class ReviewsNotifier extends StateNotifier<ReviewsState> {
  final ReviewsRepository _repository;
  final String _productId;

  ReviewsNotifier(this._repository, this._productId)
      : super(const ReviewsState()) {
    _init();
  }

  /// Re-runs the initial load. Used by the retry affordance on the product
  /// detail reviews section.
  Future<void> refresh() => _init();

  Future<void> _init() async {
    state = state.copyWith(isLoading: true, clearError: true);

    // The four calls are loaded independently. A single Future.wait used to
    // fail them all together, so an auth-only failure (canReview for a guest)
    // or a per-endpoint failure blanked the entire section. Only a failure of
    // the core data — the reviews list or the stats — is surfaced as an error.
    Object? coreError;
    Future<T?> attempt<T>(Future<T> Function() call, {bool core = false}) async {
      try {
        return await call();
      } catch (e) {
        if (core) coreError ??= e;
        return null;
      }
    }

    // Explicit type arguments: without them Dart infers T from the
    // Future.wait<Object?> context and getMyReview's nullable return no longer
    // fits.
    final results = await Future.wait<Object?>([
      attempt<PaginatedReviewsResponse>(
        () => _repository.getProductReviews(_productId),
        core: true,
      ),
      attempt<ReviewStatsModel>(
        () => _repository.getReviewStats(_productId),
        core: true,
      ),
      attempt<CanReviewModel>(() => _repository.canReview(_productId)),
      attempt<ReviewModel?>(() => _repository.getMyReview(_productId)),
    ]);

    if (!mounted) return;

    final reviewsResult = results[0] as PaginatedReviewsResponse?;
    final statsResult = results[1] as ReviewStatsModel?;
    final canReviewResult = results[2] as CanReviewModel?;
    final myReviewResult = results[3] as ReviewModel?;

    final error = coreError == null
        ? null
        : (coreError is DioException
            ? extractDioErrorMessage(coreError as DioException)
            : friendlyErrorMessage(coreError!));

    state = state.copyWith(
      reviews: reviewsResult?.data,
      stats: statsResult,
      canReviewResult: canReviewResult,
      myReview: myReviewResult,
      page: reviewsResult?.page,
      totalPages: reviewsResult?.totalPages,
      isLoading: false,
      error: error,
      clearError: error == null,
    );
  }

  Future<void> loadReviews({int? page}) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.getProductReviews(
        _productId,
        page: page ?? state.page,
      );
      if (!mounted) return;
      state = state.copyWith(
        reviews: result.data,
        page: result.page,
        totalPages: result.totalPages,
        isLoading: false,
      );
    } on DioException catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: extractDioErrorMessage(e),
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: friendlyErrorMessage(e),
      );
    }
  }

  Future<void> loadStats() async {
    try {
      final stats = await _repository.getReviewStats(_productId);
      if (!mounted) return;
      state = state.copyWith(stats: stats);
    } catch (_) {
      // Stats loading failure is non-critical
    }
  }

  Future<void> checkCanReview() async {
    try {
      final result = await _repository.canReview(_productId);
      if (!mounted) return;
      state = state.copyWith(canReviewResult: result);
    } catch (_) {
      // Non-critical
    }
  }

  Future<bool> submitReview({
    required String orderId,
    required int rating,
    required String title,
    String? text,
  }) async {
    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final review = await _repository.createReview(
        productId: _productId,
        orderId: orderId,
        rating: rating,
        title: title,
        text: text,
      );
      if (!mounted) return true;

      // Reload stats and reviews
      final statsResult = await _repository.getReviewStats(_productId);
      final reviewsResult = await _repository.getProductReviews(_productId);
      if (!mounted) return true;

      state = state.copyWith(
        myReview: review,
        stats: statsResult,
        reviews: reviewsResult.data,
        page: reviewsResult.page,
        totalPages: reviewsResult.totalPages,
        isSubmitting: false,
        canReviewResult: const CanReviewModel(
          canReview: false,
          reason: 'ALREADY_REVIEWED',
        ),
      );
      return true;
    } on DioException catch (e) {
      if (!mounted) return false;
      state = state.copyWith(
        isSubmitting: false,
        error: extractDioErrorMessage(e),
      );
      return false;
    } catch (e) {
      if (!mounted) return false;
      state = state.copyWith(
        isSubmitting: false,
        error: friendlyErrorMessage(e),
      );
      return false;
    }
  }

  /// Edits the buyer's own review IN PLACE. Never creates a second review —
  /// the API locates the row by id and enforces ownership, and the
  /// buyer+product uniqueness constraint would reject a duplicate anyway.
  ///
  /// Moderation status is preserved server-side: a HIDDEN review stays hidden
  /// after an edit, so editing cannot launder moderated content.
  Future<bool> updateReview({
    required String reviewId,
    required int rating,
    required String title,
    String? text,
  }) async {
    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final review = await _repository.updateReview(
        reviewId: reviewId,
        rating: rating,
        title: title,
        text: text,
      );
      if (!mounted) return true;

      // Refresh the aggregates + list: a rating change moves the average, and
      // the edited body must replace the stale copy in the list.
      final statsResult = await _repository.getReviewStats(_productId);
      final reviewsResult = await _repository.getProductReviews(_productId);
      if (!mounted) return true;

      state = state.copyWith(
        myReview: review,
        stats: statsResult,
        reviews: reviewsResult.data,
        page: reviewsResult.page,
        totalPages: reviewsResult.totalPages,
        isSubmitting: false,
      );
      return true;
    } on DioException catch (e) {
      if (!mounted) return false;
      state = state.copyWith(
        isSubmitting: false,
        error: extractDioErrorMessage(e),
      );
      return false;
    } catch (e) {
      if (!mounted) return false;
      state = state.copyWith(
        isSubmitting: false,
        error: friendlyErrorMessage(e),
      );
      return false;
    }
  }

  Future<bool> deleteReview(String reviewId) async {
    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      await _repository.deleteReview(reviewId);
      if (!mounted) return true;

      // Reload stats and reviews
      final statsResult = await _repository.getReviewStats(_productId);
      final reviewsResult = await _repository.getProductReviews(_productId);
      final canReviewResult = await _repository.canReview(_productId);
      if (!mounted) return true;

      state = state.copyWith(
        clearMyReview: true,
        stats: statsResult,
        reviews: reviewsResult.data,
        page: reviewsResult.page,
        totalPages: reviewsResult.totalPages,
        canReviewResult: canReviewResult,
        isSubmitting: false,
      );
      return true;
    } on DioException catch (e) {
      if (!mounted) return false;
      state = state.copyWith(
        isSubmitting: false,
        error: extractDioErrorMessage(e),
      );
      return false;
    } catch (e) {
      if (!mounted) return false;
      state = state.copyWith(
        isSubmitting: false,
        error: friendlyErrorMessage(e),
      );
      return false;
    }
  }

}

final reviewsProvider = StateNotifierProvider.family<ReviewsNotifier,
    ReviewsState, String>(
  (ref, productId) {
    final repository = ref.read(reviewsRepositoryProvider);
    return ReviewsNotifier(repository, productId);
  },
);
