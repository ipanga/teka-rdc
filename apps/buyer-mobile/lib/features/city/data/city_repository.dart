import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/city_model.dart';
import 'models/commune_model.dart';

class CityRepository {
  final Dio _dio;

  CityRepository(this._dio);

  Future<List<CityModel>> getCities() async {
    try {
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
    } on DioException {
      return _fallbackCities;
    }
  }

  /// PATCH /v1/users/me/preferred-city — persist the buyer's selected town to
  /// their profile so it follows them across devices (Town Architecture
  /// Refactor). `cityId: null` clears it. Auth-guarded; callers fire-and-forget.
  Future<void> setPreferredCity(String? cityId) async {
    await _dio.patch(
      '/v1/users/me/preferred-city',
      data: {'cityId': cityId},
    );
  }

  Future<List<CommuneModel>> getCommunes(String cityId) async {
    try {
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
    } on DioException {
      return _fallbackCommunes[cityId] ?? const [];
    }
  }
}

final cityRepositoryProvider = Provider<CityRepository>((ref) {
  return CityRepository(ref.read(dioProvider));
});

const _lubumbashiCityId = '01000000-0000-0000-0000-000000000001';
const _kolweziCityId = '01000000-0000-0000-0000-000000000002';

const _fallbackCities = <CityModel>[
  CityModel(
    id: _lubumbashiCityId,
    name: 'Lubumbashi',
    slug: 'lubumbashi',
    province: 'Haut-Katanga',
    isActive: true,
    sortOrder: 1,
    accentColor: 'copper',
    heroImageUrl: '/hero/lubumbashi.webp',
  ),
  CityModel(
    id: _kolweziCityId,
    name: 'Kolwezi',
    slug: 'kolwezi',
    province: 'Lualaba',
    isActive: true,
    sortOrder: 2,
    accentColor: 'cobalt',
    heroImageUrl: '/hero/kolwezi.webp',
  ),
];

const _fallbackCommunes = <String, List<CommuneModel>>{
  _lubumbashiCityId: [
    CommuneModel(
      id: '02000000-0000-0000-0000-000000000001',
      cityId: _lubumbashiCityId,
      name: 'Lubumbashi',
    ),
    CommuneModel(
      id: '02000000-0000-0000-0000-000000000002',
      cityId: _lubumbashiCityId,
      name: 'Kampemba',
    ),
    CommuneModel(
      id: '02000000-0000-0000-0000-000000000003',
      cityId: _lubumbashiCityId,
      name: 'Kenya',
    ),
    CommuneModel(
      id: '02000000-0000-0000-0000-000000000004',
      cityId: _lubumbashiCityId,
      name: 'Katuba',
    ),
    CommuneModel(
      id: '02000000-0000-0000-0000-000000000005',
      cityId: _lubumbashiCityId,
      name: 'Ruashi',
    ),
    CommuneModel(
      id: '02000000-0000-0000-0000-000000000006',
      cityId: _lubumbashiCityId,
      name: 'Annexe',
    ),
  ],
  _kolweziCityId: [
    CommuneModel(
      id: '02000000-0000-0000-0000-000000000007',
      cityId: _kolweziCityId,
      name: 'Dilala',
    ),
    CommuneModel(
      id: '02000000-0000-0000-0000-000000000008',
      cityId: _kolweziCityId,
      name: 'Manika',
    ),
  ],
};
