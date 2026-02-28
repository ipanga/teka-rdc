import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/earning_model.dart';

class PayoutTile extends StatelessWidget {
  final PayoutModel payout;

  const PayoutTile({super.key, required this.payout});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final priceFormat = NumberFormat('#,###', 'fr');
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm', l10n.localeName);

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
                  '${priceFormat.format(payout.amountCDFDisplay)} CDF',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              _buildStatusBadge(l10n, payout.status),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(Icons.phone_android, size: 13, color: TekaColors.mutedForeground),
              const SizedBox(width: 4),
              Text(
                _formatMethod(payout.payoutMethod),
                style: const TextStyle(
                  fontSize: 12,
                  color: TekaColors.mutedForeground,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                payout.payoutPhone,
                style: const TextStyle(
                  fontSize: 12,
                  color: TekaColors.mutedForeground,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Icon(Icons.calendar_today_outlined,
                  size: 12, color: TekaColors.mutedForeground),
              const SizedBox(width: 4),
              Text(
                dateFormat.format(payout.requestedAtDate),
                style: const TextStyle(
                  fontSize: 11,
                  color: TekaColors.mutedForeground,
                ),
              ),
            ],
          ),
          if (payout.rejectionReason != null &&
              payout.rejectionReason!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: TekaColors.destructive.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                payout.rejectionReason!,
                style: const TextStyle(
                  fontSize: 11,
                  color: TekaColors.destructive,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildStatusBadge(AppLocalizations l10n, String status) {
    Color color;
    String label;

    switch (status.toUpperCase()) {
      case 'REQUESTED':
        color = TekaColors.warning;
        label = l10n.payoutStatusRequested;
        break;
      case 'APPROVED':
        color = const Color(0xFF3B82F6);
        label = l10n.payoutStatusApproved;
        break;
      case 'PROCESSING':
        color = const Color(0xFF8B5CF6);
        label = l10n.payoutStatusProcessing;
        break;
      case 'COMPLETED':
        color = TekaColors.success;
        label = l10n.payoutStatusCompleted;
        break;
      case 'REJECTED':
        color = TekaColors.destructive;
        label = l10n.payoutStatusRejected;
        break;
      default:
        color = TekaColors.mutedForeground;
        label = status;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: color,
        ),
      ),
    );
  }

  String _formatMethod(String method) {
    switch (method.toUpperCase()) {
      case 'MPESA':
        return 'M-Pesa';
      case 'AIRTEL':
        return 'Airtel Money';
      case 'ORANGE':
        return 'Orange Money';
      default:
        return method;
    }
  }
}
