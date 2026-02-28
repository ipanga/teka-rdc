import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';

class OrderStatusBadge extends StatelessWidget {
  final String status;

  const OrderStatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final label = _statusLabel(l10n, status);
    final color = _statusColor(status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  static String _statusLabel(AppLocalizations l10n, String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return l10n.orderStatusPENDING;
      case 'CONFIRMED':
        return l10n.orderStatusCONFIRMED;
      case 'PROCESSING':
        return l10n.orderStatusPROCESSING;
      case 'SHIPPED':
        return l10n.orderStatusSHIPPED;
      case 'OUT_FOR_DELIVERY':
        return l10n.orderStatusOUT_FOR_DELIVERY;
      case 'DELIVERED':
        return l10n.orderStatusDELIVERED;
      case 'CANCELLED':
        return l10n.orderStatusCANCELLED;
      case 'RETURNED':
        return l10n.orderStatusRETURNED;
      default:
        return status;
    }
  }

  static Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return TekaColors.warning;
      case 'CONFIRMED':
      case 'PROCESSING':
        return const Color(0xFF3B82F6); // blue
      case 'SHIPPED':
      case 'OUT_FOR_DELIVERY':
        return const Color(0xFF8B5CF6); // purple
      case 'DELIVERED':
        return TekaColors.success;
      case 'CANCELLED':
      case 'RETURNED':
        return TekaColors.destructive;
      default:
        return TekaColors.mutedForeground;
    }
  }
}
