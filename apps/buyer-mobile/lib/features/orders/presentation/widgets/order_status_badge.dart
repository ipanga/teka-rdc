import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';

class OrderStatusBadge extends StatelessWidget {
  final String status;

  const OrderStatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final label = _statusLabel(status);
    final color = TekaColors.orderStatusColor(status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
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

  static String _statusLabel(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return "En attente";
      case 'CONFIRMED':
        return "Confirmée";
      case 'PROCESSING':
        return "En préparation";
      case 'READY_FOR_TEKA_PICKUP':
        return "Prête pour collecte";
      case 'RECEIVED_AT_TEKA':
        return "Reçue par Teka";
      case 'SHIPPED':
        return "Expédiée";
      case 'OUT_FOR_DELIVERY':
        return "En livraison";
      case 'DELIVERED':
        return "Livrée";
      case 'CANCELLED':
        return "Annulée";
      case 'RETURNED':
        return "Retournée";
      default:
        return status;
    }
  }
}
