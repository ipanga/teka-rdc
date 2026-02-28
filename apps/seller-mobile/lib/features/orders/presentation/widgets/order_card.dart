import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/order_model.dart';
import 'order_status_badge.dart';

class OrderCard extends StatelessWidget {
  final SellerOrderModel order;

  const OrderCard({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm', l10n.localeName);
    final priceFormat = NumberFormat('#,###', 'fr');

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: TekaColors.border),
      ),
      child: InkWell(
        onTap: () => context.push('/orders/${order.id}'),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Order number + status
              Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.orderNumber(order.orderNumber),
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  OrderStatusBadge(status: order.status, compact: true),
                ],
              ),
              const SizedBox(height: 8),

              // Buyer name
              if (order.buyer != null)
                Row(
                  children: [
                    const Icon(Icons.person_outline,
                        size: 14, color: TekaColors.mutedForeground),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        order.buyer!.fullName,
                        style: const TextStyle(
                          fontSize: 13,
                          color: TekaColors.mutedForeground,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: 6),

              // Date + item count + total
              Row(
                children: [
                  const Icon(Icons.calendar_today_outlined,
                      size: 12, color: TekaColors.mutedForeground),
                  const SizedBox(width: 4),
                  Text(
                    dateFormat.format(order.createdAt),
                    style: const TextStyle(
                      fontSize: 11,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Icon(Icons.shopping_bag_outlined,
                      size: 12, color: TekaColors.mutedForeground),
                  const SizedBox(width: 4),
                  Text(
                    l10n.orderItems(order.itemCount),
                    style: const TextStyle(
                      fontSize: 11,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${priceFormat.format(order.totalCDFDisplay)} CDF',
                    style: TextStyle(
                      color: TekaColors.tekaRed,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
