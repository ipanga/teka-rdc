import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../data/models/cart_model.dart';
import '../../../../core/widgets/teka_network_image.dart';

class CartItemTile extends StatelessWidget {
  final CartItemModel item;
  final ValueChanged<int> onQuantityChanged;
  final VoidCallback onRemove;

  /// Opens the product detail page. Wired on the image + title/price area only;
  /// the quantity stepper and remove button stay independent tap targets.
  final VoidCallback? onOpenProduct;

  const CartItemTile({
    super.key,
    required this.item,
    required this.onQuantityChanged,
    required this.onRemove,
    this.onOpenProduct,
  });

  @override
  Widget build(BuildContext context) {
    final title = item.product.title;
    final unitPrice = formatCDF(item.product.effectiveCDF);
    final subtotal = formatCDF(item.subtotalCDF);
    final imageUrl = item.product.thumbnailUrl;
    final maxStock = item.product.quantity;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: TekaColors.border, width: 0.5),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Product thumbnail — larger (96dp matches web 24-tailwind).
          // Tapping opens the product detail page.
          GestureDetector(
            onTap: onOpenProduct,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: TekaColors.surfaceMuted,
                  border: Border.all(color: TekaColors.border),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: TekaNetworkImage(url: imageUrl, fallbackIconSize: 24),
              ),
            ),
          ),

          const SizedBox(width: 14),

          // Product info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title / seller / price open the product detail page.
                // The stepper + remove row below stays independent.
                GestureDetector(
                  onTap: onOpenProduct,
                  behavior: HitTestBehavior.opaque,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: TekaColors.foreground,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          height: 1.35,
                        ),
                      ),
                      if (item.product.sellerName != null &&
                          item.product.sellerName!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            item.product.sellerName!,
                            style: const TextStyle(
                              color: TekaColors.mutedForeground,
                              fontSize: 12,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      const SizedBox(height: TekaSpacing.xxs + 2),
                      // Labelled, because the tile shows two prices: this one
                      // per unit and the line total on the right. With a
                      // quantity of 1 they are the same number, so without
                      // labels a buyer at quantity 3 cannot tell which is
                      // which (UX PR C). The colour moves off the brand red
                      // too — red means promotion elsewhere in the app, and
                      // the PDP has always shown the effective price in
                      // foreground.
                      Text(
                        "$unitPrice / unité",
                        style: const TextStyle(
                          color: TekaColors.foreground,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),

                // Stepper + subtotal + remove
                Row(
                  children: [
                    // Quantity stepper
                    Container(
                      decoration: BoxDecoration(
                        border: Border.all(color: TekaColors.border),
                        borderRadius: TekaRadius.mdAll,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _QuantityButton(
                            icon: Icons.remove,
                            onPressed: item.quantity > 1
                                ? () => onQuantityChanged(item.quantity - 1)
                                : null,
                          ),
                          Container(
                            constraints: const BoxConstraints(minWidth: 40),
                            padding:
                                const EdgeInsets.symmetric(horizontal: 4),
                            alignment: Alignment.center,
                            child: Text(
                              '${item.quantity}',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: TekaColors.foreground,
                              ),
                            ),
                          ),
                          _QuantityButton(
                            icon: Icons.add,
                            onPressed:
                                maxStock > 0 && item.quantity < maxStock
                                    ? () => onQuantityChanged(item.quantity + 1)
                                    : null,
                          ),
                        ],
                      ),
                    ),

                    const Spacer(),

                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          "Sous-total",
                          style: TextStyle(
                            color: TekaColors.mutedForeground,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          subtotal,
                          style: const TextStyle(
                            color: TekaColors.foreground,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.2,
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(width: 4),

                    IconButton(
                      onPressed: onRemove,
                      icon: const Icon(
                        Icons.delete_outline,
                        color: TekaColors.mutedForeground,
                        size: 20,
                      ),
                      tooltip: 'Supprimer',
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
      borderRadius: BorderRadius.circular(6),
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        child: Icon(
          icon,
          size: 16,
          color:
              onPressed != null ? TekaColors.foreground : TekaColors.borderStrong,
        ),
      ),
    );
  }
}
