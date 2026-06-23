import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/auth/auth_guard.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../cart/presentation/providers/cart_provider.dart';
import '../../../wishlist/presentation/widgets/wishlist_button.dart';
import '../../data/models/product_model.dart';

class ProductCard extends ConsumerWidget {
  final BrowseProductModel product;

  const ProductCard({super.key, required this.product});

  // Quick-add (Phase D): add a single unit straight from the card. The
  // IconButton wins the tap within its bounds (like the wishlist heart), so it
  // adds to cart instead of navigating to the PDP. cartProvider.addItem already
  // fires the add_to_cart analytics event.
  Future<void> _quickAdd(
    BuildContext context,
    WidgetRef ref,
  ) async {
    // The cart requires an account — gate guests to login, then return.
    if (!ensureAuthenticated(context, ref)) return;
    try {
      await ref.read(cartProvider.notifier).addItem(product.id);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Ajouté au panier"),
          backgroundColor: TekaColors.success,
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Une erreur est survenue. Veuillez reessayer."),
          backgroundColor: TekaColors.destructive,
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = product.title;
    final hasDiscount = product.hasDiscount;
    final price = formatCDF(product.effectivePriceCDF);
    final imageUrl = product.image?.thumbnailUrl ?? product.image?.url;

    return GestureDetector(
      onTap: () => context.push('/products/${product.id}'),
      child: Card(
        // Card theme provides border + 12dp radius globally.
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image with overlaid badges
            AspectRatio(
              aspectRatio: 1,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (imageUrl != null && imageUrl.isNotEmpty)
                    CachedNetworkImage(
                      imageUrl: imageUrl,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Container(
                        color: TekaColors.surfaceMuted,
                        child: const Center(
                          child: SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      ),
                      errorWidget: (context, url, error) => Container(
                        color: TekaColors.surfaceMuted,
                        child: const Icon(
                          Icons.image_not_supported_outlined,
                          color: TekaColors.mutedForeground,
                          size: 32,
                        ),
                      ),
                    )
                  else
                    Container(
                      color: TekaColors.surfaceMuted,
                      child: const Icon(
                        Icons.image_outlined,
                        color: TekaColors.mutedForeground,
                        size: 32,
                      ),
                    ),
                  // Top-left: out-of-stock, else the discount badge. The
                  // condition badge + seller name were removed from cards to
                  // cut clutter — they stay on the PDP.
                  if (product.isOutOfStock)
                    Positioned(
                      top: 8,
                      left: 8,
                      child: _Pill(
                        label: "Rupture de stock",
                        background: TekaColors.foreground,
                        foreground: Colors.white,
                      ),
                    )
                  else if (hasDiscount)
                    Positioned(
                      top: 8,
                      left: 8,
                      child: _Pill(
                        label: "-${product.discountPct}%",
                        background: TekaColors.tekaRed,
                        foreground: Colors.white,
                      ),
                    ),
                  // Low stock warning bottom-left (bottom-right is the quick-add)
                  if (!product.isOutOfStock && product.isLowStock)
                    Positioned(
                      bottom: 8,
                      left: 8,
                      child: _Pill(
                        label: "Plus que ${product.quantity} en stock",
                        background: TekaColors.warning,
                        foreground: Colors.white,
                      ),
                    ),
                  // Quick-add to cart, bottom-right. Hidden when out of stock.
                  if (!product.isOutOfStock)
                    Positioned(
                      bottom: 4,
                      right: 4,
                      child: DecoratedBox(
                        decoration: const BoxDecoration(
                          color: TekaColors.tekaRed,
                          shape: BoxShape.circle,
                        ),
                        child: IconButton(
                          onPressed: () => _quickAdd(context, ref),
                          icon: const Icon(
                            Icons.add_shopping_cart_outlined,
                            color: Colors.white,
                            size: 18,
                          ),
                          constraints: const BoxConstraints.tightFor(
                            width: 34,
                            height: 34,
                          ),
                          padding: EdgeInsets.zero,
                          tooltip: "Ajouter au panier",
                        ),
                      ),
                    ),
                  // Wishlist heart top-right. The IconButton wins the tap
                  // gesture within its bounds, so tapping it toggles the
                  // wishlist instead of navigating to the PDP.
                  Positioned(
                    top: 4,
                    right: 4,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.88),
                        shape: BoxShape.circle,
                      ),
                      child: WishlistButton(
                        productId: product.id,
                        size: 20,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Product info
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.35,
                      color: TekaColors.foreground,
                    ),
                  ),
                  const SizedBox(height: 6),
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
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: TekaColors.tekaRed,
                            letterSpacing: -0.2,
                          ),
                        ),
                      ),
                      if (hasDiscount) ...[
                        const SizedBox(width: 6),
                        Text(
                          formatCDF(product.priceCDF),
                          style: const TextStyle(
                            fontSize: 11,
                            color: TekaColors.mutedForeground,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (product.unitsSold > 0) ...[
                    const SizedBox(height: 2),
                    Text(
                      "${product.unitsSold} ${(product.unitsSold) == 1 ? 'vendu' : 'vendus'}",
                      style: const TextStyle(
                        fontSize: 11,
                        color: TekaColors.mutedForeground,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color background;
  final Color foreground;

  const _Pill({
    required this.label,
    required this.background,
    required this.foreground,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}
