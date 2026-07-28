import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/auth/auth_guard.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../providers/wishlist_provider.dart';

class WishlistButton extends ConsumerWidget {
  final String productId;
  final double size;
  final Color? activeColor;
  final Color? inactiveColor;
  final bool showLabel;

  /// Optional tight padding/constraints so the button can sit inside a compact
  /// chip (e.g. the product-card heart) without the IconButton's default 48dp
  /// touch target bloating its container.
  final EdgeInsetsGeometry? padding;
  final BoxConstraints? constraints;

  const WishlistButton({
    super.key,
    required this.productId,
    this.size = 24,
    this.activeColor,
    this.inactiveColor,
    this.showLabel = false,
    this.padding,
    this.constraints,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Guests don't watch the wishlist provider (auth-only endpoints) → the heart
    // shows empty and never fires /v1/wishlist; tapping it gates to login.
    final authed = ref.watch(
      authProvider.select((s) => s.status == AuthStatus.authenticated),
    );
    final isWishlisted =
        authed && ref.watch(wishlistProvider).wishlistedIds.contains(productId);

    final icon = Icon(
      isWishlisted ? Icons.favorite : Icons.favorite_border,
      size: size,
      color: isWishlisted
          ? (activeColor ?? TekaColors.tekaRed)
          : (inactiveColor ?? TekaColors.mutedForeground),
    );
    final tooltip =
        isWishlisted ? "Retirer des favoris" : "Ajouter aux favoris";

    Future<void> toggle() async {
      // Favorites require an account — gate guests to login, then return.
      if (!await ensureAuthenticated(context, ref)) return;
      if (!context.mounted) return;
      try {
        await ref.read(wishlistProvider.notifier).toggleWishlist(productId);
        if (context.mounted) {
          ScaffoldMessenger.of(context).clearSnackBars();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                isWishlisted ? "Retiré des favoris" : "Ajouté aux favoris",
              ),
              backgroundColor: TekaColors.success,
              duration: const Duration(seconds: 2),
            ),
          );
        }
      } catch (e) {
        if (context.mounted) {
          // Surface the real reason when the API rejects the add — e.g. the
          // product is no longer ACTIVE / was deleted (404). The optimistic
          // toggle is already rolled back in the notifier, so the heart
          // reverts on its own.
          final message = e is DioException
              ? extractDioErrorMessage(e)
              : "Une erreur est survenue. Veuillez réessayer.";
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(message),
              backgroundColor: TekaColors.destructive,
              duration: const Duration(seconds: 2),
            ),
          );
        }
      }
    }

    if (showLabel) {
      return Semantics(
        selected: isWishlisted,
        label: tooltip,
        button: true,
        excludeSemantics: true,
        onTap: toggle,
        child: TextButton.icon(
          onPressed: toggle,
          icon: icon,
          label: const Text(
            'Favoris',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          style: TextButton.styleFrom(
            minimumSize: const Size(0, 40),
            foregroundColor:
                isWishlisted ? TekaColors.tekaRed : TekaColors.mutedForeground,
            backgroundColor:
                isWishlisted ? TekaColors.tekaRedSubtle : Colors.transparent,
            padding: const EdgeInsets.symmetric(
              horizontal: 10,
              vertical: 8,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
            textStyle: Theme.of(context).textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
        ),
      );
    }

    return IconButton(
      padding: padding,
      constraints: constraints,
      visualDensity: constraints != null ? VisualDensity.compact : null,
      icon: icon,
      tooltip: tooltip,
      onPressed: toggle,
    );
  }
}
