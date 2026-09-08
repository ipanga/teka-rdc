import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/seller_status_badge.dart';
import '../../data/models/earning_model.dart';
import '../payout_status.dart';

/// One payout in the history: amount (strong), status chip, destination
/// (operator + masked number — the full number lives on the detail) and
/// the request date. Tapping opens the owner-scoped detail.
class PayoutTile extends StatelessWidget {
  final PayoutModel payout;

  const PayoutTile({super.key, required this.payout});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final dateFormat = DateFormat('dd/MM/yyyy', 'fr');
    final ui = PayoutStatusUi.of(payout.status);
    final amount = '${formatFcNumber(payout.amountCDFDisplay)} FC';
    final status = payout.status.toUpperCase();
    final reason = payout.rejectionReason?.trim() ?? '';
    final reference = payout.externalReference?.trim() ?? '';

    return Semantics(
      button: true,
      label:
          'Virement de $amount, ${ui.label}, demandé le ${dateFormat.format(payout.requestedAtDate)}',
      child: ExcludeSemantics(
        child: Card(
          color: TekaColors.background,
          margin: const EdgeInsets.only(bottom: TekaSpacing.xs),
          elevation: 0,
          shape: const RoundedRectangleBorder(
            borderRadius: TekaRadius.lgAll,
            side: BorderSide(color: TekaColors.border),
          ),
          child: InkWell(
            onTap: () => context.push('/earnings/payouts/${payout.id}'),
            borderRadius: TekaRadius.lgAll,
            child: Padding(
              padding: const EdgeInsets.all(TekaSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(amount,
                            style: theme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: TekaColors.foreground)),
                      ),
                      const SizedBox(width: TekaSpacing.xs),
                      const Icon(Icons.chevron_right,
                          size: 20, color: TekaColors.mutedForeground),
                    ],
                  ),
                  const SizedBox(height: TekaSpacing.xs),
                  SellerStatusBadge(
                      label: ui.label,
                      icon: ui.icon,
                      color: ui.color,
                      compact: true),
                  const SizedBox(height: TekaSpacing.xs),
                  Text(
                    '${payoutMethodLabel(payout.payoutMethod)} · ${maskPhone(payout.payoutPhone)}',
                    style: theme.bodySmall
                        ?.copyWith(color: TekaColors.mutedForeground),
                  ),
                  Text(
                    'Demandé le ${dateFormat.format(payout.requestedAtDate)}',
                    style: theme.bodySmall
                        ?.copyWith(color: TekaColors.mutedForeground),
                  ),
                  if (status == 'REJECTED' && reason.isNotEmpty) ...[
                    const SizedBox(height: TekaSpacing.xs),
                    Text('Raison : $reason',
                        style: theme.bodySmall?.copyWith(
                            color: TekaColors.destructiveForeground)),
                  ],
                  if (status == 'COMPLETED' && reference.isNotEmpty) ...[
                    const SizedBox(height: TekaSpacing.xs),
                    Text('Référence : $reference',
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
