import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/core/theme/teka_colors.dart';
import 'package:seller_mobile/core/widgets/seller_list_state.dart';
import 'package:seller_mobile/features/orders/data/models/order_model.dart';
import 'package:seller_mobile/features/orders/presentation/providers/orders_provider.dart';
import 'package:seller_mobile/features/orders/presentation/screens/orders_list_screen.dart';
import 'package:seller_mobile/features/orders/presentation/widgets/order_status_badge.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import 'package:seller_mobile/features/products/presentation/screens/products_list_screen.dart';
import '../../support/seller_list_fixtures.dart';

Future<void> pumpScreen(
  WidgetTester tester, {
  bool products = false,
  double width = 390,
  double height = 844,
  double keyboard = 0,
  double scale = 1,
  SellerOrdersState? ordersState,
  ProductsListState? productsState,
  FixtureOrdersRepository? ordersRepository,
  FixtureProductsRepository? productsRepository,
}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final router = GoRouter(
    initialLocation: products ? '/products' : '/orders',
    routes: [
      GoRoute(path: '/orders', builder: (_, __) => const OrdersListScreen()),
      GoRoute(
          path: '/orders/:id',
          builder: (_, state) =>
              Scaffold(body: Text('Commande ${state.pathParameters['id']}'))),
      GoRoute(
          path: '/products', builder: (_, __) => const ProductsListScreen()),
      GoRoute(
          path: '/products/new',
          builder: (_, __) => const Scaffold(body: Text('Créer un produit'))),
      GoRoute(
          path: '/products/:id',
          builder: (_, state) =>
              Scaffold(body: Text('Produit ${state.pathParameters['id']}'))),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      sellerOrdersProvider.overrideWith((_) => FixtureOrdersNotifier(
            ordersRepository ?? FixtureOrdersRepository(),
            ordersState ??
                SellerOrdersState(
                    orders: fixtureOrders, total: fixtureOrders.length),
          )),
      sellerProductsProvider.overrideWith((_) => FixtureProductsNotifier(
            productsRepository ?? FixtureProductsRepository(),
            productsState ??
                ProductsListState(
                    products: fixtureProducts, total: fixtureProducts.length),
          )),
    ],
    child: MaterialApp.router(
      theme: AppTheme.lightTheme,
      locale: const Locale('fr'),
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      supportedLocales: const [Locale('fr')],
      routerConfig: router,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(scale),
            viewInsets: EdgeInsets.only(bottom: keyboard)),
        child: child!,
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  for (final products in [false, true]) {
    for (final width in [320.0, 390.0, 834.0]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets(
            '${products ? 'products' : 'orders'} long names / money / no image at $width / $scale×',
            (tester) async {
          await pumpScreen(tester,
              products: products, width: width, scale: scale);
          expect(tester.takeException(), isNull);
          final list = find.byType(ListView).last;
          await tester.drag(list, const Offset(0, -650));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        });
      }
    }
  }

  testWidgets('all order statuses remain reachable with expanded text',
      (tester) async {
    final repo = FixtureOrdersRepository();
    await pumpScreen(tester, ordersRepository: repo, width: 320, scale: 2);
    final chip = find.widgetWithText(ChoiceChip, 'Reçues par Teka');
    await tester.ensureVisible(chip);
    await tester.tap(chip);
    await tester.pumpAndSettle();
    expect(repo.lastStatus, 'RECEIVED_AT_TEKA');
    expect(find.byType(OrderStatusBadge), findsOneWidget);
    expect(
        tester.widget<OrderStatusBadge>(find.byType(OrderStatusBadge)).status,
        OrderStatus.receivedAtTeka);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'filtered empty orders reset to all through the existing provider',
      (tester) async {
    final repo = FixtureOrdersRepository();
    await pumpScreen(tester,
        ordersRepository: repo,
        ordersState:
            const SellerOrdersState(selectedStatus: OrderStatus.pending));
    expect(find.text('Aucune commande dans ce statut'), findsOneWidget);
    await tester.tap(find.text('Voir toutes les commandes'));
    await tester.pumpAndSettle();
    expect(repo.calls, 1);
    expect(repo.lastStatus, isNull);
    expect(find.byType(OrderStatusBadge), findsWidgets);
  });

  testWidgets('empty orders can refresh without an existing row',
      (tester) async {
    final repo = FixtureOrdersRepository();
    await pumpScreen(tester,
        ordersRepository: repo, ordersState: const SellerOrdersState());
    await tester.drag(find.byType(CustomScrollView), const Offset(0, 350));
    await tester.pumpAndSettle();
    expect(repo.calls, 1);
  });

  for (final products in [false, true]) {
    testWidgets(
        '${products ? 'products' : 'orders'} error is actionable at 320 px / 2×',
        (tester) async {
      final ordersRepo = FixtureOrdersRepository();
      final productsRepo = FixtureProductsRepository();
      await pumpScreen(
        tester,
        products: products,
        width: 320,
        scale: 2,
        ordersRepository: ordersRepo,
        productsRepository: productsRepo,
        ordersState: const SellerOrdersState(
            error: 'Vérifiez votre connexion puis réessayez.'),
        productsState: const ProductsListState(
            error: 'Vérifiez votre connexion puis réessayez.'),
      );
      expect(find.text('Vérifiez votre connexion puis réessayez.'),
          findsOneWidget);
      await tester.ensureVisible(find.text('Réessayer'));
      await tester.tap(find.text('Réessayer'));
      await tester.pumpAndSettle();
      expect(products ? productsRepo.calls : ordersRepo.calls, 1);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('no-result search clears query and field with one request',
      (tester) async {
    final repo = FixtureProductsRepository();
    await pumpScreen(tester,
        products: true,
        productsRepository: repo,
        productsState: const ProductsListState(search: 'introuvable'));
    expect(find.text('Aucun produit trouvé'), findsOneWidget);
    expect(find.text('Votre catalogue commence ici'), findsNothing);
    await tester
        .tap(find.widgetWithText(OutlinedButton, 'Effacer la recherche'));
    await tester.pumpAndSettle();
    expect(repo.searches, ['']);
    expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text, '');
  });

  testWidgets(
      'clear search cancels the pending debounce instead of restoring it',
      (tester) async {
    final repo = FixtureProductsRepository();
    await pumpScreen(tester, products: true, productsRepository: repo);
    await tester.enterText(find.byType(TextField), 'introuvable');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.byTooltip('Effacer la recherche'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(repo.searches, isEmpty); // already unfiltered: no redundant read
    expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text, '');
  });

  testWidgets('catalog creation and row navigation retain their routes',
      (tester) async {
    await pumpScreen(tester,
        products: true, productsState: const ProductsListState());
    await tester.tap(find.widgetWithText(OutlinedButton, 'Nouveau produit'));
    await tester.pumpAndSettle();
    expect(find.text('Créer un produit'), findsOneWidget);
  });

  testWidgets('order row opens that order', (tester) async {
    await pumpScreen(tester);
    await tester.tap(find.text('Commande TK-20260903-000125').first);
    await tester.pumpAndSettle();
    expect(find.text('Commande order-pending'), findsOneWidget);
  });

  testWidgets('product row opens that product', (tester) async {
    await pumpScreen(tester, products: true);
    await tester.tap(find.text(fixtureProducts.first.title).first);
    await tester.pumpAndSettle();
    expect(find.text('Produit product-draft'), findsOneWidget);
  });

  testWidgets('loading announces progress and does not announce empty data',
      (tester) async {
    final handle = tester.ensureSemantics();
    await pumpScreen(tester,
        products: true,
        productsState: const ProductsListState(isLoading: true));
    expect(find.byType(SellerListLoading), findsOneWidget);
    expect(find.bySemanticsLabel('Chargement des produits'), findsOneWidget);
    expect(find.text('Votre catalogue commence ici'), findsNothing);
    handle.dispose();
  });

  testWidgets('filter touch targets and labelled controls remain accessible',
      (tester) async {
    final handle = tester.ensureSemantics();
    await pumpScreen(tester, products: true);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    handle.dispose();
  });

  testWidgets('short screen with keyboard and 2× text stays scrollable',
      (tester) async {
    await pumpScreen(tester,
        products: true,
        width: 320,
        height: 568,
        keyboard: 240,
        scale: 2,
        productsState: const ProductsListState(search: 'introuvable'));
    await tester.ensureVisible(
        find.widgetWithText(OutlinedButton, 'Effacer la recherche'));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'pagination failure keeps rows and offers a retry without automatic refetch',
      (tester) async {
    final repo = FixtureOrdersRepository();
    await pumpScreen(tester,
        ordersRepository: repo,
        ordersState: SellerOrdersState(
            orders: [fixtureOrders.first],
            total: 50,
            error: 'Chargement interrompu. Réessayez.'));
    expect(find.byType(OrderStatusBadge), findsOneWidget);
    await tester.ensureVisible(find.text('Réessayer'));
    expect(repo.calls, 0);
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(repo.calls, 1);
    expect(find.text('Chargement interrompu. Réessayez.'), findsNothing);
  });

  test('status text tones achieve at least 4.5:1 on their rendered backgrounds',
      () {
    for (final color in [
      TekaColors.warningForeground,
      TekaColors.successForeground,
      TekaColors.destructiveForeground,
      TekaColors.infoForeground,
      TekaColors.neutralForeground
    ]) {
      final bg = Color.alphaBlend(
          color.withValues(alpha: 0.08), TekaColors.background);
      expect((bg.computeLuminance() + 0.05) / (color.computeLuminance() + 0.05),
          greaterThanOrEqualTo(4.5));
    }
  });
}
