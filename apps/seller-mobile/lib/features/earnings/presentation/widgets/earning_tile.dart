import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/seller_status_badge.dart';
import '../../data/models/earning_model.dart';
import '../payout_status.dart';

/// One delivered order's earning: what the seller keeps (net, strong), how
/// it was computed (gross − commission at the snapshotted rate, muted) and
/// where the money is (state chip). Money is always in the foreground
/// colour — the state alone carries the tone.
class EarningTile extends StatelessWidget {
  final SellerEarningModel earning;

  const EarningTile({super.key, required this.earning});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final dateFormat = DateFormat('dd/MM/yyyy', 'fr');
    final state = EarningStateUi.of(earning.effectiveState);
    final title = earning.orderNumber != null
        ? 'Commande ${earning.orderNumber!}'
        : 'Commande';
    final net = '${formatFcNumber(earning.netAmountCDFDisplay)} FC';
    final gross = '${formatFcNumber(earning.grossAmountCDFDisplay)} FC';
    final commission = '${formatFcNumber(earning.commissionCDFDisplay)} FC';
    final rate = earning.commissionRatePercentLabel;

    return Semantics(
      label:
          '$title, ${dateFormat.format(earning.createdAtDate)}, gain net $net, ${state.label}',
      child: ExcludeSemantics(
        child: Container(
          margin: const EdgeInsets.only(bottom: TekaSpacing.xs),
          padding: const EdgeInsets.all(TekaSpacing.sm),
          decoration: BoxDecoration(
            color: TekaColors.background,
            borderRadius: TekaRadius.lgAll,
            border: Border.all(color: TekaColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: TekaSpacing.sm,
                runSpacing: TekaSpacing.xxs,
                children: [
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: theme.titleSmall),
                      const SizedBox(height: 2),
                      Text(dateFormat.format(earning.createdAtDate),
                          style: theme.bodySmall
                              ?.copyWith(color: TekaColors.mutedForeground)),
                    ],
                  ),
                  Text(net,
                      softWrap: false,
                      style: theme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: TekaColors.foreground)),
                ],
              ),
              const SizedBox(height: TekaSpacing.xs),
              Text(
                'Vente $gross − commission $commission ($rate)',
                style:
                    theme.bodySmall?.copyWith(color: TekaColors.mutedForeground),
              ),
              const SizedBox(height: TekaSpacing.xs),
              SellerStatusBadge(
                label: state.label,
                icon: _icon(earning.effectiveState),
                color: state.color,
                compact: true,
              ),
            ],
          ),
        ),
      ),
    );
  }

  static IconData _icon(String state) => switch (state) {
        'HELD' => Icons.schedule,
        'AVAILABLE' => Icons.account_balance_wallet_outlined,
        'RESERVED' => Icons.sync,
        'PAID' => Icons.check_circle_outline,
        'REVERSED' => Icons.undo,
        _ => Icons.help_outline,
      };
}
