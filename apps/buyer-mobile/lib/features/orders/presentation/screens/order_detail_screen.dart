import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/order_model.dart';
import '../../data/orders_repository.dart';
import '../providers/orders_provider.dart';
import '../widgets/order_status_badge.dart';
import '../widgets/order_timeline.dart';

class OrderDetailScreen extends ConsumerWidget {
  final String orderId;

  const OrderDetailScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final orderAsync = ref.watch(orderDetailProvider(orderId));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.ordersTitle),
      ),
      body: orderAsync.when(
        data: (order) => _OrderDetailBody(
          order: order,
          l10n: l10n,
          locale: locale,
          onCancel: () => _showCancelDialog(context, ref, l10n, order.id),
        ),
        loading: () => const Center(
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.error_outline,
                  size: 48,
                  color: TekaColors.mutedForeground,
                ),
                const SizedBox(height: 12),
                Text(
                  l10n.authGenericError,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: TekaColors.mutedForeground),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () {
                    ref.invalidate(orderDetailProvider(orderId));
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: TekaColors.tekaRed,
                  ),
                  child: Text(l10n.backToHome),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showCancelDialog(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
    String orderId,
  ) {
    final reasonController = TextEditingController();

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.orderCancel),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.orderCancelConfirm),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              maxLines: 2,
              decoration: InputDecoration(
                labelText: l10n.orderCancelReason,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.all(12),
              ),
              style: const TextStyle(fontSize: 14),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(l10n.filterReset),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              try {
                final repository = ref.read(ordersRepositoryProvider);
                await repository.cancelOrder(
                  orderId,
                  reason: reasonController.text.isNotEmpty
                      ? reasonController.text
                      : null,
                );
                ref.invalidate(orderDetailProvider(orderId));
                ref.read(ordersProvider.notifier).refresh();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(l10n.orderCancelSuccess),
                      backgroundColor: TekaColors.success,
                    ),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(l10n.authGenericError),
                      backgroundColor: TekaColors.destructive,
                    ),
                  );
                }
              }
            },
            style: FilledButton.styleFrom(
              backgroundColor: TekaColors.destructive,
            ),
            child: Text(l10n.orderCancel),
          ),
        ],
      ),
    );
  }
}

class _OrderDetailBody extends StatelessWidget {
  final OrderModel order;
  final AppLocalizations l10n;
  final String locale;
  final VoidCallback onCancel;

  const _OrderDetailBody({
    required this.order,
    required this.l10n,
    required this.locale,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final dateStr = _formatDate(order.createdAt);
    final isPending = order.status.toUpperCase() == 'PENDING';

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Order header
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.orderNumber(order.orderNumber),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: TekaColors.foreground,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      dateStr,
                      style: const TextStyle(
                        color: TekaColors.mutedForeground,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              OrderStatusBadge(status: order.status),
            ],
          ),
          const SizedBox(height: 12),

          // Payment status
          Row(
            children: [
              const Icon(
                Icons.payment_outlined,
                size: 16,
                color: TekaColors.mutedForeground,
              ),
              const SizedBox(width: 6),
              Text(
                '${l10n.orderPaymentStatus}: ',
                style: const TextStyle(
                  color: TekaColors.mutedForeground,
                  fontSize: 13,
                ),
              ),
              _PaymentStatusChip(
                paymentStatus: order.paymentStatus,
                l10n: l10n,
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Items
          Text(
            l10n.orderItems(order.itemCount),
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: TekaColors.foreground,
                ),
          ),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              border: Border.all(color: TekaColors.border),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                for (var i = 0; i < order.items.length; i++) ...[
                  if (i > 0)
                    const Divider(height: 1, color: TekaColors.border),
                  _OrderItemRow(item: order.items[i], locale: locale),
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Seller
          if (order.seller != null) ...[
            Row(
              children: [
                const Icon(
                  Icons.storefront_outlined,
                  size: 18,
                  color: TekaColors.mutedForeground,
                ),
                const SizedBox(width: 8),
                Text(
                  '${l10n.orderSeller}: ',
                  style: const TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 14,
                  ),
                ),
                Expanded(
                  child: Text(
                    order.seller!.sellerProfile?.businessName ??
                        [order.seller!.firstName, order.seller!.lastName]
                            .where((s) => s != null && s.isNotEmpty)
                            .join(' '),
                    style: const TextStyle(
                      color: TekaColors.foreground,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
          ],

          // Price breakdown
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: TekaColors.muted,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                _PriceRow(
                  label: l10n.orderSubtotal,
                  value: formatCDF(order.subtotalCDF),
                ),
                const SizedBox(height: 8),
                _PriceRow(
                  label: l10n.orderDeliveryFee,
                  value: formatCDF(order.deliveryFeeCDF),
                ),
                const SizedBox(height: 8),
                const Divider(color: TekaColors.border),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      l10n.orderTotal,
                      style: const TextStyle(
                        color: TekaColors.foreground,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      formatCDF(order.totalCDF),
                      style: const TextStyle(
                        color: TekaColors.tekaRed,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                if (order.totalUSD != null) ...[
                  const SizedBox(height: 4),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      formatUSD(order.totalUSD!),
                      style: const TextStyle(
                        color: TekaColors.mutedForeground,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Delivery address
          if (order.deliveryAddress != null) ...[
            Text(
              l10n.orderDeliveryAddress,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: TekaColors.foreground,
                  ),
            ),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                border: Border.all(color: TekaColors.border),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (order.deliveryAddress!.label != null &&
                      order.deliveryAddress!.label!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        order.deliveryAddress!.label!,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: TekaColors.foreground,
                        ),
                      ),
                    ),
                  Text(
                    order.deliveryAddress!.displayAddress,
                    style: const TextStyle(
                      color: TekaColors.foreground,
                      fontSize: 13,
                    ),
                  ),
                  if (order.deliveryAddress!.recipientName != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        '${order.deliveryAddress!.recipientName}${order.deliveryAddress!.recipientPhone != null ? ' - ${order.deliveryAddress!.recipientPhone}' : ''}',
                        style: const TextStyle(
                          color: TekaColors.mutedForeground,
                          fontSize: 12,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 20),
          ],

          // Buyer note
          if (order.buyerNote != null && order.buyerNote!.isNotEmpty) ...[
            Text(
              l10n.checkoutNote,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: TekaColors.foreground,
                  ),
            ),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: TekaColors.muted,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                order.buyerNote!,
                style: const TextStyle(
                  color: TekaColors.foreground,
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],

          // Status timeline
          if (order.statusLogs.isNotEmpty) ...[
            Text(
              l10n.orderTimeline,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: TekaColors.foreground,
                  ),
            ),
            const SizedBox(height: 12),
            OrderTimeline(statusLogs: order.statusLogs),
          ],

          // Cancel button
          if (isPending) ...[
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: onCancel,
                style: OutlinedButton.styleFrom(
                  foregroundColor: TekaColors.destructive,
                  side: const BorderSide(color: TekaColors.destructive),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text(l10n.orderCancel),
              ),
            ),
          ],

          // Bottom padding
          SizedBox(height: MediaQuery.of(context).viewPadding.bottom + 16),
        ],
      ),
    );
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('dd/MM/yyyy HH:mm', 'fr').format(date);
    } catch (_) {
      return dateStr;
    }
  }
}

class _OrderItemRow extends StatelessWidget {
  final OrderItemModel item;
  final String locale;

  const _OrderItemRow({required this.item, required this.locale});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              width: 56,
              height: 56,
              child: item.productImage != null && item.productImage!.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: item.productImage!,
                      fit: BoxFit.cover,
                      placeholder: (_, __) => Container(
                        color: TekaColors.muted,
                      ),
                      errorWidget: (_, __, ___) => Container(
                        color: TekaColors.muted,
                        child: const Icon(
                          Icons.image_outlined,
                          size: 20,
                          color: TekaColors.mutedForeground,
                        ),
                      ),
                    )
                  : Container(
                      color: TekaColors.muted,
                      child: const Icon(
                        Icons.image_outlined,
                        size: 20,
                        color: TekaColors.mutedForeground,
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.localizedTitle(locale),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    color: TekaColors.foreground,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${formatCDF(item.unitPriceCDF)} x ${item.quantity}',
                  style: const TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            formatCDF(item.totalCDF),
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
              color: TekaColors.foreground,
            ),
          ),
        ],
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  final String label;
  final String value;

  const _PriceRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: TekaColors.mutedForeground,
            fontSize: 14,
          ),
        ),
        Text(
          value,
          style: const TextStyle(
            color: TekaColors.foreground,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _PaymentStatusChip extends StatelessWidget {
  final String paymentStatus;
  final AppLocalizations l10n;

  const _PaymentStatusChip({
    required this.paymentStatus,
    required this.l10n,
  });

  @override
  Widget build(BuildContext context) {
    final status = paymentStatus.toUpperCase();
    final Color chipColor;
    final String label;

    switch (status) {
      case 'COMPLETED':
      case 'PAID':
        chipColor = TekaColors.success;
        label = l10n.paymentStatusCompleted;
        break;
      case 'FAILED':
        chipColor = TekaColors.destructive;
        label = l10n.paymentStatusFailed;
        break;
      case 'REFUNDED':
        chipColor = const Color(0xFF2563EB);
        label = status;
        break;
      case 'PENDING':
      case 'PROCESSING':
      default:
        chipColor = TekaColors.warning;
        label = l10n.paymentStatusPending;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: chipColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: chipColor,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
