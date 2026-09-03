import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:seller_mobile/core/network/api_client.dart';
import 'package:seller_mobile/core/router/app_router.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/home/presentation/providers/seller_dashboard_provider.dart';
import 'package:seller_mobile/features/notifications/presentation/providers/notifications_provider.dart';
import 'package:seller_mobile/features/orders/data/models/order_model.dart';
import 'package:seller_mobile/features/orders/data/models/order_stats.dart';
import 'package:seller_mobile/features/orders/presentation/providers/orders_provider.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import '../../support/seller_dashboard_fixtures.dart';

Future<(ProviderContainer, GoRouter)> _pump(
  WidgetTester tester, {
  double width = 390,
  double scale = 1,
  DashboardFixtureApi? api,
  List<Override> overrides = const [],
  bool settle = true,
}) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final container = ProviderContainer(overrides: [
    authProvider.overrideWith((_) => FixtureAuthNotifier()),
    notificationsProvider.overrideWith((_) => FixtureNotificationsNotifier()),
    dioProvider.overrideWithValue((api ?? DashboardFixtureApi()).dio),
    ...overrides,
  ]);
  final router = container.read(appRouterProvider);
  addTearDown(() {
    router.dispose();
    container.dispose();
  });
  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: MaterialApp.router(
      theme: AppTheme.lightTheme,
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      routerConfig: router,
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!),
    ),
  ));
  if (settle) await tester.pumpAndSettle();
  return (container, router);
}

void main() {
  for (final width in [320.0, 390.0, 834.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('dashboard fits $width at text scale $scale', (tester) async {
        await _pump(tester, width: width, scale: scale);
        expect(find.text('Actions requises'), findsOneWidget);
        expect(find.text('25'), findsOneWidget);
        expect(find.text('7'), findsOneWidget,
            reason: 'unread notifications stay separate');
        await tester.scrollUntilVisible(find.text('Promotions'), 300,
            scrollable: find.byType(Scrollable).first);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets(
      'pending action opens exact query; completing a command preserves queue and refreshes home',
      (tester) async {
    final api = DashboardFixtureApi();
    final (container, router) = await _pump(tester, api: api);
    await tester.tap(find.text('Commandes à confirmer'));
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.toString(),
        '/orders?status=PENDING');
    expect(container.read(sellerOrdersProvider).selectedStatus,
        OrderStatus.pending);
    expect(api.requests.where((r) => r.path == '/v1/sellers/orders').length, 1);
    await tester.tap(find.text('Commande TK-20260903-pending-0'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmer'));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(
        of: find.byType(AlertDialog),
        matching: find.widgetWithText(ElevatedButton, 'Confirmer')));
    await tester.pumpAndSettle();
    router.pop();
    await tester.pumpAndSettle();
    expect(container.read(sellerOrdersProvider).selectedStatus,
        OrderStatus.pending);
    expect(find.text('Commande TK-20260903-pending-0'), findsNothing);
    router.go('/');
    await tester.pumpAndSettle();
    expect(find.text('24'), findsOneWidget);
  });

  testWidgets(
      'correction action clears pending search even on a previously mounted product tab',
      (tester) async {
    final (container, router) = await _pump(tester);
    router.go('/products');
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'introuvable');
    // Navigate before the debounce submits; the search state still equals ''.
    router.go('/');
    await tester.pump();
    await tester.scrollUntilVisible(find.text('Produits à corriger'), 250,
        scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(find.text('Produits à corriger'));
    await tester.pump();
    await tester.tap(find.text('Produits à corriger'));
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.toString(),
        '/products?status=REJECTED');
    expect(container.read(sellerProductsProvider).statusFilter,
        ProductStatus.rejected);
    expect(container.read(sellerProductsProvider).search, isEmpty);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty);
    expect(
        container.read(sellerProductsProvider).products.single.id, 'rejected');
    // Change the filter, then revisit the same action to rule out stale route state.
    await tester.tap(find.text('Tous'));
    await tester.pumpAndSettle();
    router.go('/');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Produits à corriger'));
    await tester.pump();
    await tester.tap(find.text('Produits à corriger'));
    await tester.pumpAndSettle();
    expect(
        container.read(sellerProductsProvider).products.single.id, 'rejected');
    await tester.tap(find.text('Sac de voyage — démonstration'));
    await tester.pumpAndSettle();
    expect(find.text('Motif du rejet'), findsOneWidget);
  });

  testWidgets('empty order recovery clears the query as well as the state',
      (tester) async {
    final api = DashboardFixtureApi();
    api.orders.clear();
    final (container, router) = await _pump(tester, api: api);
    router.go('/orders?status=PENDING');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Voir toutes les commandes'));
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.toString(), '/orders');
    expect(container.read(sellerOrdersProvider).selectedStatus, isNull);
  });

  testWidgets(
      'loading and failure never claim there is no work; retry recovers',
      (tester) async {
    final api = DashboardFixtureApi()..failStats = true;
    await _pump(tester, api: api);
    expect(find.text('Commandes indisponibles'), findsOneWidget);
    expect(find.text('Aucune commande à traiter.'), findsNothing);
    expect(find.text('0'), findsNothing);
    api.failStats = false;
    await tester.tap(find.text('Réessayer').first);
    await tester.pumpAndSettle();
    expect(find.text('25'), findsOneWidget);
    expect(find.text('Aucun produit à corriger.'), findsNothing);
  });

  testWidgets('empty queue is compact and preserves catalogue creation',
      (tester) async {
    final api = DashboardFixtureApi();
    api.orders.clear();
    api.products.clear();
    await _pump(tester, api: api);
    expect(find.text('Aucune commande à traiter.'), findsOneWidget);
    expect(find.text('Aucun produit à corriger.'), findsOneWidget);
    expect(find.text('Nouveau produit').hitTestable(), findsOneWidget);
  });

  testWidgets(
      'pull refresh awaits both independent requests without showing stale counts',
      (tester) async {
    final orders = Completer<SellerOrderStats>();
    final products = Completer<ProductStats>();
    var orderCalls = 0, productCalls = 0;
    await _pump(tester, overrides: [
      sellerOrderStatsRequestProvider('seller-fixture').overrideWith((_) =>
          ++orderCalls == 1
              ? Future.value(const SellerOrderStats(pending: 8))
              : orders.future),
      sellerProductStatsRequestProvider('seller-fixture').overrideWith((_) =>
          ++productCalls == 1
              ? Future.value(const ProductStats(rejected: 3))
              : products.future),
    ]);
    final refresh = tester
        .widget<RefreshIndicator>(find.byType(RefreshIndicator))
        .onRefresh();
    var complete = false;
    refresh.then((_) => complete = true);
    await tester.pump();
    await tester.pump();
    expect(find.text('8'), findsNothing);
    orders.complete(const SellerOrderStats());
    await tester.pump();
    expect(complete, isFalse);
    products.complete(const ProductStats());
    await tester.pump();
    await refresh;
    expect(complete, isTrue);
    expect(orderCalls, 2);
    expect(productCalls, 2);
  });
}
