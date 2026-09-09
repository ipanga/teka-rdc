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
    return SellerWallet.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<PaginatedEarningsResponse> getEarnings({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get(
      '/v1/sellers/earnings',
      queryParameters: {'page': page, 'limit': limit},
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
        .map((e) => PayoutModel.fromJson(e as Map<String, dynamic>))
        .toList();

    return PaginatedPayoutsResponse(
      items: items,
      total: meta['total'] as int? ?? items.length,
      page: meta['page'] as int? ?? page,
      limit: meta['limit'] as int? ?? limit,
    );
  }

  /// One of the seller's own payouts. The API scopes by owner: a foreign,
  /// deleted or malformed id is a French 404 that the caller shows verbatim.
  Future<PayoutModel> getPayout(String payoutId) async {
    final response = await _dio.get('/v1/sellers/payouts/$payoutId');
    return PayoutModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  /// POST /v1/sellers/payouts with an EMPTY body (S12): the API snapshots the
  /// SAVED destination itself — sending one inline would be refused with a
  /// 409 when it differs. Not retryable (it moves money).
  Future<PayoutModel> requestPayout() async {
    final response = await _dio.post(
      '/v1/sellers/payouts',
      data: const <String, dynamic>{},
    );
    return PayoutModel.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  /// GET /v1/sellers/payout-method — the saved reusable destination (B1) and
  /// its cooling-off (S12).
  Future<SellerPayoutMethod> getPayoutMethod() async {
    final response = await _dio.get('/v1/sellers/payout-method');
    return SellerPayoutMethod.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  /// PATCH /v1/sellers/payout-method — save/update the destination (B1).
  ///
  /// S12: a real change needs the seller's CURRENT login [password]; the
  /// API answers 400 without it, 403 « Mot de passe invalide. » when wrong,
  /// 429 after five attempts per hour. The password is sent in this one
  /// request body and nowhere else — never logged (the Dio chain logs no
  /// bodies), never kept. Not retryable (every attempt counts server-side).
  Future<SellerPayoutMethod> updatePayoutMethod({
    required String payoutMethod,
    required String payoutPhone,
    String? password,
  }) async {
    final response = await _dio.patch(
      '/v1/sellers/payout-method',
      data: {
        'payoutMethod': payoutMethod,
        'payoutPhone': payoutPhone,
        if (password != null) 'password': password,
      },
    );
    return SellerPayoutMethod.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }
}

final earningsRepositoryProvider = Provider<EarningsRepository>((ref) {
  return EarningsRepository(ref.read(dioProvider));
});
