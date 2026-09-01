import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/cache/cache_keys.dart';
import '../../../../core/cache/typed_cache.dart';
import '../../../../core/network/dio_error_messages.dart';
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
  final TypedCache _cache;

  /// How long the cached cart snapshot is treated as fresh by
  /// [TypedCache.isFresh]. We don't actually consult freshness on
  /// boot — we always show the cached cart as the optimistic first
  /// paint and let `fetchCart()` overwrite when the network is back —
  /// but a long TTL keeps the entry usable across offline app
  /// relaunches without falling into the "stale" bucket. 30 days >>
  /// any plausible offline session.
  static const Duration _cartCacheTtl = Duration(days: 30);

  CartNotifier(this._repository, this._cache) : super(const CartState()) {
    // First paint: hydrate from the cached snapshot synchronously so
    // the cart icon / cart screen show the user's last-known items
    // immediately on app launch (works even when offline). The actual
    // fetchCart() below replaces these with fresh server data when
    // the network comes back.
    _hydrateFromCache();
    fetchCart();
  }

  /// Pulls the last persisted cart snapshot off SharedPreferences and
  /// drops it into state without making a server call. Silent on any
  /// failure — the cache is best-effort.
  void _hydrateFromCache() {
    final entry = _cache.read<List<CartItemModel>>(
      CacheKeys.buyerCart,
      fromJson: (json) {
        final raw = json['items'];
        if (raw is! List) return const <CartItemModel>[];
        return raw
            .map((e) => CartItemModel.fromJson(e as Map<String, dynamic>))
            .toList();
      },
    );
    if (entry != null && entry.value.isNotEmpty) {
      state = state.copyWith(items: entry.value);
    }
  }

  /// Snapshots the current cart items to SharedPreferences. Called
  /// after every successful state update so the disk copy is always
  /// the user's last-confirmed cart. Fire-and-forget; failures don't
  /// surface (cache is best-effort).
  Future<void> _persistToCache() async {
    await _cache.write<List<CartItemModel>>(
      CacheKeys.buyerCart,
      state.items,
      toJson: (items) => {
        'items': items
            .map((i) => {
                  'id': i.id,
                  'productId': i.productId,
                  'quantity': i.quantity,
                  'product': {
                    'title': i.product.title,
                    'priceCDF': i.product.priceCDF,
                    'priceUSD': i.product.priceUSD,
                    'quantity': i.product.quantity,
                    'thumbnailUrl': i.product.thumbnailUrl,
                    'sellerId': i.product.sellerId,
                    'sellerName': i.product.sellerName,
                  },
                })
            .toList(),
      },
      ttl: _cartCacheTtl,
    );
  }

  Future<void> fetchCart() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final cart = await _repository.getCart();
      state = state.copyWith(
        items: cart.items,
        isLoading: false,
      );
      _persistToCache();
    } on DioException catch (e) {
      // Offline / network error: keep whatever the cache hydration
      // gave us. Don't surface an error — the connectivity banner
      // (PR3) tells the user about the network state already.
      final isOfflineError = e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.connectionError;
      state = state.copyWith(
        isLoading: false,
        error: isOfflineError ? null : extractDioErrorMessage(e),
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: friendlyErrorMessage(e),
      );
    }
  }

  Future<void> addItem(String productId, {int quantity = 1}) async {
    try {
      final cart = await _repository.addItem(productId, quantity);
      state = state.copyWith(items: cart.items, clearError: true);
      _persistToCache();
      // Buyer-owned UI event (parity with buyer-web add_to_cart).
      const PosthogAnalytics().capture(
        'add_to_cart',
        properties: {'productId': productId, 'quantity': quantity},
      );
    } on DioException catch (e) {
      state = state.copyWith(error: extractDioErrorMessage(e));
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
      _persistToCache();
    } on DioException catch (e) {
      // Revert on failure
      state = state.copyWith(
        items: previousItems,
        error: extractDioErrorMessage(e),
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
      _persistToCache();
      // Buyer-owned UI event (parity with buyer-web remove_from_cart).
      const PosthogAnalytics().capture(
        'remove_from_cart',
        properties: {'productId': productId},
      );
    } on DioException catch (e) {
      // Revert on failure
      state = state.copyWith(
        items: previousItems,
        error: extractDioErrorMessage(e),
      );
    } catch (_) {
      state = state.copyWith(items: previousItems);
    }
  }

  Future<void> clearCart() async {
    final previousItems = state.items;
    state = state.copyWith(items: [], clearError: true);
    _cache.evict(CacheKeys.buyerCart);

    try {
      await _repository.clearCart();
    } catch (_) {
      state = state.copyWith(items: previousItems);
      _persistToCache();
    }
  }

  /// Resets the cart after checkout has definitively succeeded.
  ///
  /// The server already emptied the cart inside the same transaction that
  /// created the order (`checkout.service.ts`), so this is a client-state
  /// catch-up, not a mutation. Deliberately NOT [clearCart]: that one issues
  /// `DELETE /v1/cart` (redundant here) and — worse — restores the items if
  /// the request fails, which would resurrect products the buyer has already
  /// bought.
  ///
  /// Evicting the cache matters as much as clearing state: [_persistToCache]
  /// has already written these items to SharedPreferences with a 30-day TTL,
  /// so without the evict [_hydrateFromCache] would re-surface the ordered
  /// products on the next app launch.
  ///
  /// The trailing [fetchCart] reconciles against the server (a cart is not
  /// necessarily empty after checkout — a concurrent add from another device
  /// would still be there). It is intentionally awaited so callers can
  /// sequence navigation after the authoritative state has landed; if it
  /// fails offline it leaves the emptied state alone rather than reverting.
  Future<void> onOrderPlaced() async {
    state = state.copyWith(items: [], clearError: true);
    await _cache.evict(CacheKeys.buyerCart);
    await fetchCart();
  }
}

final cartProvider = StateNotifierProvider<CartNotifier, CartState>((ref) {
  return CartNotifier(
    ref.read(cartRepositoryProvider),
    ref.read(typedCacheProvider),
  );
});

/// Derived provider returning just the item count for badges
final cartItemCountProvider = Provider<int>((ref) {
  return ref.watch(cartProvider).totalItems;
});

/// The cart line for [productId], or null when the product isn't in the cart.
/// Lets the product-detail screen react to cart state — showing the Jumia-style
/// quantity stepper when in cart, or the "Ajouter au panier" button otherwise —
/// and keeps that bar in sync with the cart / checkout everywhere.
final cartItemProvider =
    Provider.family<CartItemModel?, String>((ref, productId) {
  final items = ref.watch(cartProvider).items;
  for (final item in items) {
    if (item.productId == productId) return item;
  }
  return null;
});
