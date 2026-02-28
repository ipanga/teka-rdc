import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/order_model.dart';

class PaginatedOrdersResponse {
  final List<SellerOrderModel> items;
  final int total;
  final int page;
  final int limit;

  const PaginatedOrdersResponse({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  bool get hasMore => page * limit < total;
}

class SellerOrdersRepository {
  final Dio _dio;

  SellerOrdersRepository(this._dio);

  Future<PaginatedOrdersResponse> getOrders({
    int page = 1,
    int limit = 20,
    String? status,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (status != null && status.isNotEmpty) {
      queryParams['status'] = status;
    }

    final response = await _dio.get(
      '/v1/sellers/orders',
      queryParameters: queryParams,
    );
    final data = response.data;
    final itemsRaw = data['data'] as List<dynamic>? ?? [];
    final meta = data['meta'] as Map<String, dynamic>? ?? {};

    final items = itemsRaw
        .map((e) => SellerOrderModel.fromJson(e as Map<String, dynamic>))
        .toList();

    return PaginatedOrdersResponse(
      items: items,
      total: meta['total'] as int? ?? items.length,
      page: meta['page'] as int? ?? page,
      limit: meta['limit'] as int? ?? limit,
    );
  }

  Future<SellerOrderModel> getOrderById(String id) async {
    final response = await _dio.get('/v1/sellers/orders/$id');
    return SellerOrderModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerOrderModel> confirmOrder(String id) async {
    final response = await _dio.patch('/v1/sellers/orders/$id/confirm');
    return SellerOrderModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerOrderModel> rejectOrder(String id, String reason) async {
    final response = await _dio.patch(
      '/v1/sellers/orders/$id/reject',
      data: {'reason': reason},
    );
    return SellerOrderModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerOrderModel> processOrder(String id) async {
    final response = await _dio.patch('/v1/sellers/orders/$id/process');
    return SellerOrderModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerOrderModel> shipOrder(String id) async {
    final response = await _dio.patch('/v1/sellers/orders/$id/ship');
    return SellerOrderModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerOrderModel> markOutForDelivery(String id) async {
    final response =
        await _dio.patch('/v1/sellers/orders/$id/out-for-delivery');
    return SellerOrderModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerOrderModel> deliverOrder(String id) async {
    final response = await _dio.patch('/v1/sellers/orders/$id/deliver');
    return SellerOrderModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }
}

final sellerOrdersRepositoryProvider =
    Provider<SellerOrdersRepository>((ref) {
  return SellerOrdersRepository(ref.read(dioProvider));
});
