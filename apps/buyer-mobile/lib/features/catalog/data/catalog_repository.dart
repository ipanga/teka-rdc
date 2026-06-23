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
    String? attributesJson,
    String? brandIds,
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
    // Attribute facet filter — a pre-encoded JSON object of
    // attributeId -> [selected values]. The server parses + bounds it.
    if (attributesJson != null && attributesJson.isNotEmpty) {
      queryParams['attributes'] = attributesJson;
    }
    // Brand facet filter — comma-separated brand ids (OR within).
    if (brandIds != null && brandIds.isNotEmpty) {
      queryParams['brandIds'] = brandIds;
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

  /// GET /v1/browse/products/:id/related — same-category + price-proximate
  /// products for the PDP "Produits similaires" row.
  Future<List<BrowseProductModel>> getRelatedProducts(String productId) async {
    final response = await _dio.get('/v1/browse/products/$productId/related');
    final responseData = response.data;
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
    return rawList
        .map((e) => BrowseProductModel.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
  }

  /// GET /v1/browse/search/suggestions — matching categories for autocomplete.
  /// (Products are already shown live in the search grid; this surfaces the
  /// category suggestions, matching buyer-web's dropdown.)
  Future<List<SuggestedCategory>> getSearchSuggestions(
    String q, {
    String? cityId,
  }) async {
    final response = await _dio.get(
      '/v1/browse/search/suggestions',
      queryParameters: {
        'q': q,
        if (cityId != null) 'cityId': cityId,
      },
    );
    final data = response.data['data'] ?? response.data;
    final cats = (data['categories'] as List?) ?? const [];
    return cats
        .cast<Map<String, dynamic>>()
        .map(SuggestedCategory.fromJson)
        .toList(growable: false);
  }

  /// GET /v1/browse/categories/:id/attributes — the SELECT / MULTISELECT
  /// attributes for a category, used to build the facet filter. TEXT / NUMERIC
  /// and option-less attributes are dropped (not filterable).
  Future<List<FacetAttribute>> getCategoryAttributes(String categoryId) async {
    final response =
        await _dio.get('/v1/browse/categories/$categoryId/attributes');
    final data = response.data;
    final List<dynamic> raw = (data is Map && data['data'] is List)
        ? data['data'] as List
        : (data is List ? data : const []);
    return raw
        .map((e) => FacetAttribute.fromJson(e as Map<String, dynamic>))
        .where((a) =>
            ((a.type == 'SELECT' || a.type == 'MULTISELECT') &&
                a.options.isNotEmpty) ||
            a.type == 'BOOLEAN')
        .toList(growable: false);
  }

  /// GET /v1/brands?categoryId= — active brands offered in [categoryId], for
  /// the buyer brand-filter facet. Empty list on any error.
  Future<List<BrandOption>> getBrands(String categoryId) async {
    final response = await _dio.get(
      '/v1/brands',
      queryParameters: {'categoryId': categoryId},
    );
    final data = response.data;
    final List<dynamic> raw = (data is Map && data['data'] is List)
        ? data['data'] as List
        : (data is List ? data : const []);
    return raw
        .map((e) => BrandOption.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
  }
}

/// A brand in the buyer brand-filter facet.
class BrandOption {
  final String id;
  final String name;

  const BrandOption({required this.id, required this.name});

  factory BrandOption.fromJson(Map<String, dynamic> json) => BrandOption(
        id: json['id'] as String,
        name: json['name']?.toString() ?? '',
      );
}

/// A filterable category attribute (SELECT / MULTISELECT).
class FacetAttribute {
  final String id;

  /// Already resolved to the French label (see [_frAttributeLabel]).
  final String name;
  final String type;
  final List<String> options;

  const FacetAttribute({
    required this.id,
    required this.name,
    required this.type,
    required this.options,
  });

  factory FacetAttribute.fromJson(Map<String, dynamic> json) {
    return FacetAttribute(
      id: json['id'] as String,
      name: (json['name'] ?? '').toString(),
      type: json['type']?.toString() ?? 'TEXT',
      options: (json['options'] as List?)
              ?.map((e) => e.toString())
              .toList(growable: false) ??
          const [],
    );
  }
}

/// A category match returned by the search-suggestions endpoint.
class SuggestedCategory {
  final String id;
  final String name;

  const SuggestedCategory({required this.id, required this.name});

  factory SuggestedCategory.fromJson(Map<String, dynamic> json) {
    return SuggestedCategory(
      id: json['id'] as String,
      name: json['name']?.toString() ?? '',
    );
  }
}

final catalogRepositoryProvider = Provider<CatalogRepository>((ref) {
  return CatalogRepository(ref.read(dioProvider));
});
