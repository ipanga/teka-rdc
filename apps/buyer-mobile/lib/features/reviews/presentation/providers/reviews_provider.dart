import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  Future<void> _init() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final results = await Future.wait([
        _repository.getProductReviews(_productId),
        _repository.getReviewStats(_productId),
        _repository.canReview(_productId),
        _repository.getMyReview(_productId),
      ]);

      if (!mounted) return;

      final reviewsResult = results[0] as PaginatedReviewsResponse;
      final statsResult = results[1] as ReviewStatsModel;
      final canReviewResult = results[2] as CanReviewModel;
      final myReviewResult = results[3] as ReviewModel?;

      state = state.copyWith(
        reviews: reviewsResult.data,
        stats: statsResult,
        canReviewResult: canReviewResult,
        myReview: myReviewResult,
        page: reviewsResult.page,
        totalPages: reviewsResult.totalPages,
        isLoading: false,
      );
    } on DioException catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: _extractErrorMessage(e),
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
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
        error: _extractErrorMessage(e),
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
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
    String? text,
  }) async {
    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final review = await _repository.createReview(
        productId: _productId,
        orderId: orderId,
        rating: rating,
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
        error: _extractErrorMessage(e),
      );
      return false;
    } catch (e) {
      if (!mounted) return false;
      state = state.copyWith(
        isSubmitting: false,
        error: e.toString(),
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
        error: _extractErrorMessage(e),
      );
      return false;
    } catch (e) {
      if (!mounted) return false;
      state = state.copyWith(
        isSubmitting: false,
        error: e.toString(),
      );
      return false;
    }
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

final reviewsProvider = StateNotifierProvider.family<ReviewsNotifier,
    ReviewsState, String>(
  (ref, productId) {
    final repository = ref.read(reviewsRepositoryProvider);
    return ReviewsNotifier(repository, productId);
  },
);
