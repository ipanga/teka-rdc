import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/product_model.dart';

class ProductCard extends StatelessWidget {
  final BrowseProductModel product;

  const ProductCard({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final title = product.localizedTitle(locale);
    final price = formatCDF(product.priceCDF);
    final imageUrl = product.image?.thumbnailUrl ?? product.image?.url;

    return GestureDetector(
      onTap: () => context.push('/products/${product.id}'),
      child: Card(
        clipBehavior: Clip.antiAlias,
        elevation: 1,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: TekaColors.border, width: 0.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
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
                        color: TekaColors.muted,
                        child: const Center(
                          child: SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      ),
                      errorWidget: (context, url, error) => Container(
                        color: TekaColors.muted,
                        child: const Icon(
                          Icons.image_not_supported_outlined,
                          color: TekaColors.mutedForeground,
                          size: 32,
                        ),
                      ),
                    )
                  else
                    Container(
                      color: TekaColors.muted,
                      child: const Icon(
                        Icons.image_outlined,
                        color: TekaColors.mutedForeground,
                        size: 32,
                      ),
                    ),
                  // Condition badge
                  Positioned(
                    top: 6,
                    left: 6,
                    child: _ConditionBadge(
                      condition: product.condition,
                      l10n: l10n,
                    ),
                  ),
                  // Low stock / out of stock badge
                  if (product.isOutOfStock)
                    Positioned(
                      bottom: 0,
                      left: 0,
                      right: 0,
                      child: Container(
                        color: Colors.black54,
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Text(
                          l10n.productOutOfStock,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    )
                  else if (product.isLowStock)
                    Positioned(
                      bottom: 6,
                      right: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: TekaColors.warning,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          l10n.productLowStock,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            // Product info
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Title
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: TekaColors.foreground,
                          height: 1.3,
                        ),
                  ),
                  const SizedBox(height: 4),
                  // Price
                  Text(
                    price,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          color: TekaColors.tekaRed,
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 2),
                  // Seller
                  if (product.seller.businessName != null &&
                      product.seller.businessName!.isNotEmpty)
                    Text(
                      product.seller.businessName!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: TekaColors.mutedForeground,
                          ),
                    ),
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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: isNew ? TekaColors.success : TekaColors.warning,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        isNew ? l10n.productConditionNew : l10n.productConditionUsed,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
