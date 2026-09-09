import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:buyer_mobile/core/cache/cache_keys.dart';
import 'package:buyer_mobile/core/cache/typed_cache.dart';
import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/features/cart/data/cart_repository.dart';
import 'package:buyer_mobile/features/cart/data/models/cart_model.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/cart/presentation/providers/cart_provider.dart';
import '../session/fake_auth.dart';
import 'package:buyer_mobile/features/checkout/data/checkout_repository.dart';
import 'package:buyer_mobile/features/checkout/data/models/checkout_model.dart';
import 'package:buyer_mobile/features/checkout/presentation/providers/checkout_provider.dart';

/// Regression guard: placing an order left the ordered products sitting in the
/// cart until the buyer pull-to-refreshed.
///
/// The server was never at fault — `checkout.service.ts` deletes the cart rows
/// inside the order transaction. The Flutter client simply never learned:
/// `cartProvider` is a long-lived (non-autoDispose) StateNotifier that fetches
/// once at construction, and `placeOrder()` never touched it. The cart was also
/// persisted to SharedPreferences with a 30-day TTL, so the stale items
/// survived an app relaunch too.

CartItemModel _item(String productId, {int quantity = 1}) => CartItemModel(
      id: 'line-$productId',
      productId: productId,
      quantity: quantity,
      product: const CartItemProduct(
        title: 'Produit',
        priceCDF: '150000',
        quantity: 10,
      ),
    );

CartModel _cart(List<CartItemModel> items) => CartModel(
      id: 'cart-1',
      userId: 'user-1',
      items: items,
      createdAt: '2026-09-01T00:00:00.000Z',
    );

class _FakeCartRepo extends CartRepository {
  _FakeCartRepo() : super(Dio());

  /// What the server reports on the next getCart(). Post-checkout this is
  /// empty, mirroring the server-side clear.
  List<CartItemModel> serverItems = [];

  bool failFetch = false;
  int getCartCalls = 0;
  int clearCartCalls = 0;

  @override
  Future<CartModel> getCart() async {
    getCartCalls += 1;
    if (failFetch) {
      throw DioException(
        requestOptions: RequestOptions(path: '/v1/cart'),
        type: DioExceptionType.connectionError,
      );
    }
    return _cart(serverItems);
  }

  @override
  Future<void> clearCart() async {
    clearCartCalls += 1;
  }
}

class _FakeCheckoutRepo extends CheckoutRepository {
  _FakeCheckoutRepo() : super(Dio());

  bool failCheckout = false;
  int checkoutCalls = 0;

  @override
  Future<List<AddressModel>> getAddresses() async => const [
        AddressModel(id: 'addr-1', isDefault: true),
      ];

  @override
  Future<CheckoutQuote> getQuote(String deliveryAddressId) async =>
      const CheckoutQuote(
        subtotalCDF: '150000',
        deliveryFeeCDF: '2000',
        totalCDF: '152000',
        deliveryAvailable: true,
      );

  @override
  Future<CheckoutResponse> checkout(CheckoutRequest request) async {
    checkoutCalls += 1;
    if (failCheckout) {
      throw DioException(
        requestOptions: RequestOptions(path: '/v1/checkout'),
        response: Response(
          requestOptions: RequestOptions(path: '/v1/checkout'),
          statusCode: 400,
        ),
      );
    }
    return const CheckoutResponse(
      orders: [],
      checkoutGroupId: 'group-1',
      paymentPending: false,
    );
  }
}

Future<void> _settle() => Future.delayed(Duration.zero);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FlavorConfig.initialize);

  late SharedPreferences prefs;
  late TypedCache cache;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    cache = TypedCache(prefs);
  });

  /// Seeds the on-disk cart snapshot the way `_persistToCache()` would.
  Future<void> seedCache(List<CartItemModel> items) => cache.write<List<CartItemModel>>(
        CacheKeys.buyerCart,
        items,
        toJson: (list) => {
          'items': list
              .map((i) => {
                    'id': i.id,
                    'productId': i.productId,
                    'quantity': i.quantity,
                    'product': {
                      'title': i.product.title,
                      'priceCDF': i.product.priceCDF,
                      'quantity': i.product.quantity,
                    },
                  })
              .toList(),
        },
        ttl: const Duration(days: 30),
      );

  group('CartNotifier.onOrderPlaced', () {
    test('empties items and zeroes the badge count', () async {
      final repo = _FakeCartRepo()..serverItems = [_item('p1', quantity: 2)];
      final n = CartNotifier(repo, cache)..onSessionStarted();
      await _settle();
      expect(n.state.items, isNotEmpty, reason: 'precondition: cart is loaded');
      expect(n.state.totalItems, 2);

      repo.serverItems = []; // server cleared it inside the order transaction
      await n.onOrderPlaced();

      expect(n.state.items, isEmpty);
      expect(n.state.totalItems, 0);
      expect(n.state.isEmpty, isTrue);
    });

    test('evicts the cached snapshot so a relaunch cannot resurrect the order',
        () async {
      final repo = _FakeCartRepo()..serverItems = [_item('p1')];
      final n = CartNotifier(repo, cache)..onSessionStarted();
      await _settle();
      await seedCache([_item('p1')]);
      expect(prefs.getString(CacheKeys.buyerCart), isNotNull);

      repo.serverItems = [];
      await n.onOrderPlaced();

      // The reconciling fetch re-persists an *empty* snapshot, so the key may
      // exist again — what must not survive is the ordered product itself.
      // Without the evict, _hydrateFromCache() would re-surface it on the next
      // cold start (the entry has a 30-day TTL).
      expect(prefs.getString(CacheKeys.buyerCart) ?? '', isNot(contains('p1')));
      expect((CartNotifier(repo, cache)..onSessionStarted()).state.items, isEmpty,
          reason: 'a fresh cold start must hydrate to an empty cart');
    });

    test('does not call DELETE /v1/cart — the server already cleared it',
        () async {
      final repo = _FakeCartRepo()..serverItems = [_item('p1')];
      final n = CartNotifier(repo, cache)..onSessionStarted();
      await _settle();

      repo.serverItems = [];
      await n.onOrderPlaced();

      expect(repo.clearCartCalls, 0);
    });

    test('keeps the cart empty when the reconciling fetch fails offline',
        () async {
      // clearCart() restores items when its request fails. Reusing it here
      // would resurrect products the buyer has already bought.
      final repo = _FakeCartRepo()..serverItems = [_item('p1')];
      final n = CartNotifier(repo, cache)..onSessionStarted();
      await _settle();

      repo.failFetch = true;
      await n.onOrderPlaced();

      expect(n.state.items, isEmpty);
      expect(prefs.getString(CacheKeys.buyerCart), isNull);
    });

    test('adopts the authoritative server cart, not a blind local wipe',
        () async {
      // A line added from another device after checkout must survive.
      final repo = _FakeCartRepo()..serverItems = [_item('p1')];
      final n = CartNotifier(repo, cache)..onSessionStarted();
      await _settle();

      repo.serverItems = [_item('p9', quantity: 3)];
      await n.onOrderPlaced();

      expect(n.state.items.single.productId, 'p9');
      expect(n.state.totalItems, 3);
    });
  });

  group('CheckoutNotifier → cart transition', () {
    late _FakeCartRepo cartRepo;
    late _FakeCheckoutRepo checkoutRepo;
    late ProviderContainer container;

    setUp(() {
      cartRepo = _FakeCartRepo()..serverItems = [_item('p1', quantity: 2)];
      checkoutRepo = _FakeCheckoutRepo();
      container = ProviderContainer(overrides: [
        // The cart is account-scoped (A4): it loads for a signed-in session.
        authProvider.overrideWith((ref) => FakeAuthNotifier.signedIn('user-1')),
        cartRepositoryProvider.overrideWithValue(cartRepo),
        typedCacheProvider.overrideWithValue(cache),
        checkoutRepositoryProvider.overrideWithValue(checkoutRepo),
      ]);
      addTearDown(container.dispose);
      // checkoutProvider is autoDispose: without a live listener the notifier
      // is disposed the moment `read` returns.
      container.listen(checkoutProvider, (_, __) {}, fireImmediately: true);
    });

    test('a successful order clears the cart without any manual refresh',
        () async {
      expect(container.read(cartItemCountProvider), 0);
      await _settle();
      expect(container.read(cartItemCountProvider), 2,
          reason: 'precondition: badge shows the loaded cart');

      final notifier = container.read(checkoutProvider.notifier);
      await _settle(); // addresses + delivery quote
      cartRepo.serverItems = [];

      final ok = await notifier.placeOrder();

      expect(ok, isTrue);
      expect(container.read(cartProvider).items, isEmpty);
      expect(container.read(cartItemCountProvider), 0,
          reason: 'badge must be correct on first paint, pre-navigation');
    });

    test('a failed checkout leaves the cart untouched', () async {
      container.read(cartProvider); // lazily created — instantiate, then load
      final notifier = container.read(checkoutProvider.notifier);
      await _settle();
      expect(container.read(cartItemCountProvider), 2,
          reason: 'precondition: badge shows the loaded cart');

      checkoutRepo.failCheckout = true;
      final ok = await notifier.placeOrder();

      expect(ok, isFalse);
      expect(container.read(cartItemCountProvider), 2);
      expect(container.read(cartProvider).items, isNotEmpty);
      expect(prefs.getString(CacheKeys.buyerCart), isNotNull,
          reason: 'nothing was ordered, so the cached cart must survive');
    });
  });
}
