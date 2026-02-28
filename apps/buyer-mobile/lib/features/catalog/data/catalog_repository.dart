import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/category_model.dart';
import 'models/product_model.dart';

class BrowseProductsResult {
  final List<BrowseProductModel> data;
  final PaginationMeta pagination;

  const BrowseProductsResult({
    required this.data,
    required this.pagination,
  });
}

class CatalogRepository {
  final Dio _dio;

  CatalogRepository(this._dio);

  Future<List<CategoryModel>> getCategories() async {
    final response = await _dio.get('/v1/browse/categories');
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
        .map((e) => CategoryModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<BrowseProductsResult> browseProducts({
    String? categoryId,
    String? search,
    String? condition,
    String? sortBy,
    String? cursor,
    int limit = 20,
  }) async {
    final queryParams = <String, dynamic>{
      'limit': limit,
    };

    if (categoryId != null && categoryId.isNotEmpty) {
      queryParams['categoryId'] = categoryId;
    }
    if (search != null && search.isNotEmpty) {
      queryParams['search'] = search;
    }
    if (condition != null && condition.isNotEmpty) {
      queryParams['condition'] = condition;
    }
    if (sortBy != null && sortBy.isNotEmpty) {
      queryParams['sortBy'] = sortBy;
    }
    if (cursor != null && cursor.isNotEmpty) {
      queryParams['cursor'] = cursor;
    }

    final response = await _dio.get(
      '/v1/browse/products',
      queryParameters: queryParams,
    );
    final responseData = response.data;

    final List<dynamic> rawList;
    final Map<String, dynamic> paginationJson;

    if (responseData is Map) {
      rawList = responseData['data'] as List? ?? [];
      paginationJson =
          responseData['pagination'] as Map<String, dynamic>? ??
              responseData['meta'] as Map<String, dynamic>? ??
              {};
    } else {
      rawList = [];
      paginationJson = {};
    }

    return BrowseProductsResult(
      data: rawList
          .map((e) => BrowseProductModel.fromJson(e as Map<String, dynamic>))
          .toList(),
      pagination: PaginationMeta.fromJson(paginationJson),
    );
  }

  Future<ProductDetailModel> getProductDetail(String id) async {
    final response = await _dio.get('/v1/browse/products/$id');
    final responseData = response.data;

    final Map<String, dynamic> productJson;
    if (responseData is Map && responseData['data'] != null) {
      productJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      productJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid product response');
    }

    return ProductDetailModel.fromJson(productJson);
  }
}

final catalogRepositoryProvider = Provider<CatalogRepository>((ref) {
  return CatalogRepository(ref.read(dioProvider));
});
