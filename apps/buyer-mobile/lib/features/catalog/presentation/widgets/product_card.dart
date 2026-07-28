import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/stock.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../wishlist/presentation/widgets/wishlist_button.dart';
import '../../data/models/product_model.dart';

/// Visual density only. Navigation, wishlist, image, price, discount, stock,
/// and rating behavior remain shared by [ProductCard].
enum ProductCardVariant {
  /// Image-first card for Home shelves, recent items, and recommendations.
  discovery,

  /// Comparison card for Search, Category, Favorites, and full catalog grids.
  catalog,
}

double _productCardTextScale(BuildContext context) {
  final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
  return scale.clamp(1.0, 2.0);
}

double _productCardInfoExtent(
  BuildContext context,
  ProductCardVariant variant,
) {
  final scale = _productCardTextScale(context);
  final base = variant == ProductCardVariant.discovery ? 120.0 : 144.0;
  final largeTextAllowance =
      variant == ProductCardVariant.discovery ? 72.0 : 96.0;
  return base + ((scale - 1) * largeTextAllowance);
}

/// Main-axis extent for a two-column product grid. Unlike a fixed aspect
/// ratio, this preserves a square image while reserving enough independent
/// footer space for French text and accessibility scaling.
double productCardGridExtent(
  BuildContext context, {
  required ProductCardVariant variant,
  double horizontalPadding = 32,
  double crossAxisSpacing = 12,
}) {
  final cellWidth = (MediaQuery.sizeOf(context).width -
          horizontalPadding -
          crossAxisSpacing) /
      2;
  return cellWidth + _productCardInfoExtent(context, variant);
}

/// Height for a horizontal product shelf with a known square image width.
double productCardRowExtent(
  BuildContext context, {
  required ProductCardVariant variant,
  required double itemWidth,
}) {
  return itemWidth + _productCardInfoExtent(context, variant);
}

class ProductCard extends ConsumerWidget {
  final BrowseProductModel product;
  final ProductCardVariant variant;

  const ProductCard({
    super.key,
    required this.product,
    this.variant = ProductCardVariant.catalog,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = product.title;
    final hasDiscount = product.hasDiscount;
    final price = formatCDF(product.effectivePriceCDF);
    final imageUrl = product.image?.thumbnailUrl ?? product.image?.url;
    final brandName = product.brandName?.trim();
    final isOfficial = product.seller.businessName == 'Teka RDC Officiel';
    final showCatalogMetadata = variant == ProductCardVariant.catalog;
    final rating = product.avgRating.toStringAsFixed(1).replaceAll('.', ',');

    return LayoutBuilder(
      builder: (context, constraints) {
        return Card(
          clipBehavior: Clip.antiAlias,
          // Card theme provides border + 12dp radius globally.
          child: InkWell(
            onTap: () => context.push('/products/${product.id}'),
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
                      // Discount stays top-left. Stock state sits bottom-left,
                      // away from the favorite target, so narrow cards never
                      // stack text under the heart.
                      if (hasDiscount)
                        Positioned(
                          top: 8,
                          left: 8,
                          child: _Pill(
                            label: "-${product.discountPct}%",
                            background: TekaColors.tekaRed,
                            foreground: Colors.white,
                            maxWidth: constraints.maxWidth - 16,
                          ),
                        ),
                      if (product.isOutOfStock)
                        Positioned(
                          bottom: 8,
                          left: 8,
                          child: _Pill(
                            label: "Rupture de stock",
                            background: TekaColors.foreground,
                            foreground: Colors.white,
                            maxWidth: constraints.maxWidth - 16,
                          ),
                        ),
                      // Low stock warning, bottom-left.
                      if (!product.isOutOfStock && product.isLowStock)
                        Positioned(
                          bottom: 8,
                          left: 8,
                          child: _Pill(
                            // Never the exact remaining quantity — that is
                            // internal inventory. See core/constants/stock.dart.
                            label: "🔥 ${stockStatusLabel(StockStatus.lowStock)}",
                            background: TekaColors.warning,
                            foreground: Colors.white,
                            maxWidth: constraints.maxWidth - 16,
                          ),
                        ),
                      // The 44dp surface is both the visual chip and the actual
                      // touch target. The IconButton wins the gesture inside it,
                      // so toggling never also opens the product.
                      Positioned(
                        top: 4,
                        right: 4,
                        child: Container(
                          width: 44,
                          height: 44,
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
                            size: 19,
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints.tightFor(
                              width: 44,
                              height: 44,
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
                        if (showCatalogMetadata &&
                            ((brandName != null && brandName.isNotEmpty) ||
                                isOfficial)) ...[
                          Row(
                            children: [
                              if (brandName != null && brandName.isNotEmpty)
                                Expanded(
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
                                Expanded(
                                  child: Row(
                                    children: [
                                      const Icon(
                                        Icons.verified,
                                        size: 11,
                                        color: TekaColors.tekaRed,
                                      ),
                                      const SizedBox(width: 2),
                                      const Expanded(
                                        child: Text(
                                          "Officiel",
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            fontSize: 9,
                                            fontWeight: FontWeight.w700,
                                            color: TekaColors.tekaRed,
                                          ),
                                        ),
                                      ),
                                    ],
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
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: hasDiscount
                                  ? TekaColors.tekaRed
                                  : TekaColors.foreground,
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
                        ],
                        // Compact social proof stays last in the logical
                        // reading order and has its own flexible row.
                        if (product.totalReviews > 0) ...[
                          const SizedBox(height: 3),
                          Semantics(
                            label:
                                "Note $rating sur 5, ${product.totalReviews} avis",
                            child: ExcludeSemantics(
                              child: Row(
                                children: [
                                  const Icon(
                                    Icons.star_rounded,
                                    size: 13,
                                    color: Color(0xFFF59E0B),
                                  ),
                                  const SizedBox(width: 2),
                                  Text(
                                    rating,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: TekaColors.foreground,
                                    ),
                                  ),
                                  const SizedBox(width: 3),
                                  Flexible(
                                    child: Text(
                                      "(${product.totalReviews} avis)",
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: TekaColors.mutedForeground,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
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
  final double maxWidth;

  const _Pill({
    required this.label,
    required this.background,
    required this.foreground,
    required this.maxWidth,
  });

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: foreground,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.2,
          ),
        ),
      ),
    );
  }
}
