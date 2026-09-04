import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/earning_model.dart';

class EarningTile extends StatelessWidget {
  final SellerEarningModel earning;

  const EarningTile({super.key, required this.earning});

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd/MM/yyyy', 'fr');

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
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                earning.orderNumber != null
                    ? "Commande ${earning.orderNumber!}"
                    : earning.orderId,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: earning.isPaid
                      ? TekaColors.success.withValues(alpha: 0.1)
                      : TekaColors.warning.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  earning.isPaid ? "Payé" : "Disponible",
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
          Wrap(
            spacing: 12,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
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
          Wrap(
            spacing: 20,
            runSpacing: 10,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "Total",
                    style: TextStyle(
                      fontSize: 11,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  Text(
                    '${formatFcNumber(earning.grossAmountCDFDisplay)} FC',
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
                  const Text(
                    "Commission prélevée",
                    style: TextStyle(
                      fontSize: 11,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  Text(
                    '-${formatFcNumber(earning.commissionCDFDisplay)} FC',
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
                  const Text(
                    "Gains",
                    style: TextStyle(
                      fontSize: 11,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  Text(
                    '${formatFcNumber(earning.netAmountCDFDisplay)} FC',
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
