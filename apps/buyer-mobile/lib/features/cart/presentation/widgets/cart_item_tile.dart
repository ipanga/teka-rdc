import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../data/models/cart_model.dart';

class CartItemTile extends StatelessWidget {
  final CartItemModel item;
  final String locale;
  final ValueChanged<int> onQuantityChanged;
  final VoidCallback onRemove;

  const CartItemTile({
    super.key,
    required this.item,
    required this.locale,
    required this.onQuantityChanged,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final title = item.product.localizedTitle(locale);
    final unitPrice = formatCDF(item.product.priceCDF);
    final subtotal = formatCDF(item.subtotalCDF);
    final imageUrl = item.product.thumbnailUrl;
    final maxStock = item.product.quantity;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: TekaColors.border, width: 0.5),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Product thumbnail
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 80,
              height: 80,
              child: imageUrl != null && imageUrl.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: imageUrl,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Container(
                        color: TekaColors.muted,
                        child: const Center(
                          child: SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      ),
                      errorWidget: (context, url, error) => Container(
                        color: TekaColors.muted,
                        child: const Icon(
                          Icons.image_not_supported_outlined,
                          color: TekaColors.mutedForeground,
                          size: 24,
                        ),
                      ),
                    )
                  : Container(
                      color: TekaColors.muted,
                      child: const Icon(
                        Icons.image_outlined,
                        color: TekaColors.mutedForeground,
                        size: 24,
                      ),
                    ),
            ),
          ),

          const SizedBox(width: 12),

          // Product info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: TekaColors.foreground,
                    fontSize: 14,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 4),

                // Unit price
                Text(
                  unitPrice,
                  style: const TextStyle(
                    color: TekaColors.tekaRed,
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                // Seller name
                if (item.product.sellerName != null &&
                    item.product.sellerName!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      item.product.sellerName!,
                      style: const TextStyle(
                        color: TekaColors.mutedForeground,
                        fontSize: 12,
                      ),
                    ),
                  ),

                const SizedBox(height: 8),

                // Quantity controls + subtotal + remove
                Row(
                  children: [
                    // Quantity selector
                    Container(
                      decoration: BoxDecoration(
                        border: Border.all(color: TekaColors.border),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _QuantityButton(
                            icon: Icons.remove,
                            onPressed: item.quantity > 1
                                ? () =>
                                    onQuantityChanged(item.quantity - 1)
                                : null,
                          ),
                          Container(
                            constraints: const BoxConstraints(minWidth: 36),
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            alignment: Alignment.center,
                            child: Text(
                              '${item.quantity}',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: TekaColors.foreground,
                              ),
                            ),
                          ),
                          _QuantityButton(
                            icon: Icons.add,
                            onPressed:
                                maxStock > 0 && item.quantity < maxStock
                                    ? () =>
                                        onQuantityChanged(item.quantity + 1)
                                    : null,
                          ),
                        ],
                      ),
                    ),

                    const Spacer(),

                    // Subtotal
                    Text(
                      subtotal,
                      style: const TextStyle(
                        color: TekaColors.foreground,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),

                    const SizedBox(width: 8),

                    // Remove button
                    IconButton(
                      onPressed: onRemove,
                      icon: const Icon(
                        Icons.delete_outline,
                        color: TekaColors.destructive,
                        size: 20,
                      ),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 32,
                        minHeight: 32,
                      ),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuantityButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;

  const _QuantityButton({required this.icon, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(
          icon,
          size: 16,
          color: onPressed != null
              ? TekaColors.foreground
              : TekaColors.border,
        ),
      ),
    );
  }
}
