import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
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

class ProductsRepository {
  final Dio _dio;

  ProductsRepository(this._dio);

  Future<PaginatedResponse<SellerProductModel>> getProducts({
    int page = 1,
    int limit = 20,
    String? status,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (status != null && status.isNotEmpty) {
      queryParams['status'] = status;
    }

    final response = await _dio.get(
      '/v1/sellers/products',
      queryParameters: queryParams,
    );
    final data = response.data;
    final itemsRaw = data['data'] as List<dynamic>? ?? [];
    final meta = data['meta'] as Map<String, dynamic>? ?? {};

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

  Future<ProductImageModel> uploadImage(
      String productId, File imageFile) async {
    final formData = FormData.fromMap({
      'image': await MultipartFile.fromFile(
        imageFile.path,
        filename: imageFile.path.split('/').last,
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
}

final productsRepositoryProvider = Provider<ProductsRepository>((ref) {
  return ProductsRepository(ref.read(dioProvider));
});
