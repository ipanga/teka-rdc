import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../data/models/order_model.dart';
import '../order_status_ui.dart';
import 'order_status_badge.dart';

/// One order in the list. Scannable in one glance: number, status chip and —
/// only while the seller must act — an amber « À confirmer / À préparer /
/// À finaliser » pill; buyer name, date, item count, total in foreground.
/// No action buttons here: every transition is confirmed from the detail,
/// where the seller sees the items first (accidental confirmations from a
/// list card were judged worse than one extra tap).
class OrderCard extends StatelessWidget {
  final SellerOrderModel order;

  const OrderCard({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final ui = OrderStatusUi.of(order.status);
    final total = '${formatFcNumber(order.totalCDFDisplay)} FC';
    final items = '${order.itemCount} article${order.itemCount == 1 ? '' : 's'}';
    final semantics = [
      'Commande ${order.orderNumber}',
      ui.label,
      if (ui.actionLabel != null) ui.actionLabel!,
      if (order.buyer != null) order.buyer!.fullName,
      items,
      total,
    ].join(', ');

    return Card(
      color: TekaColors.background,
      margin: const EdgeInsets.only(bottom: TekaSpacing.sm),
      elevation: 0,
      shape: const RoundedRectangleBorder(
        borderRadius: TekaRadius.lgAll,
        side: BorderSide(color: TekaColors.border),
      ),
      child: Semantics(
        button: true,
        label: semantics,
        child: ExcludeSemantics(
          child: InkWell(
            onTap: () => context.push('/orders/${order.id}'),
            borderRadius: TekaRadius.lgAll,
            child: Padding(
              padding: const EdgeInsets.all(TekaSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text('Commande ${order.orderNumber}',
                            style: theme.titleSmall),
                      ),
                      const SizedBox(width: TekaSpacing.xs),
                      const Icon(Icons.chevron_right,
                          size: 20, color: TekaColors.mutedForeground),
                    ],
                  ),
                  const SizedBox(height: TekaSpacing.xs),
                  Wrap(
                    spacing: TekaSpacing.xs,
                    runSpacing: TekaSpacing.xxs,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      OrderStatusBadge(status: order.status, compact: true),
                      if (ui.actionLabel != null)
                        _ActionPill(label: ui.actionLabel!),
                    ],
                  ),
                  if (order.buyer != null) ...[
                    const SizedBox(height: TekaSpacing.sm),
                    Text(order.buyer!.fullName, style: theme.bodyMedium),
                  ],
                  const SizedBox(height: TekaSpacing.xs),
                  Wrap(
                    spacing: TekaSpacing.sm,
                    runSpacing: TekaSpacing.xxs,
                    children: [
                      Text(
                          DateFormat('dd/MM/yyyy · HH:mm', 'fr')
                              .format(order.createdAt),
                          style: theme.bodySmall
                              ?.copyWith(color: TekaColors.mutedForeground)),
                      Text(items,
                          style: theme.bodySmall
                              ?.copyWith(color: TekaColors.mutedForeground)),
                    ],
                  ),
                  const SizedBox(height: TekaSpacing.sm),
                  Text(total,
                      style: theme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// « Attention » tone (same as the dashboard's order rows): the seller has a
/// step to take on this order. Text, not colour alone.
class _ActionPill extends StatelessWidget {
  const _ActionPill({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(
            horizontal: TekaSpacing.xs, vertical: TekaSpacing.xxs),
        decoration: const BoxDecoration(
          color: TekaColors.warningSubtle,
          borderRadius: TekaRadius.pillAll,
        ),
        child: Text(label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: TekaColors.warningForeground,
                fontWeight: FontWeight.w700)),
      );
}
