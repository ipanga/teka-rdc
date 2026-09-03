import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/order_model.dart';
import 'order_status_badge.dart';

class OrderCard extends StatelessWidget {
  final SellerOrderModel order;

  const OrderCard({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: TekaColors.background,
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: TekaColors.border),
      ),
      child: Semantics(
        button: true,
        child: InkWell(
          onTap: () => context.push('/orders/${order.id}'),
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Commande ${order.orderNumber}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 15),
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(Icons.chevron_right,
                        size: 20, color: TekaColors.mutedForeground),
                  ],
                ),
                const SizedBox(height: 8),
                OrderStatusBadge(status: order.status, compact: true),
                if (order.buyer != null) ...[
                  const SizedBox(height: 12),
                  Text(order.buyer!.fullName,
                      style: const TextStyle(
                          fontSize: 14, color: TekaColors.foreground)),
                ],
                const SizedBox(height: 8),
                Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  children: [
                    Text(
                        DateFormat('dd/MM/yyyy · HH:mm', 'fr')
                            .format(order.createdAt),
                        style: const TextStyle(
                            fontSize: 12, color: TekaColors.mutedForeground)),
                    Text(
                        '${order.itemCount} article${order.itemCount == 1 ? '' : 's'}',
                        style: const TextStyle(
                            fontSize: 12, color: TekaColors.mutedForeground)),
                  ],
                ),
                const SizedBox(height: 12),
                Text('${formatFcNumber(order.totalCDFDisplay)} FC',
                    style: const TextStyle(
                        fontSize: 17, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
