import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/providers/seller_refresh_provider.dart';
import '../../auth/presentation/providers/auth_provider.dart';
import 'models/order_model.dart';
import 'models/order_stats.dart';

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

  final void Function()? _onChanged;

  SellerOrdersRepository(this._dio, {void Function()? onChanged})
      : _onChanged = onChanged;

  Future<SellerOrderStats> getOrderStats() async {
    final response = await _dio.get('/v1/sellers/orders/stats');
    return SellerOrderStats.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  SellerOrderModel _changedOrder(Response<dynamic> response) {
    final order = SellerOrderModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
    _onChanged?.call();
    return order;
  }

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
    final body = (response.data as Map<String, dynamic>?) ?? const {};
    final payload = body['data'];
    final itemsRaw = payload is List<dynamic>
        ? payload
        : payload is Map<String, dynamic>
            ? payload['data'] as List<dynamic>? ?? const []
            : const [];
    final meta = payload is Map<String, dynamic>
        ? payload['pagination'] as Map<String, dynamic>? ?? const {}
        : body['pagination'] as Map<String, dynamic>? ??
            body['meta'] as Map<String, dynamic>? ??
            const {};

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
    return _changedOrder(response);
  }

  Future<SellerOrderModel> rejectOrder(String id, String reason) async {
    final response = await _dio.patch(
      '/v1/sellers/orders/$id/reject',
      data: {'reason': reason},
    );
    return _changedOrder(response);
  }

  Future<SellerOrderModel> processOrder(String id) async {
    final response = await _dio.patch('/v1/sellers/orders/$id/process');
    return _changedOrder(response);
  }

  /// Seller's final step — hand the parcel off to Teka. Delivery + cash
  /// collection are driven by Teka/admin after this.
  Future<SellerOrderModel> markReadyForPickup(String id) async {
    final response =
        await _dio.patch('/v1/sellers/orders/$id/ready-for-pickup');
    return _changedOrder(response);
  }
}

final sellerOrdersRepositoryProvider = Provider<SellerOrdersRepository>((ref) {
  ref.watch(authenticatedSellerIdProvider);
  var alive = true;
  ref.onDispose(() => alive = false);
  return SellerOrdersRepository(ref.read(dioProvider), onChanged: () {
    if (alive) ref.read(sellerRefreshProvider.notifier).ordersChanged();
  });
});
