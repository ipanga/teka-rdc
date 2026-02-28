import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/order_model.dart';

class OrdersRepository {
  final Dio _dio;

  OrdersRepository(this._dio);

  Future<({List<OrderModel> orders, int total, int totalPages})> getOrders({
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
      '/v1/orders',
      queryParameters: queryParams,
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
    } else if (responseData is Map && responseData['orders'] != null) {
      rawList = responseData['orders'] as List;
      total = responseData['total'] as int? ?? rawList.length;
      totalPages = responseData['totalPages'] as int? ?? 1;
    } else if (responseData is List) {
      rawList = responseData;
      total = rawList.length;
      totalPages = 1;
    } else {
      rawList = [];
      total = 0;
      totalPages = 1;
    }

    final orders = rawList
        .map((e) => OrderModel.fromJson(e as Map<String, dynamic>))
        .toList();

    return (orders: orders, total: total, totalPages: totalPages);
  }

  Future<OrderModel> getOrderById(String id) async {
    final response = await _dio.get('/v1/orders/$id');
    final responseData = response.data;

    final Map<String, dynamic> orderJson;
    if (responseData is Map && responseData['data'] != null) {
      orderJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      orderJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid order response');
    }

    return OrderModel.fromJson(orderJson);
  }

  Future<void> cancelOrder(String id, {String? reason}) async {
    final data = <String, dynamic>{};
    if (reason != null && reason.isNotEmpty) {
      data['reason'] = reason;
    }
    await _dio.post('/v1/orders/$id/cancel', data: data);
  }
}

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) {
  return OrdersRepository(ref.read(dioProvider));
});
