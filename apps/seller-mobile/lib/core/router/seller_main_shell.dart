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
/// Mirrors buyer-mobile's `MainShell` so the two apps stay in sync. Colours are
/// left to the app's `NavigationBarTheme` (same as the previous home-screen
/// bar) rather than hard-coded.
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
      bottomNavigationBar: _BottomBarFrame(
        child: _BottomTabBar(
          currentIndex: navigationShell.currentIndex,
          onTap: _onTap,
          items: const [
            _BottomTabItem(
              icon: Icons.home_outlined,
              selectedIcon: Icons.home,
              label: "Accueil",
            ),
            _BottomTabItem(
              icon: Icons.receipt_long_outlined,
              selectedIcon: Icons.receipt_long,
              label: "Commandes",
            ),
            _BottomTabItem(
              icon: Icons.inventory_2_outlined,
              selectedIcon: Icons.inventory_2,
              label: "Produits",
            ),
            _BottomTabItem(
              icon: Icons.account_balance_wallet_outlined,
              selectedIcon: Icons.account_balance_wallet,
              label: "Revenus",
            ),
            _BottomTabItem(
              icon: Icons.person_outline,
              selectedIcon: Icons.person,
              label: "Profil",
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomTabBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<_BottomTabItem> items;

  const _BottomTabBar({
    required this.currentIndex,
    required this.onTap,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 68,
      child: Row(
        children: [
          for (var index = 0; index < items.length; index++)
            Expanded(
              child: _BottomTabButton(
                item: items[index],
                selected: index == currentIndex,
                onTap: () => onTap(index),
              ),
            ),
        ],
      ),
    );
  }
}

class _BottomTabButton extends StatelessWidget {
  final _BottomTabItem item;
  final bool selected;
  final VoidCallback onTap;

  const _BottomTabButton({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = selected ? TekaColors.tekaRed : TekaColors.mutedForeground;

    return Semantics(
      button: true,
      selected: selected,
      label: item.label,
      child: InkWell(
        onTap: onTap,
        splashColor: TekaColors.tekaRed.withValues(alpha: 0.08),
        highlightColor: TekaColors.tekaRed.withValues(alpha: 0.06),
        child: Column(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOutCubic,
              width: selected ? 30 : 0,
              height: 3,
              decoration: BoxDecoration(
                color: selected ? TekaColors.tekaRed : Colors.transparent,
                borderRadius: const BorderRadius.vertical(
                  bottom: Radius.circular(999),
                ),
              ),
            ),
            Expanded(
              child: IconTheme(
                data: IconThemeData(color: color, size: 25),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(selected ? item.selectedIcon : item.icon),
                    const SizedBox(height: 4),
                    AnimatedDefaultTextStyle(
                      duration: const Duration(milliseconds: 180),
                      curve: Curves.easeOutCubic,
                      style: TextStyle(
                        color: color,
                        fontSize: 11.5,
                        height: 1.1,
                        fontWeight:
                            selected ? FontWeight.w800 : FontWeight.w500,
                      ),
                      child: Text(
                        item.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomTabItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;

  const _BottomTabItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });
}

class _BottomBarFrame extends StatelessWidget {
  final Widget child;
  const _BottomBarFrame({required this.child});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: TekaColors.background,
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
