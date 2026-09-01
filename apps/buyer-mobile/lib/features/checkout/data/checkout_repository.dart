import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/checkout_model.dart';

class CheckoutRepository {
  final Dio _dio;

  CheckoutRepository(this._dio);

  Future<CheckoutResponse> checkout(CheckoutRequest request) async {
    final response = await _dio.post(
      '/v1/checkout',
      data: request.toJson(),
    );
    final responseData = response.data;

    final Map<String, dynamic> resultJson;
    if (responseData is Map && responseData['data'] != null) {
      resultJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      resultJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid checkout response');
    }

    return CheckoutResponse.fromJson(resultJson);
  }

  /// Preview the delivery fee + totals for [deliveryAddressId] before placing
  /// the order. Uses the same server-side calc as checkout, so the previewed
  /// fee equals what the order is charged.
  Future<CheckoutQuote> getQuote(String deliveryAddressId) async {
    final response = await _dio.post(
      '/v1/checkout/quote',
      data: {'deliveryAddressId': deliveryAddressId},
    );
    final responseData = response.data;

    final Map<String, dynamic> resultJson;
    if (responseData is Map && responseData['data'] != null) {
      resultJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      resultJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid checkout quote response');
    }

    return CheckoutQuote.fromJson(resultJson);
  }

  Future<List<AddressModel>> getAddresses() async {
    final response = await _dio.get('/v1/addresses');
    final responseData = response.data;

    final List<dynamic> rawList;
    if (responseData is Map && responseData['data'] != null) {
      rawList = responseData['data'] as List;
    } else if (responseData is List) {
      rawList = responseData;
    } else {
      rawList = [];
    }

    return rawList
        .map((e) => AddressModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<AddressModel> createAddress(Map<String, dynamic> data) async {
    final response = await _dio.post('/v1/addresses', data: data);
    final responseData = response.data;

    final Map<String, dynamic> resultJson;
    if (responseData is Map && responseData['data'] != null) {
      resultJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      resultJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid create address response');
    }

    return AddressModel.fromJson(resultJson);
  }

  /// Edit the buyer's address in place. Not retry-safe (state mutation), so it
  /// deliberately does not opt into the retry interceptor.
  Future<AddressModel> updateAddress(
    String id,
    Map<String, dynamic> data,
  ) async {
    final response = await _dio.patch('/v1/addresses/$id', data: data);
    final body = response.data as Map<String, dynamic>;
    final payload = body['data'] ?? body;
    return AddressModel.fromJson(payload as Map<String, dynamic>);
  }

  Future<AddressModel> setDefaultAddress(String id) async {
    final response = await _dio.patch('/v1/addresses/$id/default');
    final responseData = response.data;

    final Map<String, dynamic> resultJson;
    if (responseData is Map && responseData['data'] != null) {
      resultJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      resultJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid default address response');
    }

    return AddressModel.fromJson(resultJson);
  }

  Future<void> deleteAddress(String id) async {
    await _dio.delete('/v1/addresses/$id');
  }
}

final checkoutRepositoryProvider = Provider<CheckoutRepository>((ref) {
  return CheckoutRepository(ref.read(dioProvider));
});
