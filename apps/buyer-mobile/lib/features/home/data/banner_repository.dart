import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/banner_model.dart';

class BannerRepository {
  final Dio _dio;

  BannerRepository(this._dio);

  Future<List<BannerModel>> getBanners() async {
    final response = await _dio.get('/v1/browse/banners');
    final responseData = response.data;

    final List<dynamic> rawList;
    if (responseData is Map && responseData['data'] != null) {
      rawList = responseData['data'] as List;
    } else if (responseData is List) {
      rawList = responseData;
    } else {
      rawList = [];
    }

    final banners = rawList
        .map((e) => BannerModel.fromJson(e as Map<String, dynamic>))
        .toList();

    // Sort by sortOrder
    banners.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    return banners;
  }
}

final bannerRepositoryProvider = Provider<BannerRepository>((ref) {
  return BannerRepository(ref.read(dioProvider));
});
