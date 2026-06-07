import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../wishlist/presentation/widgets/wishlist_button.dart';
import '../../data/models/product_model.dart';

class ProductCard extends StatelessWidget {
  final BrowseProductModel product;

  const ProductCard({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final title = product.title;
    final price = formatCDF(product.priceCDF);
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
                  // Out-of-stock solid badge top-left
                  if (product.isOutOfStock)
                    Positioned(
                      top: 8,
                      left: 8,
                      child: _Pill(
                        label: l10n.productOutOfStock,
                        background: TekaColors.foreground,
                        foreground: Colors.white,
                      ),
                    )
                  // Otherwise condition pill top-left
                  else
                    Positioned(
                      top: 8,
                      left: 8,
                      child: _ConditionBadge(
                        condition: product.condition,
                        l10n: l10n,
                      ),
                    ),
                  // Low stock warning bottom-right
                  if (!product.isOutOfStock && product.isLowStock)
                    Positioned(
                      bottom: 8,
                      right: 8,
                      child: _Pill(
                        label: l10n.productLowStock,
                        background: TekaColors.warning,
                        foreground: Colors.white,
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
                  Text(
                    price,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: TekaColors.tekaRed,
                      letterSpacing: -0.2,
                    ),
                  ),
                  if (product.seller.businessName != null &&
                      product.seller.businessName!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      product.seller.businessName!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        color: TekaColors.mutedForeground,
                      ),
                    ),
                  ],
                  if (product.unitsSold > 0) ...[
                    const SizedBox(height: 2),
                    Text(
                      l10n.productUnitsSold(product.unitsSold),
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

class _ConditionBadge extends StatelessWidget {
  final String condition;
  final AppLocalizations l10n;

  const _ConditionBadge({required this.condition, required this.l10n});

  @override
  Widget build(BuildContext context) {
    final isNew =
        condition.toUpperCase() == 'NEW' || condition.toUpperCase() == 'NEUF';
    return _Pill(
      label: isNew ? l10n.productConditionNew : l10n.productConditionUsed,
      background: isNew ? TekaColors.successSubtle : TekaColors.warningSubtle,
      foreground: isNew ? TekaColors.success : TekaColors.warning,
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
