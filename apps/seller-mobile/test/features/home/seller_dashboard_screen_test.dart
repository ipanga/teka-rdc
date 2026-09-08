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
    expect(find.text('Produits indisponibles'), findsOneWidget);
    expect(find.text('Aucune action requise pour le moment.'), findsNothing);
    expect(find.text('0'), findsNothing);
    api.failStats = false;
    await tester.tap(find.text('Réessayer').first);
    await tester.pumpAndSettle();
    expect(find.text('25'), findsOneWidget);
    // Products still failed: their row keeps its scoped retry, and the
    // « nothing to do » line stays away until every source has answered.
    expect(find.text('Produits indisponibles'), findsOneWidget);
    expect(find.text('Aucune action requise pour le moment.'), findsNothing);
  });

  testWidgets('empty queue is compact and preserves catalogue creation',
      (tester) async {
    final api = DashboardFixtureApi();
    api.orders.clear();
    api.products.clear();
    await _pump(tester, api: api);
    // One positive line for the whole queue — not one « nothing » per source.
    expect(find.text('Aucune action requise pour le moment.'), findsOneWidget);
    expect(find.text('Aucune commande à traiter.'), findsNothing);
    expect(find.text('Aucun produit à corriger.'), findsNothing);
    expect(find.text('Nouveau produit').hitTestable(), findsOneWidget);
    expect(find.text('Suivi'), findsNothing);
    // No orders to act on: the Commandes tab carries no badge.
    expect(find.byType(Badge), findsOneWidget,
        reason: 'only the notifications badge remains');
  });

  testWidgets(
      'pull refresh awaits every independent request without showing stale counts',
      (tester) async {
    final orders = Completer<SellerOrderStats>();
    final products = Completer<ProductStats>();
    var orderCalls = 0, productCalls = 0;
    final api = DashboardFixtureApi();
    await _pump(tester, api: api, overrides: [
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
    // The verification request goes through the fixture Dio, which settles
    // its response on a timer rather than a microtask: elapse a little.
    for (var i = 0; i < 4 && !complete; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    await refresh;
    expect(complete, isTrue);
    expect(orderCalls, 2);
    expect(productCalls, 2);
    expect(
        api.requests.where((r) => r.path == '/v1/sellers/verification').length,
        2,
        reason: 'the verification source is refreshed with the others');
  });

  testWidgets(
      'first paint is a shaped skeleton, never a spinner, and never « nothing to do »',
      (tester) async {
    final orders = Completer<SellerOrderStats>();
    await _pump(tester, settle: false, overrides: [
      sellerOrderStatsRequestProvider('seller-fixture')
          .overrideWith((_) => orders.future),
    ]);
    await tester.pump();
    expect(find.bySemanticsLabel('Chargement des actions'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    expect(find.text('Aucune action requise pour le moment.'), findsNothing);
    expect(find.text('25'), findsNothing,
        reason: 'neither the page nor the Commandes badge shows a count yet');
    orders.complete(const SellerOrderStats(pending: 25));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Chargement des actions'), findsNothing);
    expect(
        find.descendant(of: find.byType(ListView), matching: find.text('25')),
        findsOneWidget);
  });

  testWidgets(
      'rejected verification is a task that opens the verification screen; other states are not',
      (tester) async {
    final api = DashboardFixtureApi()
      ..verification = DashboardFixtureApi.verificationBody('REJECTED');
    final (_, router) = await _pump(tester, api: api);
    await tester.scrollUntilVisible(find.text('Vérification à refaire'), 200,
        scrollable: find.byType(Scrollable).first);
    // Total = 25 + 1 + 1 orders + 1 product + 1 verification.
    expect(find.text('29'), findsOneWidget);
    // Fully above the bottom bar, or the tap lands on a tab.
    await tester.ensureVisible(find.text('Vérification à refaire'));
    await tester.pump();
    await tester.tap(find.ancestor(
        of: find.text('Vérification à refaire'),
        matching: find.byType(InkWell)));
    await tester.pumpAndSettle();
    expect(find.text('Vérification de la boutique'), findsOneWidget,
        reason: 'the verification screen (outside the shell) is pushed');
    router.pop();
    await tester.pumpAndSettle();
    // Back to the top: the header pill is lazily built by the ListView.
    await tester.scrollUntilVisible(find.text('Actions requises'), -200,
        scrollable: find.byType(Scrollable).first);
    for (final quiet in ['PENDING_REVIEW', 'VERIFIED', 'NOT_SUBMITTED']) {
      api.verification = DashboardFixtureApi.verificationBody(quiet);
      // Not awaited directly: the fixture Dio settles on a timer (see the
      // pull-refresh test), so elapse time instead of blocking fake async.
      final refresh = tester
          .widget<RefreshIndicator>(find.byType(RefreshIndicator))
          .onRefresh();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      await refresh;
      expect(find.text('Vérification à refaire'), findsNothing,
          reason: quiet);
      expect(find.text('28'), findsOneWidget, reason: quiet);
    }
  });

  testWidgets(
      'a failed verification source keeps the order tasks and retries alone',
      (tester) async {
    final api = DashboardFixtureApi()..failVerification = true;
    await _pump(tester, api: api);
    expect(find.text('25'), findsOneWidget);
    expect(find.text('Commandes à confirmer'), findsOneWidget);
    expect(find.text('Vérification indisponible'), findsOneWidget);
    expect(find.text('Aucune action requise pour le moment.'), findsNothing);
    // No total while a source is unknown.
    expect(find.bySemanticsLabel(RegExp(r'actions en attente')), findsNothing);
    api.failVerification = false;
    api.verification = DashboardFixtureApi.verificationBody('REJECTED');
    final before =
        api.requests.where((r) => r.path.endsWith('/stats')).length;
    await tester.ensureVisible(find.text('Réessayer'));
    await tester.pump();
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.text('Vérification indisponible'), findsNothing);
    expect(find.text('Vérification à refaire'), findsOneWidget);
    expect(api.requests.where((r) => r.path.endsWith('/stats')).length, before,
        reason: 'retrying one source does not refetch the others');
  });

  testWidgets(
      'Commandes tab carries the one badge, from the same order count',
      (tester) async {
    final api = DashboardFixtureApi();
    final (_, router) = await _pump(tester, api: api);
    final bar = find.byType(NavigationBar);
    expect(find.descendant(of: bar, matching: find.text('27')), findsOneWidget,
        reason: '25 pending + 1 confirmed + 1 processing');
    expect(find.descendant(of: bar, matching: find.byType(Badge)),
        findsOneWidget);
    expect(find.byTooltip('Commandes, 27 à traiter'), findsOneWidget);
    // Confirm one order from the list: the badge follows the stats.
    router.go('/orders?status=PENDING');
    await tester.pumpAndSettle();
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
    expect(find.descendant(of: bar, matching: find.text('27')), findsOneWidget,
        reason: 'a confirmed order still needs preparing: same total');
    // Finishing a preparation hands the order to Teka: one fewer to act on.
    router.go('/orders?status=PROCESSING');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Commande TK-20260903-processing'));
    await tester.pumpAndSettle();
    final ready =
        find.widgetWithText(ElevatedButton, 'Marquer prête pour collecte');
    // Let the previous action's snackbar leave the bottom of the screen.
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await tester.ensureVisible(ready);
    await tester.pump();
    await tester.tap(ready);
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(
        of: find.byType(AlertDialog),
        matching:
            find.widgetWithText(ElevatedButton, 'Marquer prête pour collecte')));
    await tester.pumpAndSettle();
    router.pop();
    await tester.pumpAndSettle();
    expect(find.descendant(of: bar, matching: find.text('26')), findsOneWidget);
    router.go('/');
    await tester.pumpAndSettle();
    expect(find.text('Suivi'), findsOneWidget);
    expect(find.text('Prêtes pour la collecte Teka'), findsOneWidget);
  });

  testWidgets('orders waiting for Teka are tracked, not asked for',
      (tester) async {
    final api = DashboardFixtureApi();
    api.orders
      ..clear()
      ..addAll([
        for (var i = 0; i < 3; i++)
          DashboardFixtureApi.orderRow('ready-$i', 'READY_FOR_TEKA_PICKUP'),
        DashboardFixtureApi.orderRow('shipped', 'SHIPPED'),
      ]);
    api.products.clear();
    final (container, router) = await _pump(tester, api: api);
    expect(find.text('Aucune action requise pour le moment.'), findsOneWidget);
    expect(find.text('Suivi'), findsOneWidget);
    expect(find.text('Prêtes pour la collecte Teka'), findsOneWidget);
    expect(find.byType(Badge), findsOneWidget,
        reason: 'no Commandes badge: nothing to act on');
    await tester.tap(find.text('Prêtes pour la collecte Teka'));
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.toString(),
        '/orders?status=READY_FOR_TEKA_PICKUP');
    expect(container.read(sellerOrdersProvider).selectedStatus,
        OrderStatus.readyForTekaPickup);
  });

  for (final width in [360.0, 412.0]) {
    testWidgets('dashboard with every task fits $width at text scale 1.3',
        (tester) async {
      final api = DashboardFixtureApi()
        ..verification = DashboardFixtureApi.verificationBody('REJECTED');
      await _pump(tester, width: width, scale: 1.3, api: api);
      expect(find.text('Actions requises'), findsOneWidget);
      expect(find.text('29'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Promotions'), 300,
          scrollable: find.byType(Scrollable).first);
      expect(tester.takeException(), isNull);
    });
  }

  for (final width in [1024.0, 1280.0]) {
    testWidgets('tablet $width keeps the Action Center in a readable column',
        (tester) async {
      await _pump(tester, width: width);
      final card = tester.getRect(find
          .ancestor(
              of: find.text('Commandes à confirmer'),
              matching: find.byType(DecoratedBox))
          .first);
      expect(card.width, lessThanOrEqualTo(720));
      expect((card.left - (width - card.width) / 2).abs(), lessThan(1),
          reason: 'centred');
      expect(tester.takeException(), isNull);
    });
  }
}
