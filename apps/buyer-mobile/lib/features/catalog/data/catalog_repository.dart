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
    String? cityId,
    int limit = 20,
  }) async {
    final queryParams = <String, dynamic>{
      'limit': limit,
    };

    if (categoryId != null && categoryId.isNotEmpty) {
      queryParams['categoryId'] = categoryId;
    }
    if (cityId != null && cityId.isNotEmpty) {
      queryParams['cityId'] = cityId;
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

    // The api wraps every response in `{success: bool, data: ...}`
    // (see apps/api/src/common/interceptors/response.interceptor.ts).
    // For list endpoints the inner `data` is `{data: [...], pagination:
    // {...}}`. Previously this parser read `responseData['data'] as
    // List`, which got the inner *object* and threw a TypeError — the
    // home-screen popular + newest sections then surfaced "Une erreur"
    // even on a successful 200. Unwrap explicitly so we can hand back
    // the list + pagination cleanly.
    final Map<String, dynamic>? payload;
    if (responseData is Map &&
        responseData['success'] == true &&
        responseData['data'] is Map) {
      payload = Map<String, dynamic>.from(responseData['data'] as Map);
    } else if (responseData is Map) {
      payload = Map<String, dynamic>.from(responseData);
    } else {
      payload = null;
    }

    final rawList = (payload?['data'] as List?) ?? const [];
    final paginationJson = (payload?['pagination'] as Map?)?.cast<String, dynamic>() ??
        (payload?['meta'] as Map?)?.cast<String, dynamic>() ??
        const {};

    return BrowseProductsResult(
      data: rawList
          .map((e) => BrowseProductModel.fromJson(e as Map<String, dynamic>))
          .toList(),
      pagination: PaginationMeta.fromJson(paginationJson.cast<String, dynamic>()),
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
