import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/flash_deal_model.dart';

class FlashDealRepository {
  final Dio _dio;

  FlashDealRepository(this._dio);

  Future<List<FlashDealModel>> getFlashDeals() async {
    final response = await _dio.get('/v1/browse/flash-deals');
    final responseData = response.data;

    final List<dynamic> rawList;
    if (responseData is Map && responseData['data'] != null) {
      rawList = responseData['data'] as List;
    } else if (responseData is List) {
      rawList = responseData;
    } else {
      rawList = [];
    }

    final deals = rawList
        .map((e) => FlashDealModel.fromJson(e as Map<String, dynamic>))
        .toList();

    // Only return active deals
    return deals.where((deal) => deal.isActive).toList();
  }
}

final flashDealRepositoryProvider = Provider<FlashDealRepository>((ref) {
  return FlashDealRepository(ref.read(dioProvider));
});
