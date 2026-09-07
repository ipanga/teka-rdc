import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/layout/responsive.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';

/// Navigation decision for Seller Mobile (Tablet PR 2, 2026-09-07).
///
/// The Material 3 `NavigationBar` is KEPT. It was evaluated on its own terms
/// rather than inherited from buyer-mobile: a `NavigationRail` would mean
/// restructuring the `StatefulNavigationShell` that gives each of the five
/// destinations its own navigator and scroll position, and a seller working on
/// a tablet still reaches for the bottom of the screen. The five destinations
/// are centred in a phone-width group instead of each owning a fifth of a
/// 1280 pt screen.
///
/// The shell itself needs a GoRouter `StatefulNavigationShell` to build, so
/// these tests pin the wrapper the shell uses, including the regression that
/// a bottom bar must size to its child rather than claim the whole screen.
void main() {
  Future<Size> barSize(WidgetTester tester, double windowWidth) async {
    tester.view.physicalSize = Size(windowWidth, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.lightTheme,
        home: Scaffold(
          body: const SizedBox.expand(key: Key('page')),
          bottomNavigationBar: ReadableBottomBar(
            maxWidth: kMediumWidthBreakpoint,
            child: NavigationBar(
              height: 80,
              selectedIndex: 0,
              onDestinationSelected: (_) {},
              destinations: const [
                NavigationDestination(
                    icon: Icon(Icons.home_outlined), label: 'Accueil'),
                NavigationDestination(
                    icon: Icon(Icons.receipt_long_outlined),
                    label: 'Commandes'),
                NavigationDestination(
                    icon: Icon(Icons.inventory_2_outlined), label: 'Produits'),
                NavigationDestination(
                    icon: Icon(Icons.account_balance_wallet_outlined),
                    label: 'Revenus'),
                NavigationDestination(
                    icon: Icon(Icons.person_outline), label: 'Profil'),
              ],
            ),
          ),
        ),
      ),
    );
    return tester.getSize(find.byType(NavigationBar));
  }

  testWidgets('the bar spans a phone, as before', (tester) async {
    for (final width in <double>[320, 360, 390, 412]) {
      expect((await barSize(tester, width)).width, width,
          reason: 'phone $width');
    }
  });

  testWidgets('the destinations are centred, not stretched, on a tablet',
      (tester) async {
    for (final width in <double>[768, 834, 1024, 1280, 1366]) {
      expect((await barSize(tester, width)).width, kMediumWidthBreakpoint,
          reason: 'tablet $width');
    }
  });

  testWidgets('the bar keeps its own height and leaves the page its space',
      (tester) async {
    final size = await barSize(tester, 1280);
    expect(size.height, 80);
    expect(tester.getSize(find.byKey(const Key('page'))).height, 900 - 80);
  });

  testWidgets('all five destinations stay labelled at tablet width',
      (tester) async {
    await barSize(tester, 1280);
    for (final label in [
      'Accueil',
      'Commandes',
      'Produits',
      'Revenus',
      'Profil',
    ]) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
  });
}
