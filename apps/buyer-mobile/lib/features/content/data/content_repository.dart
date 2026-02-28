import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/content_page_model.dart';

class ContentRepository {
  final Dio _dio;

  ContentRepository(this._dio);

  Future<ContentPageModel> getPage(String slug) async {
    final response = await _dio.get('/v1/content/$slug');
    final responseData = response.data;

    final Map<String, dynamic> pageJson;
    if (responseData is Map && responseData['data'] != null) {
      pageJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      pageJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid content page response');
    }

    return ContentPageModel.fromJson(pageJson);
  }

  Future<List<ContentPageSummary>> getPagesList() async {
    final response = await _dio.get('/v1/content');
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
        .map((e) => ContentPageSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

final contentRepositoryProvider = Provider<ContentRepository>((ref) {
  return ContentRepository(ref.read(dioProvider));
});
