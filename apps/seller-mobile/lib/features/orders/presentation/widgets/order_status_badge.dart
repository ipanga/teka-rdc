import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/seller_status_badge.dart';
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

    return SellerStatusBadge(
      label: config.label,
      icon: config.icon,
      color: config.color,
      compact: compact,
    );
  }

  _OrderStatusConfig _statusConfig() {
    switch (status) {
      case OrderStatus.pending:
        return _OrderStatusConfig(
          color: TekaColors.warningForeground,
          icon: Icons.hourglass_empty,
          label: "En attente",
        );
      case OrderStatus.confirmed:
        return _OrderStatusConfig(
          color: TekaColors.infoForeground,
          icon: Icons.check_circle_outline,
          label: "Confirmée",
        );
      case OrderStatus.processing:
        return _OrderStatusConfig(
          color: TekaColors.infoForeground,
          icon: Icons.settings_outlined,
          label: "En préparation",
        );
      case OrderStatus.readyForTekaPickup:
        return _OrderStatusConfig(
          color: TekaColors.infoForeground,
          icon: Icons.inventory_2_outlined,
          label: "Prête pour collecte",
        );
      case OrderStatus.receivedAtTeka:
        return _OrderStatusConfig(
          color: TekaColors.infoForeground,
          icon: Icons.warehouse_outlined,
          label: "Reçue par Teka",
        );
      case OrderStatus.shipped:
        return _OrderStatusConfig(
          color: TekaColors.infoForeground,
          icon: Icons.local_shipping_outlined,
          label: "Expédiée",
        );
      case OrderStatus.outForDelivery:
        return _OrderStatusConfig(
          color: TekaColors.infoForeground,
          icon: Icons.delivery_dining,
          label: "En livraison",
        );
      case OrderStatus.delivered:
        return _OrderStatusConfig(
          color: TekaColors.successForeground,
          icon: Icons.check_circle,
          label: "Livrée",
        );
      case OrderStatus.cancelled:
        return _OrderStatusConfig(
          color: TekaColors.destructiveForeground,
          icon: Icons.cancel_outlined,
          label: "Annulée",
        );
      case OrderStatus.returned:
        return _OrderStatusConfig(
          color: TekaColors.neutralForeground,
          icon: Icons.undo,
          label: "Retournée",
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
