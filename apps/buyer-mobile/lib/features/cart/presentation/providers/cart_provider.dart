import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/cart_repository.dart';
import '../../data/models/cart_model.dart';

class CartState {
  final List<CartItemModel> items;
  final bool isLoading;
  final String? error;

  const CartState({
    this.items = const [],
    this.isLoading = false,
    this.error,
  });

  CartState copyWith({
    List<CartItemModel>? items,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return CartState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }

  int get totalItems =>
      items.fold(0, (sum, item) => sum + item.quantity);

  String get totalCDF {
    final total = items.fold<int>(
      0,
      (sum, item) =>
          sum +
          (int.tryParse(item.product.priceCDF) ?? 0) * item.quantity,
    );
    return total.toString();
  }

  bool get isEmpty => items.isEmpty;
}

class CartNotifier extends StateNotifier<CartState> {
  final CartRepository _repository;

  CartNotifier(this._repository) : super(const CartState()) {
    fetchCart();
  }

  Future<void> fetchCart() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final cart = await _repository.getCart();
      state = state.copyWith(
        items: cart.items,
        isLoading: false,
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: _extractErrorMessage(e),
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> addItem(String productId, {int quantity = 1}) async {
    try {
      final cart = await _repository.addItem(productId, quantity);
      state = state.copyWith(items: cart.items, clearError: true);
    } on DioException catch (e) {
      state = state.copyWith(error: _extractErrorMessage(e));
      rethrow;
    }
  }

  Future<void> updateQuantity(String productId, int quantity) async {
    // Optimistic update
    final previousItems = state.items;
    final updatedItems = state.items.map((item) {
      if (item.productId == productId) {
        return CartItemModel(
          id: item.id,
          productId: item.productId,
          quantity: quantity,
          product: item.product,
        );
      }
      return item;
    }).toList();
    state = state.copyWith(items: updatedItems, clearError: true);

    try {
      final cart = await _repository.updateQuantity(productId, quantity);
      state = state.copyWith(items: cart.items);
    } on DioException catch (e) {
      // Revert on failure
      state = state.copyWith(
        items: previousItems,
        error: _extractErrorMessage(e),
      );
    } catch (_) {
      state = state.copyWith(items: previousItems);
    }
  }

  Future<void> removeItem(String productId) async {
    // Optimistic update
    final previousItems = state.items;
    final updatedItems =
        state.items.where((item) => item.productId != productId).toList();
    state = state.copyWith(items: updatedItems, clearError: true);

    try {
      final cart = await _repository.removeItem(productId);
      state = state.copyWith(items: cart.items);
    } on DioException catch (e) {
      // Revert on failure
      state = state.copyWith(
        items: previousItems,
        error: _extractErrorMessage(e),
      );
    } catch (_) {
      state = state.copyWith(items: previousItems);
    }
  }

  Future<void> clearCart() async {
    final previousItems = state.items;
    state = state.copyWith(items: [], clearError: true);

    try {
      await _repository.clearCart();
    } catch (_) {
      state = state.copyWith(items: previousItems);
    }
  }

  String _extractErrorMessage(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return 'Connexion lente. Veuillez reessayer.';
    }
    if (e.type == DioExceptionType.connectionError) {
      return 'Pas de connexion internet.';
    }
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      final error = data['error'];
      if (error is Map && error['message'] != null) {
        return error['message'].toString();
      }
      return error.toString();
    }
    return 'Une erreur est survenue. Veuillez reessayer.';
  }
}

final cartProvider = StateNotifierProvider<CartNotifier, CartState>((ref) {
  return CartNotifier(ref.read(cartRepositoryProvider));
});

/// Derived provider returning just the item count for badges
final cartItemCountProvider = Provider<int>((ref) {
  return ref.watch(cartProvider).totalItems;
});
