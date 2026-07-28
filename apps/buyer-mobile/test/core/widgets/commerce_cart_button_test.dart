// Regression test for the Product Detail cart icon.
//
// `/cart` is a StatefulShellBranch route — one of the five bottom-nav tabs.
// `context.push('/cart')` from a route outside the shell (e.g. product detail)
// makes GoRouter build a second, orphaned Cart on the root navigator, which
// threw and surfaced as a red error screen. The button must `go` (switch to
// the Panier tab) instead.
//
// The harness mirrors the real router's shape — a StatefulShellRoute with a
// /cart branch plus a pushed detail route — because that shape is the bug.

import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/widgets/commerce_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

GoRouter _router() {
  return GoRouter(
    initialLocation: '/',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => Scaffold(
          body: shell,
          bottomNavigationBar: const SizedBox(height: 56),
        ),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/',
              builder: (context, state) => const Text('HOME TAB'),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/cart',
              builder: (context, state) => const Text('CART TAB'),
            ),
          ]),
        ],
      ),
      // Pushed on the ROOT navigator, exactly like product detail.
      GoRoute(
        path: '/products/:id',
        builder: (context, state) => const Scaffold(
          body: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('PRODUCT DETAIL'),
                CommerceCartButton(),
              ],
            ),
          ),
        ),
      ),
    ],
  );
}

Future<void> _pump(WidgetTester tester, GoRouter router) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  // The button watches authProvider, which reaches FlavorConfig.instance.
  setUpAll(FlavorConfig.initialize);

  group('CommerceCartButton from a pushed route', () {
    testWidgets('opens the Panier tab instead of throwing', (tester) async {
      final router = _router();
      await _pump(tester, router);

      router.push('/products/abc123');
      await tester.pumpAndSettle();
      expect(find.text('PRODUCT DETAIL'), findsOneWidget);

      await tester.tap(find.byTooltip('Panier'));
      await tester.pumpAndSettle();

      // The red error screen was a thrown GoRouter exception surfacing as an
      // ErrorWidget; assert on the outcome rather than the absence of a throw.
      expect(tester.takeException(), isNull);
      expect(find.byType(ErrorWidget), findsNothing);
      expect(find.text('CART TAB'), findsOneWidget);
    });

    testWidgets('does not stack a second Cart on the root navigator',
        (tester) async {
      final router = _router();
      await _pump(tester, router);

      router.push('/products/abc123');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Panier'));
      await tester.pumpAndSettle();

      // `go` replaces the stack with the shell; product detail must not still
      // be underneath, or back would land on a stale detail page and the tab
      // state would be duplicated.
      expect(find.text('PRODUCT DETAIL'), findsNothing);
      expect(find.text('CART TAB'), findsOneWidget);
    });

    testWidgets('an explicit onPressed still wins', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: Scaffold(
              body: CommerceCartButton(onPressed: () => taps++),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Panier'));
      await tester.pumpAndSettle();

      expect(taps, 1);
    });
  });
}
