// Run only with --flavor development --dart-define-from-file=flavors/development.json.
// Preview entrypoint is never imported by lib/main.dart; all data is in-memory.
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:seller_mobile/core/router/seller_main_shell.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/orders/presentation/providers/orders_provider.dart';
import 'package:seller_mobile/features/orders/presentation/screens/orders_list_screen.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import 'package:seller_mobile/features/products/presentation/screens/products_list_screen.dart';
import '../test/support/seller_list_fixtures.dart';

void main() {
  if (!kDebugMode || const String.fromEnvironment('FLAVOR') != 'development') {
    throw StateError('Seller UX preview requires a development debug build.');
  }
  runApp(const SellerUxPreview());
}

class SellerUxPreview extends StatefulWidget {
  const SellerUxPreview({super.key});
  @override
  State<SellerUxPreview> createState() => _SellerUxPreviewState();
}

class _SellerUxPreviewState extends State<SellerUxPreview> {
  String scenario = 'Données';
  double scale = 1;
  int version = 0;
  late final GoRouter router = GoRouter(
    initialLocation: '/products',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (_, __, shell) => SellerMainShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
              routes: [GoRoute(path: '/', builder: (_, __) => settings())]),
          StatefulShellBranch(routes: [
            GoRoute(
                path: '/orders', builder: (_, __) => const OrdersListScreen())
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
                path: '/products',
                builder: (_, __) => const ProductsListScreen())
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
          path: '/products/new',
          builder: (_, __) => const Scaffold(
              body:
                  Center(child: Text('Destination création — aperçu local')))),
      GoRoute(
          path: '/products/:id',
          builder: (_, state) => Scaffold(
              appBar: AppBar(title: const Text('Destination produit')),
              body: Text(state.pathParameters['id']!))),
      GoRoute(
          path: '/orders/:id',
          builder: (_, state) => Scaffold(
              appBar: AppBar(title: const Text('Destination commande')),
              body: Text(state.pathParameters['id']!))),
    ],
  );

  Widget settings() => Scaffold(
        appBar: AppBar(title: const Text('Aperçu local UX')),
        body: ListView(children: [
          for (final value in ['Données', 'Vide', 'Erreur', 'Chargement'])
            ListTile(
                title: Text(value),
                onTap: () => setState(() {
                      scenario = value;
                      version++;
                    })),
          ListTile(
              title: const Text('Texte normal / agrandi (2×)'),
              onTap: () => setState(() {
                    scale = scale == 1 ? 2 : 1;
                    version++;
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
          sellerOrdersProvider.overrideWith((_) => FixtureOrdersNotifier(
              FixtureOrdersRepository(),
              SellerOrdersState(
                orders: scenario == 'Données' ? fixtureOrders : [],
                total: scenario == 'Données' ? fixtureOrders.length : 0,
                isLoading: scenario == 'Chargement',
                error: scenario == 'Erreur'
                    ? 'Vérifiez votre connexion puis réessayez.'
                    : null,
              ))),
          sellerProductsProvider.overrideWith((_) => FixtureProductsNotifier(
              FixtureProductsRepository(),
              ProductsListState(
                products: scenario == 'Données' ? fixtureProducts : [],
                total: scenario == 'Données' ? fixtureProducts.length : 0,
                isLoading: scenario == 'Chargement',
                error: scenario == 'Erreur'
                    ? 'Vérifiez votre connexion puis réessayez.'
                    : null,
              ))),
        ],
        child: MaterialApp.router(
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          locale: const Locale('fr'),
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          supportedLocales: const [Locale('fr')],
          routerConfig: router,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
        ),
      );
}
