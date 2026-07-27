import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/cart/presentation/providers/cart_provider.dart';
import '../theme/teka_colors.dart';
import 'app_bar_actions.dart';

/// A non-editable search affordance that always opens the app's existing
/// `/search` flow. The live query field remains owned by SearchScreen.
class CommerceSearchButton extends StatelessWidget {
  final VoidCallback onPressed;
  final String label;
  final bool compact;

  const CommerceSearchButton({
    super.key,
    required this.onPressed,
    this.label = 'Rechercher des produits...',
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      hint: 'Ouvrir la recherche',
      excludeSemantics: true,
      onTap: onPressed,
      child: Material(
        color: TekaColors.surfaceMuted,
        shape: StadiumBorder(
          side: BorderSide(
            color: compact ? Colors.transparent : TekaColors.border,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          customBorder: const StadiumBorder(),
          child: SizedBox(
            height: compact ? 46 : 50,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: compact ? 14 : 16),
              child: Row(
                children: [
                  const Icon(
                    Icons.search_rounded,
                    size: 22,
                    color: TekaColors.foreground,
                  ),
                  SizedBox(width: compact ? 8 : 10),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: TekaColors.mutedForeground,
                            fontWeight: FontWeight.w500,
                          ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Shared cart shortcut for commerce headers. Guests use the existing protected
/// route redirect; authenticated buyers see the same count as the bottom tab.
class CommerceCartButton extends ConsumerWidget {
  final VoidCallback? onPressed;

  const CommerceCartButton({super.key, this.onPressed});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAuthenticated = ref.watch(
      authProvider.select((state) {
        return state.status == AuthStatus.authenticated;
      }),
    );
    final count = isAuthenticated ? ref.watch(cartItemCountProvider) : 0;

    return TekaAppBarIconButton(
      icon: Icons.shopping_cart_outlined,
      tooltip: 'Panier',
      badgeCount: count,
      onPressed: onPressed ?? () => context.push('/cart'),
    );
  }
}

/// Compact pinned commerce bar for listing and detail screens.
///
/// Back navigation remains AppBar-owned, search opens the existing search flow,
/// and cart uses the protected shell route. Root-tab screens opt out of the
/// implicit leading control with [automaticallyImplyLeading].
class CommerceAppBar extends StatelessWidget implements PreferredSizeWidget {
  final bool automaticallyImplyLeading;
  final Widget? leading;
  final String searchLabel;
  final VoidCallback? onSearchPressed;
  final VoidCallback? onCartPressed;

  const CommerceAppBar({
    super.key,
    this.automaticallyImplyLeading = true,
    this.leading,
    this.searchLabel = 'Rechercher...',
    this.onSearchPressed,
    this.onCartPressed,
  });

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      automaticallyImplyLeading: automaticallyImplyLeading,
      leading: leading,
      titleSpacing: automaticallyImplyLeading || leading != null ? 0 : 16,
      title: CommerceSearchButton(
        compact: true,
        label: searchLabel,
        onPressed: onSearchPressed ?? () => context.push('/search'),
      ),
      actions: [
        const SizedBox(width: 8),
        CommerceCartButton(onPressed: onCartPressed),
        const SizedBox(width: 12),
      ],
    );
  }
}

/// Home-only expanded/collapsed header inspired by familiar commerce behavior
/// while retaining Teka's own brand, town, and notification context.
class HomeCommerceHeader extends StatelessWidget {
  final Widget expandedContent;
  final VoidCallback onSearchPressed;
  final VoidCallback? onCartPressed;
  final Widget? compactAction;

  const HomeCommerceHeader({
    super.key,
    required this.expandedContent,
    required this.onSearchPressed,
    this.onCartPressed,
    this.compactAction,
  });

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.paddingOf(context).top;

    return SliverPersistentHeader(
      pinned: true,
      delegate: _HomeCommerceHeaderDelegate(
        topPadding: topPadding,
        expandedContent: expandedContent,
        onSearchPressed: onSearchPressed,
        onCartPressed: onCartPressed,
        compactAction: compactAction,
      ),
    );
  }
}

class _HomeCommerceHeaderDelegate extends SliverPersistentHeaderDelegate {
  static const _collapsedBodyHeight = 66.0;
  static const _expandedBodyHeight = 142.0;

  final double topPadding;
  final Widget expandedContent;
  final VoidCallback onSearchPressed;
  final VoidCallback? onCartPressed;
  final Widget? compactAction;

  const _HomeCommerceHeaderDelegate({
    required this.topPadding,
    required this.expandedContent,
    required this.onSearchPressed,
    required this.onCartPressed,
    required this.compactAction,
  });

  @override
  double get minExtent => topPadding + _collapsedBodyHeight;

  @override
  double get maxExtent => topPadding + _expandedBodyHeight;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final progress = (shrinkOffset / (maxExtent - minExtent)).clamp(0.0, 1.0);
    final expandedOpacity = (1 - progress * 1.5).clamp(0.0, 1.0);
    final compactOpacity = ((progress - 0.35) / 0.65).clamp(0.0, 1.0);
    final searchTop = lerpDouble(82, 8, progress)!;
    final searchRight = lerpDouble(16, 68, progress)!;

    return Material(
      color: TekaColors.surface,
      elevation: overlapsContent || progress > 0.98 ? 1 : 0,
      shadowColor: const Color(0x1A000000),
      child: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(
            bottom: BorderSide(color: TekaColors.border),
          ),
        ),
        child: Padding(
          padding: EdgeInsets.only(top: topPadding),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Positioned(
                left: 16,
                top: 8,
                right: 12,
                height: 60,
                child: IgnorePointer(
                  ignoring: expandedOpacity < 0.5,
                  child: Opacity(
                    opacity: expandedOpacity,
                    child: expandedContent,
                  ),
                ),
              ),
              Positioned(
                left: 16,
                right: searchRight,
                top: searchTop,
                height: 50,
                child: CommerceSearchButton(
                  onPressed: onSearchPressed,
                  compact: progress > 0.5,
                ),
              ),
              Positioned(
                right: 12,
                top: searchTop + 3,
                child: IgnorePointer(
                  ignoring: compactOpacity < 0.75,
                  child: Opacity(
                    opacity: compactOpacity,
                    child: compactAction ??
                        CommerceCartButton(onPressed: onCartPressed),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _HomeCommerceHeaderDelegate oldDelegate) {
    return topPadding != oldDelegate.topPadding ||
        expandedContent != oldDelegate.expandedContent ||
        onSearchPressed != oldDelegate.onSearchPressed ||
        onCartPressed != oldDelegate.onCartPressed ||
        compactAction != oldDelegate.compactAction;
  }
}
