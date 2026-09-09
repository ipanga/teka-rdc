// A4 (2026-09-06) — Buyer B on a shared phone must never see Buyer A's
// private state: cart (memory + disk), orders, notifications, unread badge,
// cached profile, recently viewed, recent searches.
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:buyer_mobile/core/cache/cache_keys.dart';
import 'package:buyer_mobile/core/cache/typed_cache.dart';
import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/providers/core_providers.dart';
import 'package:buyer_mobile/features/auth/data/session_scope.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/cart/data/cart_repository.dart';
import 'package:buyer_mobile/features/cart/data/models/cart_model.dart';
import 'package:buyer_mobile/features/cart/presentation/providers/cart_provider.dart';
import 'package:buyer_mobile/features/catalog/data/recent_searches_store.dart';
import 'package:buyer_mobile/features/catalog/data/recently_viewed_store.dart';
import 'package:buyer_mobile/features/notifications/data/models/notification_model.dart';
import 'package:buyer_mobile/features/notifications/data/notifications_repository.dart';
import 'package:buyer_mobile/features/notifications/presentation/providers/notifications_provider.dart';
import 'package:buyer_mobile/features/orders/data/models/order_model.dart';
import 'package:buyer_mobile/features/orders/data/orders_repository.dart';
import 'package:buyer_mobile/features/orders/presentation/providers/orders_provider.dart';
import 'fake_auth.dart';

CartItemModel _item(String productId) => CartItemModel(
      id: 'line-$productId',
      productId: productId,
      quantity: 1,
      product: const CartItemProduct(title: 'Produit', priceCDF: '150000', quantity: 10),
    );

class _CartRepo extends CartRepository {
  _CartRepo() : super(Dio());
  /// The server's cart, per signed-in user id.
  final Map<String, List<CartItemModel>> byUser = {};
  String current = '';
  @override
  Future<CartModel> getCart() async => CartModel(
        id: 'cart-$current',
        userId: current,
        items: byUser[current] ?? const [],
        createdAt: '2026-09-01T00:00:00.000Z',
      );
}

class _OrdersRepo extends OrdersRepository {
  _OrdersRepo() : super(Dio());
  @override
  Future<({List<OrderModel> orders, int total, int totalPages})> getOrders({int page = 1, int limit = 20, String? status}) async =>
      (orders: <OrderModel>[], total: 0, totalPages: 1);
}

class _NotifRepo extends NotificationsRepository {
  _NotifRepo() : super(Dio());
  List<NotificationModel> items = const [];
  int unread = 0;
  @override
  Future<({List<NotificationModel> items, int unread})> getNotifications({int page = 1, int limit = 20}) async => (items: items, unread: unread);
  @override
  Future<int> getUnreadCount() async => unread;
}

Future<void> _settle() async {
  for (var i = 0; i < 4; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FlavorConfig.initialize);

  late SharedPreferences prefs;
  late TypedCache cache;
  late _CartRepo cartRepo;
  late _NotifRepo notifRepo;
  late FakeAuthNotifier auth;
  late ProviderContainer container;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    cache = TypedCache(prefs);
    cartRepo = _CartRepo();
    notifRepo = _NotifRepo();
    auth = FakeAuthNotifier();
    container = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      typedCacheProvider.overrideWithValue(cache),
      authProvider.overrideWith((ref) => auth),
      cartRepositoryProvider.overrideWithValue(cartRepo),
      ordersRepositoryProvider.overrideWithValue(_OrdersRepo()),
      notificationsRepositoryProvider.overrideWithValue(notifRepo),
    ]);
    addTearDown(container.dispose);
    // Instantiate the account-scoped providers the way the app does (lazily,
    // but alive across the whole session).
    container.listen(cartProvider, (_, __) {}, fireImmediately: true);
    container.listen(ordersProvider, (_, __) {}, fireImmediately: true);
    container.listen(notificationsProvider, (_, __) {}, fireImmediately: true);
  });

  test('login A → private state; logout → nothing of A remains; login B → only B', () async {
    // --- Buyer A ---------------------------------------------------------
    cartRepo.byUser['A'] = [_item('pA')];
    cartRepo.current = 'A';
    notifRepo.items = [NotificationModel(id: 'nA', title: 'Commande A', body: '', type: 'ORDER', createdAt: DateTime(2026, 9, 1))];
    notifRepo.unread = 1;
    auth.signIn('A');
    await _settle();
    expect(container.read(cartProvider).items.single.productId, 'pA');
    expect(prefs.getString(CacheKeys.buyerCart), contains('pA'), reason: 'cart snapshot cached on disk');
    expect(container.read(notificationsProvider).items.single.id, 'nA');
    expect(await container.read(notificationUnreadCountProvider.future), 1);
    final scope = SessionScope(cache, RecentlyViewedStore(prefs), RecentSearchesStore());
    await scope.cacheProfile({'id': 'A', 'firstName': 'Aline'});
    await prefs.setString('teka_recently_viewed', '[{"id":"pA","title":"Robe A","priceCDF":"1","condition":"NEW","quantity":1,"seller":{"id":"s","businessName":"s"}}]');
    expect(RecentlyViewedStore(prefs).getAll(), isNotEmpty, reason: 'precondition: history present');
    await RecentSearchesStore().add('robe wax');

    // --- logout (what AuthNotifier.logout() does: disk first, then state) ---
    await scope.clearPrivateState();
    auth.signOut();
    await _settle();
    expect(container.read(cartProvider).items, isEmpty);
    expect(container.read(cartProvider).isLoading, isFalse);
    expect(prefs.getString(CacheKeys.buyerCart), isNull, reason: 'cart snapshot evicted');
    expect(container.read(ordersProvider).orders, isEmpty);
    expect(container.read(notificationsProvider).items, isEmpty);
    expect(await container.read(notificationUnreadCountProvider.future), 0, reason: 'guests have no badge');
    expect(scope.readCachedProfile(), isNull);
    expect(RecentlyViewedStore(prefs).getAll(), isEmpty);
    expect(await RecentSearchesStore().get(), isEmpty);

    // --- Buyer B ---------------------------------------------------------
    cartRepo.byUser['B'] = [_item('pB')];
    cartRepo.current = 'B';
    notifRepo.items = const [];
    notifRepo.unread = 0;
    auth.signIn('B');
    await _settle();
    final cart = container.read(cartProvider).items.map((i) => i.productId).toList();
    expect(cart, ['pB']);
    expect(cart, isNot(contains('pA')));
    expect(prefs.getString(CacheKeys.buyerCart), isNot(contains('pA')));
    expect(container.read(notificationsProvider).items, isEmpty);
    expect(await container.read(notificationUnreadCountProvider.future), 0);
  });

  test('a guest never fires the cart fetch (no doomed GET /v1/cart on every product page)', () async {
    cartRepo.byUser['A'] = [_item('pA')];
    cartRepo.current = 'A';
    await _settle();
    expect(container.read(cartProvider).items, isEmpty);
    expect(container.read(cartProvider).isLoading, isFalse);
  });

  test('an offline (unverified) session still hydrates the cached cart', () async {
    // A previous online session left a snapshot on disk…
    cartRepo.byUser['A'] = [_item('pA')];
    cartRepo.current = 'A';
    auth.signIn('A');
    await _settle();
    expect(prefs.getString(CacheKeys.buyerCart), contains('pA'));
    // …the notifier is recreated on the next launch, the network is down.
    container.dispose();
    cartRepo.byUser.clear();
    final offlineRepo = _CartRepo()..current = 'A';
    final c2 = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      typedCacheProvider.overrideWithValue(cache),
      authProvider.overrideWith((ref) => FakeAuthNotifier()),
      cartRepositoryProvider.overrideWithValue(offlineRepo),
    ]);
    addTearDown(c2.dispose);
    c2.listen(cartProvider, (_, __) {}, fireImmediately: true);
    (c2.read(authProvider.notifier) as FakeAuthNotifier).state = const AuthState(
      status: AuthStatus.authenticated,
      user: {'id': 'A', 'role': 'BUYER'},
      sessionVerified: false,
    );
    // Hydration is synchronous on session start; the fetch fails silently.
    expect(c2.read(cartProvider).items.map((i) => i.productId), ['pA']);
  });
}
