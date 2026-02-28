import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/wishlist_model.dart';
import '../../../reviews/presentation/widgets/star_rating.dart';
import '../providers/wishlist_provider.dart';

class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final wishlistState = ref.watch(wishlistProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.wishlistTitle),
      ),
      body: wishlistState.isLoading
          ? const Center(
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : wishlistState.error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.error_outline,
                          size: 48,
                          color: TekaColors.mutedForeground,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          wishlistState.error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: TekaColors.mutedForeground,
                          ),
                        ),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () =>
                              ref.read(wishlistProvider.notifier).refresh(),
                          style: FilledButton.styleFrom(
                            backgroundColor: TekaColors.tekaRed,
                          ),
                          child: Text(l10n.backToHome),
                        ),
                      ],
                    ),
                  ),
                )
              : wishlistState.items.isEmpty
                  ? _EmptyWishlistView(l10n: l10n)
                  : RefreshIndicator(
                      color: TekaColors.tekaRed,
                      onRefresh: () =>
                          ref.read(wishlistProvider.notifier).refresh(),
                      child: GridView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(16),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          childAspectRatio: 0.62,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: wishlistState.items.length,
                        itemBuilder: (context, index) {
                          final item = wishlistState.items[index];
                          return _WishlistProductCard(
                            item: item,
                            locale: locale,
                            l10n: l10n,
                            onRemove: () => _removeItem(
                                context, ref, item.productId, l10n),
                            onTap: () =>
                                context.push('/products/${item.productId}'),
                          );
                        },
                      ),
                    ),
    );
  }

  void _removeItem(
    BuildContext context,
    WidgetRef ref,
    String productId,
    AppLocalizations l10n,
  ) async {
    try {
      await ref.read(wishlistProvider.notifier).removeFromWishlist(productId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.removedFromWishlist),
            backgroundColor: TekaColors.success,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.authGenericError),
            backgroundColor: TekaColors.destructive,
          ),
        );
      }
    }
  }
}

class _EmptyWishlistView extends StatelessWidget {
  final AppLocalizations l10n;

  const _EmptyWishlistView({required this.l10n});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.favorite_border,
              size: 80,
              color: TekaColors.mutedForeground,
            ),
            const SizedBox(height: 16),
            Text(
              l10n.wishlistEmpty,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: TekaColors.mutedForeground,
                    fontWeight: FontWeight.w600,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              l10n.wishlistEmptyDesc,
              style: const TextStyle(
                color: TekaColors.mutedForeground,
                fontSize: 13,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => context.go('/'),
              style: FilledButton.styleFrom(
                backgroundColor: TekaColors.tekaRed,
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
              child: Text(l10n.browseProducts),
            ),
          ],
        ),
      ),
    );
  }
}

class _WishlistProductCard extends StatelessWidget {
  final WishlistItemModel item;
  final String locale;
  final AppLocalizations l10n;
  final VoidCallback onRemove;
  final VoidCallback onTap;

  const _WishlistProductCard({
    required this.item,
    required this.locale,
    required this.l10n,
    required this.onRemove,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final product = item.product;
    final title =
        product?.localizedTitle(locale) ?? '';
    final price = formatCDF(product?.priceCDF ?? '0');
    final imageUrl = product?.image;
    final isOutOfStock = product?.isOutOfStock ?? false;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: TekaColors.background,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: TekaColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 1,
                  child: imageUrl != null && imageUrl.isNotEmpty
                      ? CachedNetworkImage(
                          imageUrl: imageUrl,
                          fit: BoxFit.cover,
                          placeholder: (_, __) => Container(
                            color: TekaColors.muted,
                            child: const Center(
                              child: SizedBox(
                                width: 20,
                                height: 20,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                          ),
                          errorWidget: (_, __, ___) => Container(
                            color: TekaColors.muted,
                            child: const Icon(
                              Icons.image_outlined,
                              size: 32,
                              color: TekaColors.mutedForeground,
                            ),
                          ),
                        )
                      : Container(
                          color: TekaColors.muted,
                          child: const Icon(
                            Icons.image_outlined,
                            size: 32,
                            color: TekaColors.mutedForeground,
                          ),
                        ),
                ),
                // Remove button
                Positioned(
                  top: 4,
                  right: 4,
                  child: GestureDetector(
                    onTap: onRemove,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.9),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.favorite,
                        size: 20,
                        color: TekaColors.tekaRed,
                      ),
                    ),
                  ),
                ),
                // Out of stock overlay
                if (isOutOfStock)
                  Positioned.fill(
                    child: Container(
                      color: Colors.white.withOpacity(0.6),
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: TekaColors.destructive,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            l10n.productOutOfStock,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            // Details
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: TekaColors.foreground,
                      ),
                    ),
                    const Spacer(),
                    if (product?.avgRating != null &&
                        product!.avgRating! > 0) ...[
                      Row(
                        children: [
                          StarRating(
                            rating: product.avgRating!,
                            size: 12,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '(${product.totalReviews ?? 0})',
                            style: const TextStyle(
                              color: TekaColors.mutedForeground,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                    ],
                    Text(
                      price,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: TekaColors.tekaRed,
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
