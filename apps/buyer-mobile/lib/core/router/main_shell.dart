import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/teka_colors.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/cart/presentation/providers/cart_provider.dart';

/// Persistent bottom-navigation scaffold wrapping the five top-level
/// destinations (Accueil · Categories · Favoris · Panier · Compte).
///
/// Hosts a [StatefulNavigationShell] (one navigator per branch) so each tab
/// keeps its own navigation stack + scroll position, and switching tabs never
/// rebuilds the others. Full-screen flows (product detail, search, checkout,
/// auth, notifications) live OUTSIDE the shell — they cover the bar with their
/// own back button. Top-level tabs are reached only via the bar, so they never
/// show a back arrow (this is what fixes the old Favorites back-button
/// inconsistency — it is now a tab, not a pushed/replaced route).
class MainShell extends ConsumerWidget {
  final StatefulNavigationShell navigationShell;
  const MainShell({super.key, required this.navigationShell});

  void _onTap(int index) {
    // Tapping the active tab again pops it back to its root (initialLocation:
    // true only when re-selecting the current branch) — standard tab UX.
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Cart badge: only authenticated users have a cart (auth-only endpoint),
    // so guests never watch it (no 401) and the badge stays hidden.
    final authed = ref.watch(
      authProvider.select((s) => s.status == AuthStatus.authenticated),
    );
    final cartCount = authed ? ref.watch(cartItemCountProvider) : 0;

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: _BottomBarFrame(
        child: NavigationBar(
          selectedIndex: navigationShell.currentIndex,
          onDestinationSelected: _onTap,
          backgroundColor: Colors.transparent,
          indicatorColor: TekaColors.tekaRedSubtle,
          surfaceTintColor: Colors.transparent,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: [
            const NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home, color: TekaColors.tekaRed),
              label: 'Accueil',
            ),
            const NavigationDestination(
              icon: Icon(Icons.grid_view_outlined),
              selectedIcon:
                  Icon(Icons.grid_view_rounded, color: TekaColors.tekaRed),
              label: 'Catégories',
            ),
            const NavigationDestination(
              icon: Icon(Icons.favorite_border),
              selectedIcon: Icon(Icons.favorite, color: TekaColors.tekaRed),
              label: 'Favoris',
            ),
            NavigationDestination(
              icon: _CartTabIcon(count: cartCount, selected: false),
              selectedIcon: _CartTabIcon(count: cartCount, selected: true),
              label: 'Panier',
            ),
            const NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person, color: TekaColors.tekaRed),
              label: 'Compte',
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomBarFrame extends StatelessWidget {
  final Widget child;
  const _BottomBarFrame({required this.child});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: TekaColors.surface,
        border: Border(
          top: BorderSide(color: TekaColors.border),
        ),
        boxShadow: [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 18,
            offset: Offset(0, -6),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: child,
        ),
      ),
    );
  }
}

class _CartTabIcon extends StatelessWidget {
  final int count;
  final bool selected;
  const _CartTabIcon({required this.count, required this.selected});

  @override
  Widget build(BuildContext context) {
    final icon = Icon(
      selected ? Icons.shopping_cart : Icons.shopping_cart_outlined,
      color: selected ? TekaColors.tekaRed : null,
    );
    if (count <= 0) return icon;
    return Badge(
      label: Text(count > 99 ? '99+' : '$count'),
      backgroundColor: TekaColors.tekaRed,
      textColor: Colors.white,
      child: icon,
    );
  }
}
