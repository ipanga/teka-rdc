import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/city_model.dart';
import 'models/commune_model.dart';

class CityRepository {
  final Dio _dio;

  CityRepository(this._dio);

  Future<List<CityModel>> getCities() async {
    final response = await _dio.get('/v1/cities');
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
        .map((e) => CityModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<CommuneModel>> getCommunes(String cityId) async {
    final response = await _dio.get('/v1/cities/$cityId/communes');
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
        .map((e) => CommuneModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

final cityRepositoryProvider = Provider<CityRepository>((ref) {
  return CityRepository(ref.read(dioProvider));
});
