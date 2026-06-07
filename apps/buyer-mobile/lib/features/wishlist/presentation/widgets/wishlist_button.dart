import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/wishlist_provider.dart';

class WishlistButton extends ConsumerWidget {
  final String productId;
  final double size;
  final Color? activeColor;
  final Color? inactiveColor;

  const WishlistButton({
    super.key,
    required this.productId,
    this.size = 24,
    this.activeColor,
    this.inactiveColor,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final wishlistState = ref.watch(wishlistProvider);
    final isWishlisted = wishlistState.wishlistedIds.contains(productId);

    return IconButton(
      icon: Icon(
        isWishlisted ? Icons.favorite : Icons.favorite_border,
        size: size,
        color: isWishlisted
            ? (activeColor ?? TekaColors.tekaRed)
            : (inactiveColor ?? TekaColors.mutedForeground),
      ),
      tooltip: isWishlisted
          ? l10n.removeFromWishlist
          : l10n.addedToWishlist,
      onPressed: () async {
        try {
          await ref.read(wishlistProvider.notifier).toggleWishlist(productId);
          if (context.mounted) {
            ScaffoldMessenger.of(context).clearSnackBars();
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  isWishlisted
                      ? l10n.removedFromWishlist
                      : l10n.addedToWishlist,
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
                : l10n.authGenericError;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(message),
                backgroundColor: TekaColors.destructive,
                duration: const Duration(seconds: 2),
              ),
            );
          }
        }
      },
    );
  }
}
