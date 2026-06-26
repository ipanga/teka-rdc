import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/utils/image_compress.dart';
import 'models/attribute_model.dart';
import 'models/brand_option_model.dart';
import 'models/product_model.dart';

class PaginatedResponse<T> {
  final List<T> items;
  final int total;
  final int page;
  final int limit;

  const PaginatedResponse({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  bool get hasMore => page * limit < total;
}

/// Dashboard product counts (server-computed in one grouped query).
class ProductStats {
  final int total;
  final int active;
  final int pendingReview;
  final int draft;

  const ProductStats({
    this.total = 0,
    this.active = 0,
    this.pendingReview = 0,
    this.draft = 0,
  });
}

class ProductsRepository {
  final Dio _dio;

  ProductsRepository(this._dio);

  /// Dashboard counts for the current seller's products, grouped by status.
  /// One lightweight call (vs. counting a paginated page client-side).
  Future<ProductStats> getProductStats() async {
    final response = await _dio.get('/v1/sellers/products/stats');
    // The envelope is { success, data: { total, active, ... } }. The Dio chain
    // does NOT unwrap a plain-object payload (unlike the list endpoints where
    // `data` is the array), so read the nested `data`. Fall back to the root
    // for safety if a future interceptor starts unwrapping.
    final body = (response.data as Map<String, dynamic>?) ?? const {};
    final d = (body['data'] as Map<String, dynamic>?) ?? body;
    return ProductStats(
      total: d['total'] as int? ?? 0,
      active: d['active'] as int? ?? 0,
      pendingReview: d['pendingReview'] as int? ?? 0,
      draft: d['draft'] as int? ?? 0,
    );
  }

  Future<PaginatedResponse<SellerProductModel>> getProducts({
    int page = 1,
    int limit = 20,
    String? status,
    String? search,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (status != null && status.isNotEmpty) {
      queryParams['status'] = status;
    }
    if (search != null && search.trim().isNotEmpty) {
      queryParams['search'] = search.trim();
    }

    final response = await _dio.get(
      '/v1/sellers/products',
      queryParameters: queryParams,
    );
    final data = response.data;
    final itemsRaw = data['data'] as List<dynamic>? ?? [];
    final meta = data['pagination'] as Map<String, dynamic>? ?? {};

    final items = itemsRaw
        .map((e) => SellerProductModel.fromJson(e as Map<String, dynamic>))
        .toList();

    return PaginatedResponse(
      items: items,
      total: meta['total'] as int? ?? items.length,
      page: meta['page'] as int? ?? page,
      limit: meta['limit'] as int? ?? limit,
    );
  }

  Future<SellerProductModel> getProduct(String id) async {
    final response = await _dio.get('/v1/sellers/products/$id');
    return SellerProductModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerProductModel> createProduct(
      Map<String, dynamic> data) async {
    final response = await _dio.post(
      '/v1/sellers/products',
      data: data,
    );
    return SellerProductModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerProductModel> updateProduct(
      String id, Map<String, dynamic> data) async {
    final response = await _dio.patch(
      '/v1/sellers/products/$id',
      data: data,
    );
    return SellerProductModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<void> archiveProduct(String id) async {
    await _dio.delete('/v1/sellers/products/$id');
  }

  Future<SellerProductModel> submitForReview(String id) async {
    final response = await _dio.patch(
      '/v1/sellers/products/$id/submit',
    );
    return SellerProductModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerProductModel> withdrawProduct(String id) async {
    final response = await _dio.patch('/v1/sellers/products/$id/withdraw');
    return SellerProductModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerProductModel> restoreProduct(String id) async {
    final response = await _dio.patch('/v1/sellers/products/$id/restore');
    return SellerProductModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<SellerProductModel> duplicateProduct(String id) async {
    final response = await _dio.post('/v1/sellers/products/$id/duplicate');
    return SellerProductModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<ProductImageModel> uploadImage(
      String productId, File imageFile) async {
    // Compress to ≤500 KB WebP before upload. image_picker already does
    // a coarse 1200×1200 q=80 pass, but recent phone cameras still
    // exceed 500 KB after that — and DRC 2G/3G uploads are where this
    // hurts most.
    final compressed = await compressImageForUpload(imageFile);
    final formData = FormData.fromMap({
      'image': MultipartFile.fromBytes(
        compressed.bytes,
        filename: compressed.filename,
      ),
    });
    final response = await _dio.post(
      '/v1/sellers/products/$productId/images',
      data: formData,
    );
    return ProductImageModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<void> deleteImage(String productId, String imageId) async {
    await _dio.delete('/v1/sellers/products/$productId/images/$imageId');
  }

  Future<List<CategoryModel>> getCategories() async {
    final response = await _dio.get('/v1/browse/categories');
    final data = response.data['data'] as List<dynamic>? ?? [];
    return data
        .map((e) => CategoryModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<AttributeModel>> getCategoryAttributes(String categoryId) async {
    final response = await _dio.get('/v1/browse/categories/$categoryId/attributes');
    final data = response.data['data'] as List<dynamic>? ?? [];
    final attrs = data
        .map((e) => AttributeModel.fromJson(e as Map<String, dynamic>))
        .toList();
    attrs.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return attrs;
  }

  /// Active brands offered in [categoryId] (the brand-filter library).
  Future<List<BrandOption>> getBrands(String categoryId) async {
    final response = await _dio.get(
      '/v1/brands',
      queryParameters: {'categoryId': categoryId},
    );
    final data = response.data['data'] as List<dynamic>? ?? [];
    return data
        .map((e) => BrandOption.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

final productsRepositoryProvider = Provider<ProductsRepository>((ref) {
  return ProductsRepository(ref.read(dioProvider));
});
