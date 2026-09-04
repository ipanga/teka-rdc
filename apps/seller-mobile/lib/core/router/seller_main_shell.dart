import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/teka_colors.dart';

/// Persistent bottom-navigation scaffold wrapping the five top-level seller
/// destinations (Accueil · Commandes · Produits · Revenus · Profil).
///
/// Hosts a [StatefulNavigationShell] (one navigator per branch) so each tab
/// keeps its own navigation stack + scroll position, and switching tabs never
/// rebuilds the others. Full-screen flows (order detail, product form/detail,
/// payout request, reviews, promotions, notifications, auth) live OUTSIDE the
/// shell — they cover the bar with their own back button. Top-level tabs are
/// reached only via the bar, so they never show a back arrow.
///
/// Uses the Material 3 NavigationBar for bounded label scaling, full tooltips,
/// accessible selection semantics and safe-area handling on small screens.
class SellerMainShell extends StatelessWidget {
  final StatefulNavigationShell navigationShell;
  const SellerMainShell({super.key, required this.navigationShell});

  void _onTap(int index) {
    // Tapping the active tab again pops it back to its root (initialLocation:
    // true only when re-selecting the current branch) — standard tab UX.
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: TekaColors.border)),
        ),
        child: NavigationBar(
          height: 80,
          selectedIndex: navigationShell.currentIndex,
          onDestinationSelected: _onTap,
          labelPadding: EdgeInsets.zero,
          destinations: const [
            NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: 'Accueil'),
            NavigationDestination(
                icon: Icon(Icons.receipt_long_outlined),
                selectedIcon: Icon(Icons.receipt_long),
                label: 'Commandes'),
            NavigationDestination(
                icon: Icon(Icons.inventory_2_outlined),
                selectedIcon: Icon(Icons.inventory_2),
                label: 'Produits'),
            NavigationDestination(
                icon: Icon(Icons.account_balance_wallet_outlined),
                selectedIcon: Icon(Icons.account_balance_wallet),
                label: 'Revenus'),
            NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'Profil'),
          ],
        ),
      ),
    );
  }
}
