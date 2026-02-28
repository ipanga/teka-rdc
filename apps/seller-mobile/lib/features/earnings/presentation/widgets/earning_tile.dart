import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/earning_model.dart';

class EarningTile extends StatelessWidget {
  final SellerEarningModel earning;

  const EarningTile({super.key, required this.earning});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final priceFormat = NumberFormat('#,###', 'fr');
    final dateFormat = DateFormat('dd/MM/yyyy', l10n.localeName);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TekaColors.background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: TekaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  earning.orderNumber != null
                      ? l10n.orderNumber(earning.orderNumber!)
                      : earning.orderId,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: earning.isPaid
                      ? TekaColors.success.withValues(alpha: 0.1)
                      : TekaColors.warning.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  earning.isPaid
                      ? l10n.earningsPaid
                      : l10n.earningsAvailable,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: earning.isPaid
                        ? TekaColors.success
                        : TekaColors.warning,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(Icons.calendar_today_outlined,
                  size: 12, color: TekaColors.mutedForeground),
              const SizedBox(width: 4),
              Text(
                dateFormat.format(earning.createdAtDate),
                style: const TextStyle(
                  fontSize: 11,
                  color: TekaColors.mutedForeground,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                'Commission: ${earning.commissionRateDisplay.toStringAsFixed(0)}%',
                style: const TextStyle(
                  fontSize: 11,
                  color: TekaColors.mutedForeground,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.orderTotal,
                    style: const TextStyle(
                      fontSize: 11,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  Text(
                    '${priceFormat.format(earning.grossAmountCDFDisplay)} CDF',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(
                    l10n.earningsTotalCommission,
                    style: const TextStyle(
                      fontSize: 11,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  Text(
                    '-${priceFormat.format(earning.commissionCDFDisplay)} CDF',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: TekaColors.destructive,
                    ),
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    l10n.earningsTabEarnings,
                    style: const TextStyle(
                      fontSize: 11,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  Text(
                    '${priceFormat.format(earning.netAmountCDFDisplay)} CDF',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: TekaColors.success,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
