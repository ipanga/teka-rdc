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
        child: _BottomTabBar(
          currentIndex: navigationShell.currentIndex,
          onTap: _onTap,
          items: [
            const _BottomTabItem(
              icon: Icons.home_outlined,
              selectedIcon: Icons.home,
              label: 'Accueil',
            ),
            const _BottomTabItem(
              icon: Icons.grid_view_outlined,
              selectedIcon: Icons.grid_view_rounded,
              label: 'Catégories',
            ),
            const _BottomTabItem(
              icon: Icons.favorite_border,
              selectedIcon: Icons.favorite,
              label: 'Favoris',
            ),
            _BottomTabItem.custom(
              iconWidget: _CartTabIcon(count: cartCount, selected: false),
              selectedIconWidget: _CartTabIcon(
                count: cartCount,
                selected: true,
              ),
              label: 'Panier',
            ),
            const _BottomTabItem(
              icon: Icons.person_outline,
              selectedIcon: Icons.person,
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
    final icon = item.buildIcon(selected);
    // Five labels share a narrow mobile bar. Let them grow for accessibility,
    // but cap this navigation-only microcopy before it collides with adjacent
    // destinations; the full label remains exposed through Semantics above.
    final requestedScale = MediaQuery.textScalerOf(context).scale(11.5) / 11.5;
    final navigationTextScaler = TextScaler.linear(
      requestedScale.clamp(1.0, 1.35),
    );

    return Semantics(
      button: true,
      selected: selected,
      label: item.label,
      child: InkWell(
        onTap: onTap,
        splashColor: TekaColors.tekaRedSubtle,
        highlightColor: TekaColors.tekaRedSubtle.withValues(alpha: 0.6),
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
                    icon,
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
                        textScaler: navigationTextScaler,
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
  final IconData? icon;
  final IconData? selectedIcon;
  final Widget? iconWidget;
  final Widget? selectedIconWidget;
  final String label;

  const _BottomTabItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
  })  : iconWidget = null,
        selectedIconWidget = null;

  const _BottomTabItem.custom({
    required this.iconWidget,
    required this.selectedIconWidget,
    required this.label,
  })  : icon = null,
        selectedIcon = null;

  Widget buildIcon(bool selected) {
    final customIcon = selected ? selectedIconWidget : iconWidget;
    if (customIcon != null) return customIcon;

    final iconData = selected ? selectedIcon : icon;
    return Icon(iconData);
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
