import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/review_model.dart';

class PaginatedReviewsResponse {
  final List<ReviewModel> items;
  final int total;
  final int page;
  final int limit;

  const PaginatedReviewsResponse({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  bool get hasMore => page * limit < total;
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
    final data = response.data;
    final itemsRaw = data['data'] as List<dynamic>? ?? [];
    final meta = data['meta'] as Map<String, dynamic>? ?? {};

    final items = itemsRaw
        .map((e) => ReviewModel.fromJson(e as Map<String, dynamic>))
        .toList();

    return PaginatedReviewsResponse(
      items: items,
      total: meta['total'] as int? ?? items.length,
      page: meta['page'] as int? ?? page,
      limit: meta['limit'] as int? ?? limit,
    );
  }

  Future<ReviewStatsModel> getReviewStats(String productId) async {
    final response = await _dio.get(
      '/v1/reviews/products/$productId/stats',
    );
    return ReviewStatsModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }
}

final reviewsRepositoryProvider = Provider<ReviewsRepository>((ref) {
  return ReviewsRepository(ref.read(dioProvider));
});
