// Development debug entrypoint only. Uses real screens/repositories against an
// in-memory Dio interceptor. No API, auth storage, Firebase or analytics calls.
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:seller_mobile/core/network/api_client.dart';
import 'package:seller_mobile/core/providers/seller_refresh_provider.dart';
import 'package:seller_mobile/core/router/seller_main_shell.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/home/presentation/home_screen.dart';
import 'package:seller_mobile/features/home/presentation/providers/seller_dashboard_provider.dart';
import 'package:seller_mobile/features/notifications/presentation/providers/notifications_provider.dart';
import 'package:seller_mobile/features/orders/data/models/order_stats.dart';
import 'package:seller_mobile/features/orders/presentation/screens/order_detail_screen.dart';
import 'package:seller_mobile/features/orders/presentation/screens/orders_list_screen.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/screens/product_detail_screen.dart';
import 'package:seller_mobile/features/products/presentation/screens/products_list_screen.dart';
import '../test/support/seller_dashboard_fixtures.dart';

void main() {
  if (!kDebugMode || const String.fromEnvironment('FLAVOR') != 'development') {
    throw StateError(
        'Seller actions preview requires a development debug build.');
  }
  runApp(const SellerActionsPreview());
}

class SellerActionsPreview extends StatefulWidget {
  const SellerActionsPreview({super.key});
  @override
  State<SellerActionsPreview> createState() => _SellerActionsPreviewState();
}

class _SellerActionsPreviewState extends State<SellerActionsPreview> {
  String scenario = 'Données';
  int version = 0;
  double scale = 1;
  DashboardFixtureApi api = DashboardFixtureApi();
  late final GoRouter router = GoRouter(routes: [
    StatefulShellRoute.indexedStack(
      builder: (_, __, shell) => SellerMainShell(navigationShell: shell),
      branches: [
        StatefulShellBranch(routes: [
          GoRoute(path: '/', builder: (_, __) => const HomeScreen())
        ]),
        StatefulShellBranch(routes: [
          GoRoute(
              path: '/orders',
              builder: (_, state) => OrdersListScreen(
                  statusQuery: state.uri.queryParameters['status'],
                  syncWithRoute: true))
        ]),
        StatefulShellBranch(routes: [
          GoRoute(
              path: '/products',
              builder: (_, state) => ProductsListScreen(
                  statusQuery: state.uri.queryParameters['status'],
                  syncWithRoute: true))
        ]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/earnings', builder: (_, __) => settings())
        ]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/profile', builder: (_, __) => settings())
        ]),
      ],
    ),
    GoRoute(
        path: '/orders/:id',
        builder: (_, s) => OrderDetailScreen(orderId: s.pathParameters['id']!)),
    GoRoute(path: '/products/new', builder: (_, __) => destination()),
    GoRoute(
        path: '/products/:id',
        builder: (_, s) =>
            ProductDetailScreen(productId: s.pathParameters['id']!)),
    for (final path in [
      '/products/:id/edit',
      '/products/:id/images',
      '/reviews',
      '/promotions',
      '/notifications',
      '/auth/login'
    ])
      GoRoute(path: path, builder: (_, __) => destination()),
  ]);

  Widget destination() => Scaffold(
      appBar: AppBar(title: const Text('Aperçu local')),
      body: const Padding(
          padding: EdgeInsets.all(24),
          child: Text(
              'Destination hors de ce scénario. Aucune donnée réelle n’est modifiée.')));

  void setScenario(String value) => setState(() {
        scenario = value;
        version++;
        api = DashboardFixtureApi();
        if (scenario == 'Vide') {
          api.orders.clear();
          api.products.clear();
        }
        api.failStats = scenario == 'Erreur';
      });

  Widget settings() => Scaffold(
        appBar: AppBar(title: const Text('Scénarios locaux — actions')),
        body: ListView(children: [
          for (final value in ['Données', 'Vide', 'Erreur', 'Chargement'])
            ListTile(title: Text(value), onTap: () => setScenario(value)),
          ListTile(
              title: const Text('Texte normal / agrandi (2×)'),
              onTap: () => setState(() => scale = scale == 1 ? 2 : 1)),
          Consumer(
              builder: (_, ref, __) => ListTile(
                  title: const Text('Rétablir les compteurs après erreur'),
                  onTap: () {
                    api.failStats = false;
                    ref.read(sellerRefreshProvider.notifier).ordersChanged();
                    ref.read(sellerRefreshProvider.notifier).productsChanged();
                  })),
        ]),
      );

  @override
  void dispose() {
    router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ProviderScope(
        key: ValueKey(version),
        overrides: [
          authProvider.overrideWith((_) => FixtureAuthNotifier()),
          notificationsProvider
              .overrideWith((_) => FixtureNotificationsNotifier()),
          dioProvider.overrideWithValue(api.dio),
          if (scenario == 'Chargement') ...[
            sellerOrderStatsRequestProvider('seller-fixture')
                .overrideWith((_) => Completer<SellerOrderStats>().future),
            sellerProductStatsRequestProvider('seller-fixture')
                .overrideWith((_) => Completer<ProductStats>().future),
          ],
        ],
        child: Consumer(builder: (_, ref, __) {
          ref.watch(sellerRefreshProvider.notifier);
          return MaterialApp.router(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme,
            locale: const Locale('fr'),
            supportedLocales: const [Locale('fr')],
            localizationsDelegates: GlobalMaterialLocalizations.delegates,
            routerConfig: router,
            builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(scale)),
                child: child!),
          );
        }),
      );
}
