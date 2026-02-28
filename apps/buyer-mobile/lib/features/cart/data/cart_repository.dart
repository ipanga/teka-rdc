import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/cart_model.dart';

class CartRepository {
  final Dio _dio;

  CartRepository(this._dio);

  Future<CartModel> getCart() async {
    final response = await _dio.get('/v1/cart');
    final responseData = response.data;

    final Map<String, dynamic> cartJson;
    if (responseData is Map && responseData['data'] != null) {
      cartJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      cartJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid cart response');
    }

    return CartModel.fromJson(cartJson);
  }

  Future<CartModel> addItem(String productId, int quantity) async {
    final response = await _dio.post(
      '/v1/cart/items',
      data: {'productId': productId, 'quantity': quantity},
    );
    final responseData = response.data;

    final Map<String, dynamic> cartJson;
    if (responseData is Map && responseData['data'] != null) {
      cartJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      cartJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid cart response');
    }

    return CartModel.fromJson(cartJson);
  }

  Future<CartModel> updateQuantity(String productId, int quantity) async {
    final response = await _dio.patch(
      '/v1/cart/items/$productId',
      data: {'quantity': quantity},
    );
    final responseData = response.data;

    final Map<String, dynamic> cartJson;
    if (responseData is Map && responseData['data'] != null) {
      cartJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      cartJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid cart response');
    }

    return CartModel.fromJson(cartJson);
  }

  Future<CartModel> removeItem(String productId) async {
    final response = await _dio.delete('/v1/cart/items/$productId');
    final responseData = response.data;

    final Map<String, dynamic> cartJson;
    if (responseData is Map && responseData['data'] != null) {
      cartJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      cartJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid cart response');
    }

    return CartModel.fromJson(cartJson);
  }

  Future<void> clearCart() async {
    await _dio.delete('/v1/cart');
  }

  Future<CartModel> mergeGuestCart(
    List<Map<String, dynamic>> items,
  ) async {
    final response = await _dio.post(
      '/v1/cart/merge',
      data: {'items': items},
    );
    final responseData = response.data;

    final Map<String, dynamic> cartJson;
    if (responseData is Map && responseData['data'] != null) {
      cartJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      cartJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid cart response');
    }

    return CartModel.fromJson(cartJson);
  }
}

final cartRepositoryProvider = Provider<CartRepository>((ref) {
  return CartRepository(ref.read(dioProvider));
});
