import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/promotion_model.dart';

class PaginatedPromotionsResponse {
  final List<PromotionModel> items;
  final int total;
  final int page;
  final int limit;

  const PaginatedPromotionsResponse({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  bool get hasMore => page * limit < total;
}

class PromotionRepository {
  final Dio _dio;

  PromotionRepository(this._dio);

  Future<PaginatedPromotionsResponse> getPromotions({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get(
      '/v1/sellers/promotions',
      queryParameters: {
        'page': page,
        'limit': limit,
      },
    );
    final data = response.data;
    final itemsRaw = data['data'] as List<dynamic>? ?? [];
    final meta = data['meta'] as Map<String, dynamic>? ?? {};

    final items = itemsRaw
        .map((e) => PromotionModel.fromJson(e as Map<String, dynamic>))
        .toList();

    return PaginatedPromotionsResponse(
      items: items,
      total: meta['total'] as int? ?? items.length,
      page: meta['page'] as int? ?? page,
      limit: meta['limit'] as int? ?? limit,
    );
  }

  Future<PromotionModel> createPromotion(Map<String, dynamic> data) async {
    final response = await _dio.post(
      '/v1/sellers/promotions',
      data: data,
    );
    return PromotionModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<void> cancelPromotion(String id) async {
    await _dio.delete('/v1/sellers/promotions/$id');
  }
}

final promotionRepositoryProvider = Provider<PromotionRepository>((ref) {
  return PromotionRepository(ref.read(dioProvider));
});
