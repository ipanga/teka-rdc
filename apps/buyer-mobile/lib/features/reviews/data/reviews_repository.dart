import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/review_model.dart';

class PaginatedReviewsResponse {
  final List<ReviewModel> data;
  final int page;
  final int limit;
  final int total;
  final int totalPages;

  const PaginatedReviewsResponse({
    required this.data,
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });
}

class ReviewsRepository {
  final Dio _dio;

  ReviewsRepository(this._dio);

  Future<PaginatedReviewsResponse> getProductReviews(
    String productId, {
    int page = 1,
    int limit = 10,
    String sort = 'newest',
  }) async {
    final response = await _dio.get(
      '/v1/reviews/products/$productId',
      queryParameters: {
        'page': page,
        'limit': limit,
        'sort': sort,
      },
    );
    final responseData = response.data;

    final List<dynamic> rawList;
    final int total;
    final int totalPages;

    if (responseData is Map && responseData['data'] != null) {
      rawList = responseData['data'] as List;
      final meta = responseData['meta'] as Map<String, dynamic>?;
      total = meta?['total'] as int? ?? rawList.length;
      totalPages = meta?['totalPages'] as int? ?? 1;
    } else if (responseData is List) {
      rawList = responseData;
      total = rawList.length;
      totalPages = 1;
    } else {
      rawList = [];
      total = 0;
      totalPages = 1;
    }

    return PaginatedReviewsResponse(
      data: rawList
          .map((e) => ReviewModel.fromJson(e as Map<String, dynamic>))
          .toList(),
      page: page,
      limit: limit,
      total: total,
      totalPages: totalPages,
    );
  }

  Future<ReviewStatsModel> getReviewStats(String productId) async {
    final response = await _dio.get('/v1/reviews/products/$productId/stats');
    final responseData = response.data;

    final Map<String, dynamic> statsJson;
    if (responseData is Map && responseData['data'] != null) {
      statsJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      statsJson = Map<String, dynamic>.from(responseData);
    } else {
      statsJson = {};
    }

    return ReviewStatsModel.fromJson(statsJson);
  }

  Future<ReviewModel?> getMyReview(String productId) async {
    try {
      final response = await _dio.get('/v1/reviews/products/$productId/mine');
      final responseData = response.data;

      if (responseData is Map && responseData['data'] != null) {
        return ReviewModel.fromJson(
            responseData['data'] as Map<String, dynamic>);
      }
      if (responseData is Map &&
          responseData['id'] != null) {
        return ReviewModel.fromJson(Map<String, dynamic>.from(responseData));
      }
      return null;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<CanReviewModel> canReview(String productId) async {
    final response = await _dio.get(
      '/v1/reviews/products/$productId/can-review',
    );
    final responseData = response.data;

    final Map<String, dynamic> json;
    if (responseData is Map && responseData['data'] != null) {
      json = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      json = Map<String, dynamic>.from(responseData);
    } else {
      json = {'canReview': false};
    }

    return CanReviewModel.fromJson(json);
  }

  Future<ReviewModel> createReview({
    required String productId,
    required String orderId,
    required int rating,
    String? text,
  }) async {
    final response = await _dio.post(
      '/v1/reviews',
      data: {
        'productId': productId,
        'orderId': orderId,
        'rating': rating,
        if (text != null && text.isNotEmpty) 'text': text,
      },
    );
    final responseData = response.data;

    final Map<String, dynamic> reviewJson;
    if (responseData is Map && responseData['data'] != null) {
      reviewJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      reviewJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid review response');
    }

    return ReviewModel.fromJson(reviewJson);
  }

  Future<void> deleteReview(String id) async {
    await _dio.delete('/v1/reviews/$id');
  }
}

final reviewsRepositoryProvider = Provider<ReviewsRepository>((ref) {
  return ReviewsRepository(ref.read(dioProvider));
});
