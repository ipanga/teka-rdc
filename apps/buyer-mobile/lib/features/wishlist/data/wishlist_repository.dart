import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/wishlist_model.dart';

class PaginatedWishlistResponse {
  final List<WishlistItemModel> data;
  final int page;
  final int limit;
  final int total;
  final int totalPages;

  const PaginatedWishlistResponse({
    required this.data,
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });
}

class WishlistRepository {
  final Dio _dio;

  WishlistRepository(this._dio);

  Future<PaginatedWishlistResponse> getWishlist({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get(
      '/v1/wishlist',
      queryParameters: {
        'page': page,
        'limit': limit,
      },
    );
    final responseData = response.data;

    final List<dynamic> rawList;
    final int total;
    final int totalPages;

    if (responseData is Map && responseData['data'] != null) {
      rawList = responseData['data'] as List;
      final meta = responseData['meta'] as Map<String, dynamic>?;
      total = meta?['total'] as int? ?? rawList.length;
      totalPages = meta?['totalPages'] as int? ?? 1;
    } else if (responseData is List) {
      rawList = responseData;
      total = rawList.length;
      totalPages = 1;
    } else {
      rawList = [];
      total = 0;
      totalPages = 1;
    }

    return PaginatedWishlistResponse(
      data: rawList
          .map((e) => WishlistItemModel.fromJson(e as Map<String, dynamic>))
          .toList(),
      page: page,
      limit: limit,
      total: total,
      totalPages: totalPages,
    );
  }

  Future<void> addToWishlist(String productId) async {
    await _dio.post('/v1/wishlist/$productId');
  }

  Future<void> removeFromWishlist(String productId) async {
    await _dio.delete('/v1/wishlist/$productId');
  }

  Future<Set<String>> checkWishlistIds(List<String> productIds) async {
    if (productIds.isEmpty) return {};

    final response = await _dio.get(
      '/v1/wishlist/check',
      queryParameters: {
        'productIds': productIds.join(','),
      },
    );
    final responseData = response.data;

    if (responseData is Map && responseData['data'] != null) {
      final data = responseData['data'];
      if (data is List) {
        return data.map((e) => e.toString()).toSet();
      }
      if (data is Map) {
        // { productId: true/false }
        return data.entries
            .where((e) => e.value == true)
            .map((e) => e.key.toString())
            .toSet();
      }
    }
    return {};
  }

  Future<bool> isInWishlist(String productId) async {
    try {
      final response = await _dio.get('/v1/wishlist/$productId/status');
      final responseData = response.data;

      if (responseData is Map && responseData['data'] != null) {
        final data = responseData['data'];
        if (data is Map) {
          return data['isInWishlist'] as bool? ?? false;
        }
      }
      if (responseData is Map) {
        return responseData['isInWishlist'] as bool? ?? false;
      }
      return false;
    } catch (_) {
      return false;
    }
  }
}

final wishlistRepositoryProvider = Provider<WishlistRepository>((ref) {
  return WishlistRepository(ref.read(dioProvider));
});
