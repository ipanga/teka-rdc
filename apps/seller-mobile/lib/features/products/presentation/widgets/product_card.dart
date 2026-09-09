import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../data/models/product_model.dart';
import '../product_status_ui.dart';
import 'status_badge.dart';

/// One product in the list. In one glance: photo, title, the price a buyer
/// pays today (promotion applied, original struck through), status, whether
/// the seller must act, and stock. Town and date stay secondary.
class ProductCard extends StatelessWidget {
  final SellerProductModel product;

  const ProductCard({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final ui = ProductStatusUi.of(product.status);
    final price = product.priceCDFDisplay;
    final promo = product.discountPriceCDFDisplay;
    final percent = discountPercent(price, promo);
    final effective = percent != null ? promo! : price;
    final stock = product.quantity;
    final semantics = [
      product.title,
      ui.label,
      if (ui.actionLabel != null) ui.actionLabel!,
      '${formatFcNumber(effective)} FC',
      if (percent != null) 'promotion moins $percent pour cent',
      stock == 0 ? 'rupture de stock' : 'stock $stock',
    ].join(', ');

    return Card(
      color: TekaColors.background,
      margin: const EdgeInsets.only(bottom: TekaSpacing.sm),
      elevation: 0,
      shape: const RoundedRectangleBorder(
        borderRadius: TekaRadius.lgAll,
        side: BorderSide(color: TekaColors.border),
      ),
      child: Semantics(
        button: true,
        label: semantics,
        child: ExcludeSemantics(
          child: InkWell(
            onTap: () => context.push('/products/${product.id}'),
            borderRadius: TekaRadius.lgAll,
            child: Padding(
              padding: const EdgeInsets.all(TekaSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ProductThumbnail(url: product.coverImageUrl, size: 64),
                      const SizedBox(width: TekaSpacing.sm),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(product.title,
                                style: theme.titleSmall,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis),
                            const SizedBox(height: TekaSpacing.xxs),
                            PriceLine(price: price, promo: promo),
                          ],
                        ),
                      ),
                      const SizedBox(width: TekaSpacing.xs),
                      const Icon(Icons.chevron_right,
                          size: 20, color: TekaColors.mutedForeground),
                    ],
                  ),
                  const SizedBox(height: TekaSpacing.xs),
                  Wrap(
                    spacing: TekaSpacing.xs,
                    runSpacing: TekaSpacing.xxs,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      StatusBadge(status: product.status, compact: true),
                      if (ui.actionLabel != null)
                        _Pill(
                            label: ui.actionLabel!,
                            background: TekaColors.destructiveSubtle,
                            foreground: TekaColors.destructiveForeground),
                      StockLabel(quantity: stock, compact: true),
                    ],
                  ),
                  if (product.cityName != null) ...[
                    const SizedBox(height: TekaSpacing.xxs),
                    Text(product.cityName!,
                        style: theme.bodySmall
                            ?.copyWith(color: TekaColors.mutedForeground)),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// « 45.000 FC » or, on promotion, « 40.500 FC  ~~45.000 FC~~  −10 % ».
class PriceLine extends StatelessWidget {
  const PriceLine(
      {super.key, required this.price, this.promo, this.large = false});
  final int price;
  final int? promo;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final percent = discountPercent(price, promo);
    final strong = (large ? theme.headlineSmall : theme.titleSmall)
        ?.copyWith(fontWeight: FontWeight.w700);
    if (percent == null) {
      return Text('${formatFcNumber(price)} FC', style: strong);
    }
    return Wrap(
      spacing: TekaSpacing.xs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text('${formatFcNumber(promo!)} FC', style: strong),
        Text('${formatFcNumber(price)} FC',
            style: theme.bodySmall?.copyWith(
                color: TekaColors.mutedForeground,
                decoration: TextDecoration.lineThrough)),
        _Pill(
            label: '−$percent %',
            background: TekaColors.successSubtle,
            foreground: TekaColors.successForeground),
      ],
    );
  }
}

/// Stock in words: « Stock : 8 » or « Rupture de stock » (warning tone).
class StockLabel extends StatelessWidget {
  const StockLabel({super.key, required this.quantity, this.compact = false});
  final int quantity;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    if (quantity <= 0) {
      return _Pill(
          label: 'Rupture de stock',
          background: TekaColors.warningSubtle,
          foreground: TekaColors.warningForeground);
    }
    return Text('Stock : $quantity',
        style: (compact ? theme.bodySmall : theme.bodyMedium)
            ?.copyWith(color: TekaColors.neutralForeground));
  }
}

class _Pill extends StatelessWidget {
  const _Pill(
      {required this.label,
      required this.background,
      required this.foreground});
  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) => Container(
        padding:
            const EdgeInsets.symmetric(horizontal: TekaSpacing.xs, vertical: 2),
        decoration:
            BoxDecoration(color: background, borderRadius: TekaRadius.pillAll),
        child: Text(label,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: foreground, fontWeight: FontWeight.w700)),
      );
}

/// Square thumbnail with a static placeholder (no spinner) while loading
/// and a French fallback icon on failure. Plain `Image.network`: the seller
/// app carries no image-cache dependency (decided in PR C).
class ProductThumbnail extends StatelessWidget {
  const ProductThumbnail({super.key, required this.url, this.size = 56});
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final placeholder = ColoredBox(
      color: TekaColors.muted,
      child: Icon(Icons.image_outlined,
          color: TekaColors.mutedForeground, size: size * 0.45),
    );
    return ClipRRect(
      borderRadius: TekaRadius.mdAll,
      child: SizedBox(
        width: size,
        height: size,
        child: url == null
            ? placeholder
            : Image.network(
                url!,
                fit: BoxFit.cover,
                cacheWidth: (size * 3).round(),
                excludeFromSemantics: true,
                errorBuilder: (_, __, ___) => placeholder,
                loadingBuilder: (_, child, progress) =>
                    progress == null ? child : placeholder,
              ),
      ),
    );
  }
}
