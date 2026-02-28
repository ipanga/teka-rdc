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
}

final checkoutRepositoryProvider = Provider<CheckoutRepository>((ref) {
  return CheckoutRepository(ref.read(dioProvider));
});
