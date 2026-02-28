import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/order_model.dart';

class OrderStatusBadge extends StatelessWidget {
  final OrderStatus status;
  final bool compact;

  const OrderStatusBadge({
    super.key,
    required this.status,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final config = _statusConfig(l10n);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 6 : 10,
        vertical: compact ? 2 : 4,
      ),
      decoration: BoxDecoration(
        color: config.color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: config.color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(config.icon, size: compact ? 12 : 14, color: config.color),
          const SizedBox(width: 4),
          Text(
            config.label,
            style: TextStyle(
              color: config.color,
              fontSize: compact ? 10 : 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  _OrderStatusConfig _statusConfig(AppLocalizations l10n) {
    switch (status) {
      case OrderStatus.pending:
        return _OrderStatusConfig(
          color: TekaColors.warning,
          icon: Icons.hourglass_empty,
          label: l10n.orderStatusPENDING,
        );
      case OrderStatus.confirmed:
        return _OrderStatusConfig(
          color: const Color(0xFF3B82F6),
          icon: Icons.check_circle_outline,
          label: l10n.orderStatusCONFIRMED,
        );
      case OrderStatus.processing:
        return _OrderStatusConfig(
          color: const Color(0xFF6366F1),
          icon: Icons.settings_outlined,
          label: l10n.orderStatusPROCESSING,
        );
      case OrderStatus.shipped:
        return _OrderStatusConfig(
          color: const Color(0xFF0EA5E9),
          icon: Icons.local_shipping_outlined,
          label: l10n.orderStatusSHIPPED,
        );
      case OrderStatus.outForDelivery:
        return _OrderStatusConfig(
          color: const Color(0xFF0891B2),
          icon: Icons.delivery_dining,
          label: l10n.orderStatusOUT_FOR_DELIVERY,
        );
      case OrderStatus.delivered:
        return _OrderStatusConfig(
          color: TekaColors.success,
          icon: Icons.check_circle,
          label: l10n.orderStatusDELIVERED,
        );
      case OrderStatus.cancelled:
        return _OrderStatusConfig(
          color: TekaColors.destructive,
          icon: Icons.cancel_outlined,
          label: l10n.orderStatusCANCELLED,
        );
      case OrderStatus.returned:
        return _OrderStatusConfig(
          color: const Color(0xFF9CA3AF),
          icon: Icons.undo,
          label: l10n.orderStatusRETURNED,
        );
    }
  }
}

class _OrderStatusConfig {
  final Color color;
  final IconData icon;
  final String label;

  const _OrderStatusConfig({
    required this.color,
    required this.icon,
    required this.label,
  });
}
