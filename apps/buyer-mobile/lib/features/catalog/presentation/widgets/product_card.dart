import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../wishlist/presentation/widgets/wishlist_button.dart';
import '../../data/models/product_model.dart';

class ProductCard extends ConsumerWidget {
  final BrowseProductModel product;

  const ProductCard({super.key, required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = product.title;
    final hasDiscount = product.hasDiscount;
    final price = formatCDF(product.effectivePriceCDF);
    final imageUrl = product.image?.thumbnailUrl ?? product.image?.url;
    final brandName = product.brandName?.trim();
    final isOfficial = product.seller.businessName == 'Teka RDC Officiel';
    final savings = hasDiscount
        ? formatCDF(
            (BigInt.parse(product.priceCDF) -
                    BigInt.parse(product.effectivePriceCDF))
                .toString(),
          )
        : null;

    return LayoutBuilder(
      builder: (context, constraints) {
        final isCompact = constraints.maxWidth < 180;

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
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
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
                      // Low stock warning, bottom-left.
                      if (!product.isOutOfStock && product.isLowStock)
                        Positioned(
                          bottom: 8,
                          left: 8,
                          child: _Pill(
                            label:
                                "🔥 Plus que ${product.quantity} disponible${product.quantity > 1 ? 's' : ''}",
                            background: TekaColors.warning,
                            foreground: Colors.white,
                          ),
                        ),
                      // Wishlist heart, top-right — a compact, clean circular chip.
                      // The IconButton wins the tap within its bounds, so tapping it
                      // toggles the wishlist instead of navigating to the PDP.
                      Positioned(
                        top: 6,
                        right: 6,
                        child: Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.92),
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.10),
                                blurRadius: 4,
                                offset: const Offset(0, 1),
                              ),
                            ],
                          ),
                          child: WishlistButton(
                            productId: product.id,
                            size: 17,
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints.tightFor(
                              width: 32,
                              height: 32,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Brand (when present) + Officiel badge — subtle line above title.
                        if (brandName != null && brandName.isNotEmpty ||
                            isOfficial) ...[
                          Row(
                            children: [
                              if (brandName != null && brandName.isNotEmpty)
                                Flexible(
                                  child: Text(
                                    brandName.toUpperCase(),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 0.3,
                                      color: TekaColors.mutedForeground,
                                    ),
                                  ),
                                ),
                              if (isOfficial) ...[
                                if (brandName != null && brandName.isNotEmpty)
                                  const SizedBox(width: 4),
                                const Icon(Icons.verified,
                                    size: 11, color: TekaColors.tekaRed),
                                const SizedBox(width: 2),
                                const Text(
                                  "Officiel",
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w700,
                                    color: TekaColors.tekaRed,
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 2),
                        ],
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
                        const Spacer(),
                        // Effective price on its own full-width line — scales down
                        // (never truncates) so even multi-million CDF values stay
                        // fully readable. The original price is struck through below
                        // when discounted, so neither steals width from the other.
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(
                            price,
                            maxLines: 1,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: TekaColors.tekaRed,
                              letterSpacing: -0.2,
                            ),
                          ),
                        ),
                        if (hasDiscount) ...[
                          const SizedBox(height: 1),
                          Text(
                            formatCDF(product.priceCDF),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: TekaColors.mutedForeground,
                              decoration: TextDecoration.lineThrough,
                            ),
                          ),
                          if (savings != null && !isCompact)
                            Text(
                              "Vous économisez $savings",
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: TekaColors.success,
                              ),
                            ),
                        ],
                        // Rating — social proof. The unit-sold count is
                        // deliberately not public (it stays on the API for
                        // popularity ranking and seller/admin reporting).
                        if (product.totalReviews > 0) ...[
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              const Icon(Icons.star,
                                  size: 12, color: Color(0xFFF59E0B)),
                              const SizedBox(width: 2),
                              Text(
                                product.avgRating.toStringAsFixed(1),
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: TekaColors.foreground,
                                ),
                              ),
                              const SizedBox(width: 2),
                              Text(
                                "(${product.totalReviews})",
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: TekaColors.mutedForeground,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
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
