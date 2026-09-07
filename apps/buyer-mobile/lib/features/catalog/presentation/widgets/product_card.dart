import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/stock.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../wishlist/presentation/widgets/wishlist_button.dart';
import '../../data/models/product_model.dart';
import '../../../../core/widgets/teka_network_image.dart';

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

/// Footer height reserved under a product card's square image.
///
/// The grid needs one height per row, so the reservation has to cover the
/// tallest card that variant can produce. It used to be a padded guess — 120
/// for discovery, 144 for catalog — which left a visible void under a short
/// title: measured on a 448 pt phone, a discovery card with a two-line title
/// and no promotion showed ~60 pt of empty space between the title and the
/// price (UX PR B).
///
/// It is now summed from the rows each variant can actually render, so the
/// slack is the difference between a card and the worst card beside it rather
/// than an arbitrary margin:
///
/// | row | discovery | catalog |
/// |---|---|---|
/// | brand / « Officiel » line | — | 11 pt line + 2 gap |
/// | title (2 lines @ 13 / 1.35) | 35.1 | 35.1 |
/// | price (16 pt, w800) | 22 | 22 |
/// | struck-through original | 12 + 1 | 12 + 1 |
///
/// (The rating row is gated on review count, not on the variant, so both
/// reserve it.)
/// | rating row | 16 + 3 | 16 + 3 |
/// | vertical padding (10 + 12) | 22 | 22 |
///
/// Everything except the padding scales with the text scaler, so a buyer at
/// 1.5x gets a taller footer instead of a clipped one.
double _productCardInfoExtent(
  BuildContext context,
  ProductCardVariant variant,
) {
  final scale = _productCardTextScale(context);
  const padding = 22.0; // 10 top + 12 bottom, fixed
  const title = 2 * 13.0 * 1.35;
  const price = 22.0;
  const struckThrough = 12.0 + 1.0;
  // Line boxes, not font sizes: a 9 pt label occupies ~11 pt of line and a
  // 13 pt star sits in a ~16 pt row. Measured against the layout test, which
  // overflowed by 3.1 pt when these were taken as the raw font sizes.
  const brandLine = 11.0 + 2.0;
  const ratingRow = 16.0 + 3.0;

  // The rating row is gated on `totalReviews > 0`, not on the variant, so
  // BOTH variants must reserve it. Only the brand / « Officiel » line is
  // catalog-only.
  final rows = variant == ProductCardVariant.discovery
      ? title + price + struckThrough + ratingRow
      : brandLine + title + price + struckThrough + ratingRow;

  // A hair of slack absorbs font-metric differences between platforms; without
  // it a 1 pt rounding difference becomes a RenderFlex overflow.
  return padding + (rows * scale) + 4;
}

/// Main-axis extent for a product grid cell. Unlike a fixed aspect ratio,
/// this preserves a square image while reserving enough independent footer
/// space for French text and accessibility scaling.
///
/// Takes the CELL width (tablet phase, 2026-09-07). It used to divide the
/// window width by two, which was wrong the moment a grid had a different
/// column count or sat inside a constrained column — on a tablet every card
/// was sized for a two-column phone.
double productCardGridExtent(
  BuildContext context, {
  required ProductCardVariant variant,
  required double cellWidth,
}) {
  return cellWidth + _productCardInfoExtent(context, variant);
}

/// Columns + cell width + row height for a product grid in [availableWidth].
/// One call per grid so the six grids in the app cannot drift apart.
ProductGridMetrics productGridMetrics(
  BuildContext context, {
  required double availableWidth,
  required ProductCardVariant variant,
  double spacing = 12,
}) {
  final columns = gridColumnsFor(availableWidth, spacing: spacing);
  final cellWidth =
      gridCellWidth(availableWidth, columns: columns, spacing: spacing);
  return ProductGridMetrics(
    columns: columns,
    cellWidth: cellWidth,
    spacing: spacing,
    mainAxisExtent:
        productCardGridExtent(context, variant: variant, cellWidth: cellWidth),
  );
}

class ProductGridMetrics {
  final int columns;
  final double cellWidth;
  final double spacing;
  final double mainAxisExtent;

  const ProductGridMetrics({
    required this.columns,
    required this.cellWidth,
    required this.spacing,
    required this.mainAxisExtent,
  });

  SliverGridDelegate get delegate => SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        mainAxisExtent: mainAxisExtent,
        crossAxisSpacing: spacing,
        mainAxisSpacing: spacing,
      );
}

/// A product grid that picks its column count from the width it is actually
/// given (tablet phase, 2026-09-07).
///
/// Every full-width product grid in the app goes through this widget or
/// [ProductSliverGrid], so a phone keeps its two columns while a 600 pt window
/// gets three and a 1024 pt one gets five — without any screen repeating the
/// arithmetic. [padding] is subtracted before the columns are computed, so the
/// cards are measured on the width they really occupy.
class ProductGrid extends StatelessWidget {
  final int itemCount;
  final Widget? Function(BuildContext, int) itemBuilder;
  final ProductCardVariant variant;
  final EdgeInsets padding;
  final bool shrinkWrap;
  final ScrollPhysics? physics;

  const ProductGrid({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    this.variant = ProductCardVariant.catalog,
    this.padding = const EdgeInsets.all(16),
    this.shrinkWrap = false,
    this.physics,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final metrics = productGridMetrics(
          context,
          availableWidth: constraints.maxWidth - padding.horizontal,
          variant: variant,
        );
        return GridView.builder(
          padding: padding,
          shrinkWrap: shrinkWrap,
          physics: physics,
          gridDelegate: metrics.delegate,
          itemCount: itemCount,
          itemBuilder: itemBuilder,
        );
      },
    );
  }
}

/// Sliver twin of [ProductGrid] for the screens whose grid lives inside a
/// `CustomScrollView` (search, category). Uses the sliver's own cross-axis
/// extent, so it is right inside a constrained column too.
class ProductSliverGrid extends StatelessWidget {
  final int itemCount;
  final Widget? Function(BuildContext, int) itemBuilder;
  final ProductCardVariant variant;
  final EdgeInsets padding;

  const ProductSliverGrid({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    this.variant = ProductCardVariant.catalog,
    this.padding = const EdgeInsets.all(16),
  });

  @override
  Widget build(BuildContext context) {
    return SliverLayoutBuilder(
      builder: (context, constraints) {
        final metrics = productGridMetrics(
          context,
          availableWidth: constraints.crossAxisExtent - padding.horizontal,
          variant: variant,
        );
        return SliverPadding(
          padding: padding,
          sliver: SliverGrid(
            delegate: SliverChildBuilderDelegate(
              itemBuilder,
              childCount: itemCount,
            ),
            gridDelegate: metrics.delegate,
          ),
        );
      },
    );
  }
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
    // « Officiel » from the API flag, never the name. Cards carry no
    // « Vérifié » on purpose (PR 5 policy: the PDP seller block is the trust
    // surface; cards stay clean).
    final isOfficial = product.seller.official;
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
                      TekaNetworkImage(
                        url: imageUrl,
                        fallbackIconSize: 32,
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
                            label:
                                "🔥 ${stockStatusLabel(StockStatus.lowStock)}",
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
                          // The chip has to read over both a white studio
                          // shot and a dark photo. A translucent white disc
                          // did the second job only — on a pale image it
                          // vanished and the heart looked like it was
                          // floating on the product. Opaque white carries the
                          // dark case; the hairline ring carries the light
                          // one; the shadow lifts it off busy photography.
                          decoration: BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color:
                                  TekaColors.foreground.withValues(alpha: 0.14),
                              width: 1,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: TekaColors.foreground
                                    .withValues(alpha: 0.16),
                                blurRadius: 6,
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
                              // Unconditional: a discount must not change the
                              // colour of the current price. The promotion is
                              // already signalled three ways below — the
                              // struck-through original, the -X% badge and the
                              // savings line. Matches the PDP, which has always
                              // used foreground for the effective price.
                              color: TekaColors.foreground,
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
                                    color: TekaColors.ratingStar,
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
