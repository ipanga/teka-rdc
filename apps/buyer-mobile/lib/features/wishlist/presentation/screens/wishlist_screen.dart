import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../../core/widgets/product_skeletons.dart';
import '../../data/models/wishlist_model.dart';
import '../../../cart/presentation/providers/cart_provider.dart';
import '../../../reviews/presentation/widgets/star_rating.dart';
import '../providers/wishlist_provider.dart';

class WishlistScreen extends ConsumerStatefulWidget {
  const WishlistScreen({super.key});

  @override
  ConsumerState<WishlistScreen> createState() => _WishlistScreenState();
}

class _WishlistScreenState extends ConsumerState<WishlistScreen> {
  bool _viewedTracked = false;

  @override
  void initState() {
    super.initState();
    // Fire wishlist_viewed once the screen opens. If the list is already
    // loaded (the provider may have loaded earlier), fire immediately;
    // otherwise the ref.listen in build fires it on first load completion.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final s = ref.read(wishlistProvider);
      if (!s.isLoading && s.error == null) _trackViewedOnce(s.items.length);
    });
  }

  void _trackViewedOnce(int itemCount) {
    if (_viewedTracked) return;
    _viewedTracked = true;
    const PosthogAnalytics().capture(
      'wishlist_viewed',
      properties: {'item_count': itemCount},
    );
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final wishlistState = ref.watch(wishlistProvider);

    // Fire wishlist_viewed on the first successful load if it wasn't already
    // loaded when the screen opened.
    ref.listen(wishlistProvider, (_, next) {
      if (!next.isLoading && next.error == null) {
        _trackViewedOnce(next.items.length);
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: Text("Mes favoris"),
      ),
      body: wishlistState.isLoading
          ? const ProductGridSkeleton(count: 6)
          : wishlistState.error != null
              ? AppErrorState(
                  message: wishlistState.error,
                  onRetry: () => ref.read(wishlistProvider.notifier).refresh(),
                )
              : wishlistState.items.isEmpty
                  ? AppEmptyState(
                      icon: Icons.favorite_border,
                      title: "Aucun favori",
                      message:
                          "Ajoutez des produits a vos favoris pour les retrouver facilement",
                      actionLabel: "Decouvrir les produits",
                      onAction: () => context.go('/'),
                    )
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
                          childAspectRatio: 0.55,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: wishlistState.items.length,
                        itemBuilder: (context, index) {
                          final item = wishlistState.items[index];
                          return _WishlistProductCard(
                            item: item,
                            locale: locale,
                            onRemove: () =>
                                _removeItem(context, ref, item.productId),
                            onAddToCart: () =>
                                _addToCart(context, item.productId),
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
  ) async {
    try {
      await ref.read(wishlistProvider.notifier).removeFromWishlist(productId);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Retire des favoris"),
            backgroundColor: TekaColors.success,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Une erreur est survenue. Veuillez réessayer."),
            backgroundColor: TekaColors.destructive,
          ),
        );
      }
    }
  }

  // Add to cart — keeps the item in the wishlist (non-destructive).
  Future<void> _addToCart(
    BuildContext context,
    String productId,
  ) async {
    try {
      await ref.read(cartProvider.notifier).addItem(productId);
      const PosthogAnalytics().capture(
        'wishlist_item_moved_to_cart',
        properties: {'productId': productId},
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Ajouté au panier"),
            backgroundColor: TekaColors.success,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Une erreur est survenue. Veuillez réessayer."),
            backgroundColor: TekaColors.destructive,
          ),
        );
      }
    }
  }
}

class _WishlistProductCard extends StatelessWidget {
  final WishlistItemModel item;
  final String locale;
  final VoidCallback onRemove;
  final VoidCallback onAddToCart;
  final VoidCallback onTap;

  const _WishlistProductCard({
    required this.item,
    required this.locale,
    required this.onRemove,
    required this.onAddToCart,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final product = item.product;
    final title = product?.title ?? '';
    final hasDiscount = product?.hasDiscount ?? false;
    final price = formatCDF(product?.effectivePriceCDF ?? '0');
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
                        color: Colors.white.withValues(alpha: 0.9),
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
                      color: Colors.white.withValues(alpha: 0.6),
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
                            "Rupture de stock",
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
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Flexible(
                          child: Text(
                            price,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                              color: TekaColors.tekaRed,
                            ),
                          ),
                        ),
                        if (hasDiscount) ...[
                          const SizedBox(width: 6),
                          Text(
                            formatCDF(product!.priceCDF),
                            style: const TextStyle(
                              fontSize: 10,
                              color: TekaColors.mutedForeground,
                              decoration: TextDecoration.lineThrough,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Add to cart — keeps the item in the wishlist. The button
                    // wins its own tap, so it doesn't trigger card navigation.
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: isOutOfStock ? null : onAddToCart,
                        style: FilledButton.styleFrom(
                          backgroundColor: TekaColors.tekaRed,
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          minimumSize: const Size(0, 32),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          textStyle: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        child: Text(
                          isOutOfStock
                              ? "Rupture de stock"
                              : "Ajouter au panier",
                        ),
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
