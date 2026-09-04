import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/network/api_client.dart';
import 'package:seller_mobile/core/providers/seller_refresh_provider.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/home/presentation/providers/seller_dashboard_provider.dart';
import 'package:seller_mobile/features/orders/data/models/order_model.dart';
import 'package:seller_mobile/features/orders/data/models/order_stats.dart';
import 'package:seller_mobile/features/orders/data/orders_repository.dart';
import 'package:seller_mobile/features/orders/presentation/providers/orders_provider.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import '../../support/seller_dashboard_fixtures.dart';
import '../../support/seller_list_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('global counts are independent of a 20-row page and its filter',
      () async {
    final api = DashboardFixtureApi();
    final container = _container(api);
    container.listen(sellerOrderStatsProvider, (_, __) {});
    container.listen(dashboardStatsProvider, (_, __) {});
    final orders = container.read(sellerOrdersProvider.notifier);
    await orders.loadOrders();
    expect(container.read(sellerOrdersProvider).orders.length, 20);
    expect(
        (await container
                .read(sellerOrderStatsRequestProvider('seller-fixture').future))
            .pending,
        25);
    orders.setStatusFilter(OrderStatus.delivered);
    await container.pump();
    expect(container.read(sellerOrdersProvider).orders, isEmpty);
    expect(container.read(sellerOrderStatsProvider).requireValue.pending, 25);
    expect(container.read(dashboardStatsProvider).requireValue.rejected, 1);
    expect(
        api.requests.where((r) => r.path.endsWith('orders/stats')).length, 1);
  });

  test('every successful order transition reconciles authoritative counts',
      () async {
    final api = DashboardFixtureApi();
    final container = _container(api);
    container.listen(sellerOrderStatsProvider, (_, __) {});
    final key = sellerOrderStatsRequestProvider('seller-fixture');
    await container.read(key.future);
    final repo = container.read(sellerOrdersRepositoryProvider);
    await repo.confirmOrder('pending-0');
    expect((await container.read(key.future)).pending, 24);
    expect(container.read(key).requireValue.confirmed, 2);
    await repo.processOrder('pending-0');
    expect((await container.read(key.future)).processing, 2);
    await repo.markReadyForPickup('pending-0');
    expect((await container.read(key.future)).processing, 1);
    await repo.rejectOrder('pending-1', 'Indisponible');
    expect((await container.read(key.future)).pending, 23);
    expect(
        api.requests.where((r) => r.path.endsWith('orders/stats')).length, 5);
  });

  test(
      'product corrections and all lifecycle mutations invalidate product stats only',
      () async {
    final api = DashboardFixtureApi();
    final container = _container(api);
    container.listen(dashboardStatsProvider, (_, __) {});
    container.listen(sellerOrderStatsProvider, (_, __) {});
    await container
        .read(sellerOrderStatsRequestProvider('seller-fixture').future);
    final key = sellerProductStatsRequestProvider('seller-fixture');
    expect((await container.read(key.future)).rejected, 1);
    final repo = container.read(productsRepositoryProvider);
    await repo
        .updateProduct('rejected', {'description': 'Description complétée'});
    expect((await container.read(key.future)).rejected, 0);
    await repo.submitForReview('rejected');
    expect((await container.read(key.future)).pendingReview, 2);
    await repo.withdrawProduct('active');
    await container.read(key.future);
    await repo.archiveProduct('draft');
    await container.read(key.future);
    await repo.restoreProduct('draft');
    await container.read(key.future);
    await repo.duplicateProduct('draft');
    await container.read(key.future);
    await repo.createProduct({'title': 'Nouveau'});
    await container.read(key.future);
    expect(
        api.requests.where((r) => r.path.endsWith('products/stats')).length, 8);
    expect(
        api.requests.where((r) => r.path.endsWith('orders/stats')).length, 1);
  });

  test('failed mutations do not decrement counts or refetch', () async {
    final api = DashboardFixtureApi()..failMutations = true;
    final container = _container(api);
    container.listen(sellerOrderStatsProvider, (_, __) {});
    container.listen(dashboardStatsProvider, (_, __) {});
    await container
        .read(sellerOrderStatsRequestProvider('seller-fixture').future);
    await container
        .read(sellerProductStatsRequestProvider('seller-fixture').future);
    await expectLater(
        container
            .read(sellerOrdersRepositoryProvider)
            .confirmOrder('pending-0'),
        throwsException);
    await expectLater(
        container
            .read(productsRepositoryProvider)
            .updateProduct('rejected', {}),
        throwsException);
    expect(container.read(sellerOrderStatsProvider).requireValue.pending, 25);
    expect(container.read(dashboardStatsProvider).requireValue.rejected, 1);
    expect(api.requests.where((r) => r.path.endsWith('/stats')).length, 2);
  });

  test('stats failure is an error, and retry can recover to a real empty queue',
      () async {
    final api = DashboardFixtureApi()..failStats = true;
    final container = _container(api);
    container.listen(sellerOrderStatsProvider, (_, __) {});
    final key = sellerOrderStatsRequestProvider('seller-fixture');
    await expectLater(container.read(key.future), throwsException);
    expect(container.read(sellerOrderStatsProvider).hasError, isTrue);
    api.failStats = false;
    api.orders.clear();
    expect((await container.refresh(key.future)).requiredActions, 0);
  });

  test(
      'no request before auth; direct account switch and logout discard old responses and lists',
      () async {
    final auth = FixtureAuthNotifier(id: null);
    final slow = _SlowStats();
    final container = ProviderContainer(overrides: [
      authProvider.overrideWith((_) => auth),
      sellerOrdersRepositoryProvider.overrideWithValue(slow),
    ]);
    addTearDown(container.dispose);
    container.listen(sellerOrderStatsProvider, (_, __) {});
    container.listen(sellerOrdersProvider, (_, __) {});
    await container.pump();
    expect(slow.requests, isEmpty);
    auth.signInAs('first');
    await container.pump();
    expect(slow.requests.length, 1);
    auth.signInAs('second');
    await container.pump();
    expect(slow.requests.length, 2);
    expect(container.read(sellerOrderStatsProvider).isLoading, isTrue);
    slow.requests[1].complete(const SellerOrderStats(pending: 3));
    await container.pump();
    slow.requests[0].complete(const SellerOrderStats(pending: 99));
    await container.pump();
    expect(container.read(sellerOrderStatsProvider).requireValue.pending, 3);
    auth.signInAs(null);
    await container.pump();
    expect(container.read(sellerOrderStatsProvider).valueOrNull, isNull);
    expect(container.read(sellerOrdersProvider).orders, isEmpty);
  });

  testWidgets(
      'push bursts and background resume coalesce; inactive and review pushes do not fetch',
      (tester) async {
    final notifier = SellerRefreshNotifier();
    addTearDown(notifier.dispose);
    notifier.didChangeAppLifecycleState(AppLifecycleState.inactive);
    notifier.didChangeAppLifecycleState(AppLifecycleState.resumed);
    notifier.handlePush({'screen': 'product-reviews'});
    await tester.pump(const Duration(seconds: 1));
    expect(notifier.state, (orders: 0, products: 0, earnings: 0));
    notifier.handlePush({'screen': 'order-details'});
    notifier.handlePush({'screen': 'product-details'});
    notifier.handlePush({'screen': 'order-details'});
    // A payout push (approved / paid / rejected) invalidates the earnings only.
    notifier.handlePush({'screen': 'earnings', 'event': 'payout-paid'});
    notifier.didChangeAppLifecycleState(AppLifecycleState.paused);
    notifier.didChangeAppLifecycleState(AppLifecycleState.resumed);
    await tester.pump(const Duration(milliseconds: 301));
    expect(notifier.state, (orders: 1, products: 1, earnings: 1));
    await tester.pump(const Duration(minutes: 10));
    expect(notifier.state, (orders: 1, products: 1, earnings: 1),
        reason: 'no polling');
  });
}

ProviderContainer _container(DashboardFixtureApi api) {
  final container = ProviderContainer(overrides: [
    authProvider.overrideWith((_) => FixtureAuthNotifier()),
    dioProvider.overrideWithValue(api.dio),
  ]);
  addTearDown(container.dispose);
  return container;
}

class _SlowStats extends FixtureOrdersRepository {
  final requests = <Completer<SellerOrderStats>>[];
  @override
  Future<SellerOrderStats> getOrderStats() {
    final completer = Completer<SellerOrderStats>();
    requests.add(completer);
    return completer.future;
  }
}
