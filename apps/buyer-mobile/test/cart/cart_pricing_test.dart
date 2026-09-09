// A1 (2026-09-06) — the cart total must be what the server charges: the
// promotional price when one is set (0 < promo < price, enforced by the API
// on write), else the regular price, × quantity. Amounts are centimes.
import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:buyer_mobile/core/cache/typed_cache.dart';
import 'package:buyer_mobile/core/utils/price_formatter.dart';
import 'package:buyer_mobile/features/cart/data/cart_repository.dart';
import 'package:buyer_mobile/features/cart/data/models/cart_model.dart';
import 'package:buyer_mobile/features/cart/presentation/providers/cart_provider.dart';

CartItemModel _line(String id, {required String price, String? promo, int qty = 1}) => CartItemModel(
      id: 'line-$id',
      productId: id,
      quantity: qty,
      product: CartItemProduct(title: 'P $id', priceCDF: price, discountPriceCDF: promo, quantity: 50),
    );

class _Repo extends CartRepository {
  _Repo() : super(Dio());
  CartModel next = const CartModel(id: 'c', userId: 'u', createdAt: '');
  Completer<CartModel>? gate;
  @override
  Future<CartModel> getCart() async => next;
  @override
  Future<CartModel> updateQuantity(String productId, int quantity) async =>
      gate == null ? next : await gate!.future;
  @override
  Future<CartModel> addItem(String productId, int quantity) async => next;
}

void main() {
  group('CartItemProduct.effectiveCDF — the one pricing rule on the client', () {
    test('no promo → regular price', () {
      expect(_line('a', price: '1100000').product.effectiveCDF, '1100000');
    });
    test('valid promo (0 < promo < price) → promo', () {
      expect(_line('a', price: '1100000', promo: '935000').product.effectiveCDF, '935000');
    });
    test('promo equal to or above the price, zero, or garbage → regular price (defensive; the API never stores these)', () {
      expect(_line('a', price: '1100000', promo: '1100000').product.effectiveCDF, '1100000');
      expect(_line('a', price: '1100000', promo: '1200000').product.effectiveCDF, '1100000');
      expect(_line('a', price: '1100000', promo: '0').product.effectiveCDF, '1100000');
      expect(_line('a', price: '1100000', promo: 'abc').product.effectiveCDF, '1100000');
    });
  });

  group('line and cart totals', () {
    test('no promo, quantity 1 and 3', () {
      expect(_line('a', price: '1100000').subtotalCDF, '1100000');
      expect(_line('a', price: '1100000', qty: 3).subtotalCDF, '3300000');
    });
    test('promo, quantity 1 and 2 → 9.350 FC and 18.700 FC', () {
      final one = _line('a', price: '1100000', promo: '935000');
      final two = _line('a', price: '1100000', promo: '935000', qty: 2);
      expect(one.subtotalCDF, '935000');
      expect(two.subtotalCDF, '1870000');
      expect(formatCDF(one.subtotalCDF), '9.350 FC');
      expect(formatCDF(two.subtotalCDF), '18.700 FC');
    });
    test('mixed cart: promo × 2 + regular × 1', () {
      final items = [_line('a', price: '1100000', promo: '935000', qty: 2), _line('b', price: '2500000')];
      expect(computeEffectiveTotalCDF(items), '4370000');
      expect(CartState(items: items).totalCDF, '4370000');
      expect(formatCDF(CartState(items: items).totalCDF), '43.700 FC');
    });
    test('the old bug: the regular-price sum is NOT what the cart shows any more', () {
      final items = [_line('a', price: '1100000', promo: '935000')];
      expect(CartState(items: items).totalCDF, isNot('1100000'));
      expect(CartState(items: items).totalCDF, '935000');
    });
    test('large values stay exact (BigInt, no 32-bit overflow) and format with dots', () {
      final items = [_line('a', price: '90000000000', qty: 3)]; // 900.000.000 FC × 3
      expect(computeEffectiveTotalCDF(items), '270000000000');
      expect(formatCDF(computeEffectiveTotalCDF(items)), '2.700.000.000 FC');
    });
  });

  group('the API total is preferred when present', () {
    test('CartModel.fromJson keeps the root totalCDF and totalCDF prefers it', () {
      final json = jsonDecode('''{"id":"c","userId":"u","createdAt":"x","totalItems":1,"totalCDF":"935000",
        "items":[{"id":"l","productId":"p","quantity":1,"product":{"title":"T","priceCDF":"1100000","discountPriceCDF":"935000","quantity":5}}]}''') as Map<String, dynamic>;
      final cart = CartModel.fromJson(json);
      expect(cart.serverTotalCDF, '935000');
      expect(cart.totalCDF, '935000');
    });
    test('without a root totalCDF (older payload / snapshot) the local rule applies', () {
      final json = jsonDecode('''{"id":"c","userId":"u","createdAt":"x",
        "items":[{"id":"l","productId":"p","quantity":2,"product":{"title":"T","priceCDF":"1100000","discountPriceCDF":"935000","quantity":5}}]}''') as Map<String, dynamic>;
      expect(CartModel.fromJson(json).serverTotalCDF, isNull);
      expect(CartModel.fromJson(json).totalCDF, '1870000');
    });
    test('the state carries the server total after a fetch, drops it during an optimistic edit, restores it from the response', () async {
      SharedPreferences.setMockInitialValues({});
      final cache = TypedCache(await SharedPreferences.getInstance());
      final repo = _Repo()
        ..next = CartModel(id: 'c', userId: 'u', createdAt: '', serverTotalCDF: '935000', items: [_line('a', price: '1100000', promo: '935000')]);
      final n = CartNotifier(repo, cache);
      await n.onSessionStarted();
      expect(n.state.serverTotalCDF, '935000');
      expect(n.state.totalCDF, '935000');

      repo.gate = Completer<CartModel>();
      final pending = n.updateQuantity('a', 2);
      expect(n.state.serverTotalCDF, isNull, reason: 'optimistic edit: the server figure is stale');
      expect(n.state.totalCDF, '1870000', reason: 'local rule while waiting');
      repo.gate!.complete(CartModel(id: 'c', userId: 'u', createdAt: '', serverTotalCDF: '1870000', items: [_line('a', price: '1100000', promo: '935000', qty: 2)]));
      await pending;
      expect(n.state.serverTotalCDF, '1870000');
      expect(n.state.totalCDF, '1870000');
    });
    test('the offline snapshot keeps the promotion, so a relaunch shows the charged price', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final cache = TypedCache(prefs);
      final repo = _Repo()
        ..next = CartModel(id: 'c', userId: 'u', createdAt: '', serverTotalCDF: '1870000', items: [_line('a', price: '1100000', promo: '935000', qty: 2)]);
      await CartNotifier(repo, cache).onSessionStarted();
      // Next launch, offline: hydrate only.
      final offline = _OfflineRepo();
      final n2 = CartNotifier(offline, cache);
      n2.onSessionStarted(); // fetch fails → cached items stay
      await Future<void>.delayed(Duration.zero);
      expect(n2.state.items.single.product.discountPriceCDF, '935000');
      expect(n2.state.totalCDF, '1870000');
      expect(n2.state.serverTotalCDF, isNull);
    });
  });
}

class _OfflineRepo extends CartRepository {
  _OfflineRepo() : super(Dio());
  @override
  Future<CartModel> getCart() async =>
      throw DioException(requestOptions: RequestOptions(path: '/v1/cart'), type: DioExceptionType.connectionError);
}
