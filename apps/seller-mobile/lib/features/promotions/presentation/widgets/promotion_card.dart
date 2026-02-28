import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/promotion_model.dart';
import 'promotion_status_badge.dart';

class PromotionCard extends StatelessWidget {
  final PromotionModel promotion;
  final VoidCallback? onCancel;

  const PromotionCard({
    super.key,
    required this.promotion,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = l10n.localeName;
    final dateFormat = DateFormat('dd/MM/yyyy', 'fr');
    final priceFormat = NumberFormat('#,###', 'fr');

    final productTitle = promotion.product?.getLocalizedTitle(locale) ??
        promotion.getLocalizedTitle(locale);
    final isFlashDeal = promotion.type == 'FLASH_DEAL';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: TekaColors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: TekaColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: type badge + status + cancel
            Row(
              children: [
                // Type badge
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: isFlashDeal
                        ? Colors.orange.withValues(alpha: 0.1)
                        : TekaColors.tekaRed.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isFlashDeal ? Icons.flash_on : Icons.local_offer,
                        size: 14,
                        color:
                            isFlashDeal ? Colors.orange : TekaColors.tekaRed,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        isFlashDeal
                            ? l10n.promotionFlashDeal
                            : l10n.promotionPromotion,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: isFlashDeal
                              ? Colors.orange
                              : TekaColors.tekaRed,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                PromotionStatusBadge(
                  status: promotion.status,
                  compact: true,
                ),
                const Spacer(),
                if (promotion.canCancel && onCancel != null)
                  IconButton(
                    icon: const Icon(Icons.cancel_outlined, size: 20),
                    color: TekaColors.destructive,
                    tooltip: l10n.promotionCancel,
                    onPressed: onCancel,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 32,
                      minHeight: 32,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),

            // Product title
            Text(
              productTitle,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 15,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),

            // Discount info
            Row(
              children: [
                Icon(
                  Icons.discount_outlined,
                  size: 16,
                  color: TekaColors.success,
                ),
                const SizedBox(width: 6),
                if (promotion.discountPercent != null)
                  Text(
                    '-${promotion.discountPercent}%',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: TekaColors.success,
                    ),
                  )
                else if (promotion.discountCDFDisplay != null)
                  Text(
                    '-${priceFormat.format(promotion.discountCDFDisplay)} CDF',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: TekaColors.success,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),

            // Date range
            Row(
              children: [
                Icon(
                  Icons.calendar_today_outlined,
                  size: 14,
                  color: TekaColors.mutedForeground,
                ),
                const SizedBox(width: 6),
                Text(
                  '${dateFormat.format(promotion.startsAtDate)} - ${dateFormat.format(promotion.endsAtDate)}',
                  style: TextStyle(
                    fontSize: 12,
                    color: TekaColors.mutedForeground,
                  ),
                ),
              ],
            ),

            // Rejection reason
            if (promotion.status == 'REJECTED' &&
                promotion.rejectionReason != null &&
                promotion.rejectionReason!.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: TekaColors.destructive.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: TekaColors.destructive.withValues(alpha: 0.2),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.promotionRejectionReason,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: TekaColors.destructive,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      promotion.rejectionReason!,
                      style: const TextStyle(
                        fontSize: 13,
                        color: TekaColors.foreground,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
