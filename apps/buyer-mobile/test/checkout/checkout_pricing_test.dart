// A1 (2026-09-06) — the amount shown right before "Confirmer" is the server's
// quote (subtotal + delivery fee at current prices); a cart that drifted from
// the quote is refreshed and flagged.
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:buyer_mobile/core/cache/typed_cache.dart';
import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/utils/price_formatter.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/cart/data/cart_repository.dart';
import 'package:buyer_mobile/features/cart/data/models/cart_model.dart';
import 'package:buyer_mobile/features/cart/presentation/providers/cart_provider.dart';
import 'package:buyer_mobile/features/checkout/data/checkout_repository.dart';
import 'package:buyer_mobile/features/checkout/data/models/checkout_model.dart';
import 'package:buyer_mobile/features/checkout/presentation/providers/checkout_provider.dart';
import '../session/fake_auth.dart';

CartItemModel _line(String id, {required String price, String? promo, int qty = 1}) => CartItemModel(
      id: 'line-$id', productId: id, quantity: qty,
      product: CartItemProduct(title: 'P $id', priceCDF: price, discountPriceCDF: promo, quantity: 50),
    );

class _CartRepo extends CartRepository {
  _CartRepo() : super(Dio());
  CartModel next = const CartModel(id: 'c', userId: 'u', createdAt: '');
  int fetches = 0;
  @override
  Future<CartModel> getCart() async {
    fetches++;
    return next;
  }
}

class _CheckoutRepo extends CheckoutRepository {
  _CheckoutRepo() : super(Dio());
  CheckoutQuote quote = const CheckoutQuote(subtotalCDF: '935000', deliveryFeeCDF: '200000', totalCDF: '1135000', deliveryAvailable: true);
  @override
  Future<List<AddressModel>> getAddresses() async => const [AddressModel(id: 'addr-1', isDefault: true)];
  @override
  Future<CheckoutQuote> getQuote(String deliveryAddressId) async => quote;
}

Future<void> _settle() async {
  for (var i = 0; i < 6; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FlavorConfig.initialize);

  late _CartRepo cartRepo;
  late _CheckoutRepo checkoutRepo;
  late ProviderContainer container;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final cache = TypedCache(await SharedPreferences.getInstance());
    cartRepo = _CartRepo()..next = CartModel(id: 'c', userId: 'u', createdAt: '', serverTotalCDF: '935000', items: [_line('a', price: '1100000', promo: '935000')]);
    checkoutRepo = _CheckoutRepo();
    container = ProviderContainer(overrides: [
      authProvider.overrideWith((ref) => FakeAuthNotifier.signedIn('u')),
      cartRepositoryProvider.overrideWithValue(cartRepo),
      typedCacheProvider.overrideWithValue(cache),
      checkoutRepositoryProvider.overrideWithValue(checkoutRepo),
    ]);
    addTearDown(container.dispose);
    container.listen(cartProvider, (_, __) {}, fireImmediately: true);
    await _settle();
  });

  test('the review screen amounts come from the quote: subtotal 9.350 FC, fee 2.000 FC, total 11.350 FC', () async {
    container.listen(checkoutProvider, (_, __) {}, fireImmediately: true);
    await _settle();
    final s = container.read(checkoutProvider);
    expect(s.quoteSubtotalCDF, '935000');
    expect(s.deliveryFeeCDF, '200000');
    expect(s.quoteTotalCDF, '1135000');
    expect(formatCDF(s.quoteSubtotalCDF!), '9.350 FC');
    expect(formatCDF(s.quoteTotalCDF!), '11.350 FC');
    expect(s.pricesChanged, isFalse, reason: 'cart and quote agree');
    expect(cartRepo.fetches, 1, reason: 'no refresh needed');
  });

  test('quote subtotal ≠ cart shown (price or promo moved) → cart refreshed and flagged', () async {
    // The promotion ended after the item was added: the server now quotes the regular price.
    checkoutRepo.quote = const CheckoutQuote(subtotalCDF: '1100000', deliveryFeeCDF: '200000', totalCDF: '1300000');
    cartRepo.next = CartModel(id: 'c', userId: 'u', createdAt: '', serverTotalCDF: '1100000', items: [_line('a', price: '1100000')]);
    container.listen(checkoutProvider, (_, __) {}, fireImmediately: true);
    await _settle();
    final s = container.read(checkoutProvider);
    expect(s.pricesChanged, isTrue);
    expect(s.quoteSubtotalCDF, '1100000');
    expect(s.quoteTotalCDF, '1300000');
    expect(cartRepo.fetches, 2, reason: 'the cart lines were refreshed');
    expect(container.read(cartProvider).totalCDF, '1100000', reason: 'cart now matches the quote');
  });

  test('delivery unavailable → no grand total is offered (never a silent free fee)', () async {
    checkoutRepo.quote = const CheckoutQuote(subtotalCDF: '935000', deliveryFeeCDF: '0', totalCDF: '935000', deliveryAvailable: false);
    container.listen(checkoutProvider, (_, __) {}, fireImmediately: true);
    await _settle();
    final s = container.read(checkoutProvider);
    expect(s.deliveryAvailable, isFalse);
    expect(s.deliveryFeeCDF, isNull);
    expect(s.quoteTotalCDF, isNull);
    expect(s.canPlaceOrder, isFalse);
  });
}
