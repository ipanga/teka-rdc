import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/order_model.dart';

/// Extracts the order list + pagination from the API envelope. The orders-list
/// endpoint emits `{ success, data: { data: [...], pagination: {...} } }`, so
/// the array lives at `data.data`. Tolerant of a single-wrap `{ data: [...] }`,
/// a legacy `{ orders: [...] }`, or a bare array. Pure → unit-tested.
({List<dynamic> rawList, int total, int totalPages}) parseOrdersEnvelope(
  dynamic responseData,
) {
  final payload = responseData is Map ? responseData['data'] : responseData;

  if (payload is Map && payload['data'] is List) {
    final list = payload['data'] as List;
    final pg = payload['pagination'] as Map<String, dynamic>?;
    return (
      rawList: list,
      total: pg?['total'] as int? ?? list.length,
      totalPages: pg?['totalPages'] as int? ?? 1,
    );
  } else if (payload is List) {
    return (rawList: payload, total: payload.length, totalPages: 1);
  } else if (payload is Map && payload['orders'] is List) {
    final list = payload['orders'] as List;
    return (
      rawList: list,
      total: payload['total'] as int? ?? list.length,
      totalPages: payload['totalPages'] as int? ?? 1,
    );
  }
  return (rawList: const [], total: 0, totalPages: 1);
}

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
    final parsed = parseOrdersEnvelope(response.data);
    final orders = parsed.rawList
        .map((e) => OrderModel.fromJson(e as Map<String, dynamic>))
        .toList();

    return (orders: orders, total: parsed.total, totalPages: parsed.totalPages);
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

  /// Request a return on a delivered order (within the 2-day window).
  Future<void> requestReturn(String id, String reason) async {
    await _dio.post('/v1/orders/$id/return', data: {'reason': reason});
  }
}

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) {
  return OrdersRepository(ref.read(dioProvider));
});
