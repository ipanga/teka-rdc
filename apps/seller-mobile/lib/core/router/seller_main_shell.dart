import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/home/presentation/providers/seller_dashboard_provider.dart';
import '../layout/responsive.dart';
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
///
/// One badge, on « Commandes » only (Seller UX PR B): the count of orders
/// the seller must act on (confirm / prepare / finish), from the same
/// authoritative stats the dashboard shows, so a new order is visible while
/// the seller is editing a product or checking earnings. Rejected products
/// and verification stay in the Action Center: a badge per tab would turn
/// the bar into a second dashboard. Hidden while loading or on error — a
/// badge must never say « 0 » or show a stale number with confidence.
class SellerMainShell extends ConsumerWidget {
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
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(sellerOrderStatsProvider);
    final pendingOrders =
        stats.isLoading ? 0 : (stats.valueOrNull?.requiredActions ?? 0);
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: DecoratedBox(
        // The surface is painted full width so the centred destinations read
        // as one continuous bar on a tablet rather than a white block floating
        // on the page background.
        decoration: const BoxDecoration(
          color: TekaColors.background,
          border: Border(top: BorderSide(color: TekaColors.border)),
        ),
        // Tablet phase (2026-09-07): the bar keeps its full-width surface and
        // top border, but the five destinations are centred in a phone-width
        // group instead of each owning a fifth of a 1280 pt screen. Evaluated
        // independently of buyer-mobile: a NavigationRail was rejected for the
        // same shell-restructuring cost, and because a seller triaging orders
        // on a tablet still reaches for the bottom of the screen. Nothing
        // changes on a phone.
        child: ReadableBottomBar(
          maxWidth: kMediumWidthBreakpoint,
          child: NavigationBar(
            height: 80,
            selectedIndex: navigationShell.currentIndex,
            onDestinationSelected: _onTap,
            labelPadding: EdgeInsets.zero,
            destinations: [
              const NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home),
                  label: 'Accueil'),
              NavigationDestination(
                  icon: _OrdersIcon(
                      const Icon(Icons.receipt_long_outlined), pendingOrders),
                  selectedIcon: _OrdersIcon(
                      const Icon(Icons.receipt_long), pendingOrders),
                  tooltip: pendingOrders > 0
                      ? 'Commandes, $pendingOrders à traiter'
                      : 'Commandes',
                  label: 'Commandes'),
              const NavigationDestination(
                  icon: Icon(Icons.inventory_2_outlined),
                  selectedIcon: Icon(Icons.inventory_2),
                  label: 'Produits'),
              const NavigationDestination(
                  icon: Icon(Icons.account_balance_wallet_outlined),
                  selectedIcon: Icon(Icons.account_balance_wallet),
                  label: 'Revenus'),
              const NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: 'Profil'),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrdersIcon extends StatelessWidget {
  const _OrdersIcon(this.icon, this.pending);
  final Widget icon;
  final int pending;

  @override
  Widget build(BuildContext context) {
    if (pending <= 0) return icon;
    // The destination's tooltip carries the count for assistive tech; the
    // visual badge is excluded so « Commandes » is not read twice.
    return Semantics(
      label: '$pending à traiter',
      child: ExcludeSemantics(
        child: Badge(
          label: Text(pending > 99 ? '99+' : '$pending'),
          backgroundColor: TekaColors.warningForeground,
          child: icon,
        ),
      ),
    );
  }
}
