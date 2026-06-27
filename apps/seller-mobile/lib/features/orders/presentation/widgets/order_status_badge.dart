import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
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
    final config = _statusConfig();

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

  _OrderStatusConfig _statusConfig() {
    switch (status) {
      case OrderStatus.pending:
        return _OrderStatusConfig(
          color: TekaColors.warning,
          icon: Icons.hourglass_empty,
          label: "En attente",
        );
      case OrderStatus.confirmed:
        return _OrderStatusConfig(
          color: const Color(0xFF3B82F6),
          icon: Icons.check_circle_outline,
          label: "Confirmee",
        );
      case OrderStatus.processing:
        return _OrderStatusConfig(
          color: const Color(0xFF6366F1),
          icon: Icons.settings_outlined,
          label: "En préparation",
        );
      case OrderStatus.shipped:
        return _OrderStatusConfig(
          color: const Color(0xFF0EA5E9),
          icon: Icons.local_shipping_outlined,
          label: "Expediee",
        );
      case OrderStatus.outForDelivery:
        return _OrderStatusConfig(
          color: const Color(0xFF0891B2),
          icon: Icons.delivery_dining,
          label: "En livraison",
        );
      case OrderStatus.delivered:
        return _OrderStatusConfig(
          color: TekaColors.success,
          icon: Icons.check_circle,
          label: "Livree",
        );
      case OrderStatus.cancelled:
        return _OrderStatusConfig(
          color: TekaColors.destructive,
          icon: Icons.cancel_outlined,
          label: "Annulee",
        );
      case OrderStatus.returned:
        return _OrderStatusConfig(
          color: const Color(0xFF9CA3AF),
          icon: Icons.undo,
          label: "Retournee",
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
