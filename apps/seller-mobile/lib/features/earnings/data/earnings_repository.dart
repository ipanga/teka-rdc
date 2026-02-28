import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/earning_model.dart';

class PaginatedEarningsResponse {
  final List<SellerEarningModel> items;
  final int total;
  final int page;
  final int limit;

  const PaginatedEarningsResponse({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  bool get hasMore => page * limit < total;
}

class PaginatedPayoutsResponse {
  final List<PayoutModel> items;
  final int total;
  final int page;
  final int limit;

  const PaginatedPayoutsResponse({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  bool get hasMore => page * limit < total;
}

class EarningsRepository {
  final Dio _dio;

  EarningsRepository(this._dio);

  Future<SellerWallet> getWallet() async {
    final response = await _dio.get('/v1/sellers/wallet');
    return SellerWallet.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<PaginatedEarningsResponse> getEarnings({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get(
      '/v1/sellers/earnings',
      queryParameters: {'page': page, 'limit': limit},
    );
    final data = response.data;
    final itemsRaw = data['data'] as List<dynamic>? ?? [];
    final meta = data['meta'] as Map<String, dynamic>? ?? {};

    final items = itemsRaw
        .map((e) => SellerEarningModel.fromJson(e as Map<String, dynamic>))
        .toList();

    return PaginatedEarningsResponse(
      items: items,
      total: meta['total'] as int? ?? items.length,
      page: meta['page'] as int? ?? page,
      limit: meta['limit'] as int? ?? limit,
    );
  }

  Future<PaginatedPayoutsResponse> getPayouts({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get(
      '/v1/sellers/payouts',
      queryParameters: {'page': page, 'limit': limit},
    );
    final data = response.data;
    final itemsRaw = data['data'] as List<dynamic>? ?? [];
    final meta = data['meta'] as Map<String, dynamic>? ?? {};

    final items = itemsRaw
        .map((e) => PayoutModel.fromJson(e as Map<String, dynamic>))
        .toList();

    return PaginatedPayoutsResponse(
      items: items,
      total: meta['total'] as int? ?? items.length,
      page: meta['page'] as int? ?? page,
      limit: meta['limit'] as int? ?? limit,
    );
  }

  Future<PayoutModel> requestPayout({
    required String payoutMethod,
    required String payoutPhone,
  }) async {
    final response = await _dio.post(
      '/v1/sellers/payouts',
      data: {
        'payoutMethod': payoutMethod,
        'payoutPhone': payoutPhone,
      },
    );
    return PayoutModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }
}

final earningsRepositoryProvider = Provider<EarningsRepository>((ref) {
  return EarningsRepository(ref.read(dioProvider));
});
