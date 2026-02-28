import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/order_model.dart';
import '../../data/orders_repository.dart';
import '../providers/orders_provider.dart';
import '../widgets/order_action_buttons.dart';
import '../widgets/order_status_badge.dart';

class OrderDetailScreen extends ConsumerWidget {
  final String orderId;

  const OrderDetailScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final orderAsync = ref.watch(sellerOrderDetailProvider(orderId));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.ordersTitle),
      ),
      body: orderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline,
                    size: 48, color: TekaColors.destructive),
                const SizedBox(height: 12),
                Text(l10n.authGenericError),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () =>
                      ref.invalidate(sellerOrderDetailProvider(orderId)),
                  child: Text(l10n.loadMore),
                ),
              ],
            ),
          ),
        ),
        data: (order) => _OrderDetailContent(order: order, orderId: orderId),
      ),
    );
  }
}

class _OrderDetailContent extends ConsumerStatefulWidget {
  final SellerOrderModel order;
  final String orderId;

  const _OrderDetailContent({
    required this.order,
    required this.orderId,
  });

  @override
  ConsumerState<_OrderDetailContent> createState() =>
      _OrderDetailContentState();
}

class _OrderDetailContentState extends ConsumerState<_OrderDetailContent> {
  bool _isPerformingAction = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = l10n.localeName;
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm', locale);
    final priceFormat = NumberFormat('#,###', 'fr');
    final order = widget.order;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Order header
              Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.orderNumber(order.orderNumber),
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                  ),
                  OrderStatusBadge(status: order.status),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  const Icon(Icons.calendar_today_outlined,
                      size: 14, color: TekaColors.mutedForeground),
                  const SizedBox(width: 4),
                  Text(
                    dateFormat.format(order.createdAt),
                    style: const TextStyle(
                      fontSize: 13,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Buyer info
              _buildSectionCard(
                context,
                title: l10n.orderBuyer,
                icon: Icons.person_outline,
                children: [
                  if (order.buyer != null) ...[
                    _buildInfoRow(
                      l10n.orderBuyer,
                      order.buyer!.fullName,
                    ),
                    const SizedBox(height: 4),
                    _buildInfoRow(
                      l10n.orderPhone,
                      order.buyer!.phone,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 12),

              // Items
              _buildSectionCard(
                context,
                title: l10n.orderItems(order.items.length),
                icon: Icons.shopping_bag_outlined,
                children: [
                  ...order.items.map(
                      (item) => _buildOrderItem(context, l10n, item, locale)),
                ],
              ),
              const SizedBox(height: 12),

              // Price breakdown
              _buildSectionCard(
                context,
                title: l10n.orderTotal,
                icon: Icons.receipt_outlined,
                children: [
                  _buildPriceRow(
                    l10n.orderSubtotal,
                    '${priceFormat.format(order.subtotalCDFDisplay)} CDF',
                  ),
                  const SizedBox(height: 4),
                  _buildPriceRow(
                    l10n.orderDeliveryFee,
                    '${priceFormat.format(order.deliveryFeeCDFDisplay)} CDF',
                  ),
                  const Divider(height: 16),
                  _buildPriceRow(
                    l10n.orderTotal,
                    '${priceFormat.format(order.totalCDFDisplay)} CDF',
                    isBold: true,
                    color: TekaColors.tekaRed,
                  ),
                  if (order.totalUSDDisplay != null) ...[
                    const SizedBox(height: 2),
                    Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        '\$${order.totalUSDDisplay!.toStringAsFixed(2)} USD',
                        style: const TextStyle(
                          fontSize: 12,
                          color: TekaColors.mutedForeground,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              // Payment info
              if (order.paymentMethod != null ||
                  order.paymentStatus != null) ...[
                const SizedBox(height: 12),
                _buildSectionCard(
                  context,
                  title: l10n.orderPaymentMethod,
                  icon: Icons.payment_outlined,
                  children: [
                    if (order.paymentMethod != null)
                      _buildInfoRow(
                        l10n.orderPaymentMethod,
                        _formatPaymentMethod(l10n, order.paymentMethod!),
                      ),
                    if (order.paymentStatus != null) ...[
                      const SizedBox(height: 4),
                      _buildInfoRow(
                        l10n.orderPaymentStatus,
                        _formatPaymentStatus(l10n, order.paymentStatus!),
                      ),
                    ],
                  ],
                ),
              ],

              const SizedBox(height: 12),

              // Delivery address
              if (order.deliveryAddress != null)
                _buildSectionCard(
                  context,
                  title: l10n.orderDeliveryAddress,
                  icon: Icons.location_on_outlined,
                  children: [
                    Text(
                      order.deliveryAddress!.formattedAddress,
                      style: const TextStyle(fontSize: 14),
                    ),
                    if (order.deliveryAddress!.reference != null &&
                        order.deliveryAddress!.reference!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        order.deliveryAddress!.reference!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: TekaColors.mutedForeground,
                        ),
                      ),
                    ],
                    if (order.deliveryAddress!.recipientName != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        '${order.deliveryAddress!.recipientName}',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ],
                    if (order.deliveryAddress!.recipientPhone != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        order.deliveryAddress!.recipientPhone!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: TekaColors.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),

              // Buyer note
              if (order.buyerNote != null &&
                  order.buyerNote!.isNotEmpty) ...[
                const SizedBox(height: 12),
                _buildSectionCard(
                  context,
                  title: l10n.orderBuyerNote,
                  icon: Icons.note_outlined,
                  children: [
                    Text(
                      order.buyerNote!,
                      style: const TextStyle(fontSize: 14),
                    ),
                  ],
                ),
              ],

              // Status timeline
              if (order.statusLogs.isNotEmpty) ...[
                const SizedBox(height: 12),
                _buildSectionCard(
                  context,
                  title: l10n.orderTimeline,
                  icon: Icons.timeline,
                  children: [
                    _buildStatusTimeline(context, l10n, order.statusLogs),
                  ],
                ),
              ],

              const SizedBox(height: 80),
            ],
          ),
        ),

        // Action buttons at the bottom
        if (_hasActions(order.status))
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: TekaColors.background,
              border: const Border(
                top: BorderSide(color: TekaColors.border),
              ),
            ),
            child: SafeArea(
              top: false,
              child: _isPerformingAction
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: CircularProgressIndicator(),
                      ),
                    )
                  : OrderActionButtons(
                      status: order.status,
                      onConfirm: () => _performAction(
                        context,
                        l10n,
                        l10n.orderConfirm,
                        () => ref
                            .read(sellerOrdersRepositoryProvider)
                            .confirmOrder(order.id),
                      ),
                      onReject: () => _showRejectDialog(context, l10n, order),
                      onProcess: () => _performAction(
                        context,
                        l10n,
                        l10n.orderProcess,
                        () => ref
                            .read(sellerOrdersRepositoryProvider)
                            .processOrder(order.id),
                      ),
                      onShip: () => _performAction(
                        context,
                        l10n,
                        l10n.orderShip,
                        () => ref
                            .read(sellerOrdersRepositoryProvider)
                            .shipOrder(order.id),
                      ),
                      onOutForDelivery: () => _performAction(
                        context,
                        l10n,
                        l10n.orderOutForDelivery,
                        () => ref
                            .read(sellerOrdersRepositoryProvider)
                            .markOutForDelivery(order.id),
                      ),
                      onDeliver: () => _performAction(
                        context,
                        l10n,
                        l10n.orderDeliver,
                        () => ref
                            .read(sellerOrdersRepositoryProvider)
                            .deliverOrder(order.id),
                      ),
                    ),
            ),
          ),
      ],
    );
  }

  bool _hasActions(OrderStatus status) {
    return status != OrderStatus.delivered &&
        status != OrderStatus.cancelled &&
        status != OrderStatus.returned;
  }

  Widget _buildSectionCard(
    BuildContext context, {
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) {
    return Container(
      width: double.infinity,
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
              Icon(icon, size: 16, color: TekaColors.mutedForeground),
              const SizedBox(width: 6),
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  color: TekaColors.mutedForeground,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 90,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              color: TekaColors.mutedForeground,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPriceRow(String label, String value,
      {bool isBold = false, Color? color}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: isBold ? FontWeight.w600 : FontWeight.normal,
            color: isBold ? TekaColors.foreground : TekaColors.mutedForeground,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: isBold ? 15 : 13,
            fontWeight: isBold ? FontWeight.w700 : FontWeight.w500,
            color: color ?? TekaColors.foreground,
          ),
        ),
      ],
    );
  }

  Widget _buildOrderItem(BuildContext context, AppLocalizations l10n,
      OrderItemModel item, String locale) {
    final priceFormat = NumberFormat('#,###', 'fr');
    final title = item.getLocalizedTitle(locale);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Product thumbnail
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              width: 48,
              height: 48,
              child: item.productImage != null
                  ? Image.network(
                      item.productImage!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => _placeholderImage(),
                      loadingBuilder: (_, child, loadingProgress) {
                        if (loadingProgress == null) return child;
                        return _placeholderImage();
                      },
                    )
                  : _placeholderImage(),
            ),
          ),
          const SizedBox(width: 10),
          // Product details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  '${l10n.quantity}: ${item.quantity} x ${priceFormat.format(item.unitPriceCDFDisplay)} CDF',
                  style: const TextStyle(
                    fontSize: 11,
                    color: TekaColors.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${priceFormat.format(item.totalCDFDisplay)} CDF',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: TekaColors.tekaRed,
            ),
          ),
        ],
      ),
    );
  }

  Widget _placeholderImage() {
    return Container(
      color: TekaColors.muted,
      child: const Icon(
        Icons.image_outlined,
        color: TekaColors.mutedForeground,
        size: 24,
      ),
    );
  }

  Widget _buildStatusTimeline(BuildContext context, AppLocalizations l10n,
      List<OrderStatusLogModel> logs) {
    final dateFormat = DateFormat('dd/MM HH:mm', l10n.localeName);

    return Column(
      children: List.generate(logs.length, (index) {
        final log = logs[index];
        final isLast = index == logs.length - 1;
        final statusLabel = _getStatusLabel(l10n, log.toStatus);

        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Timeline dot & line
              SizedBox(
                width: 24,
                child: Column(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isLast
                            ? TekaColors.tekaRed
                            : TekaColors.mutedForeground,
                      ),
                    ),
                    if (!isLast)
                      Expanded(
                        child: Container(
                          width: 2,
                          color: TekaColors.border,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Status info
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        statusLabel,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight:
                              isLast ? FontWeight.w600 : FontWeight.normal,
                          color: isLast
                              ? TekaColors.foreground
                              : TekaColors.mutedForeground,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        dateFormat.format(log.createdAt),
                        style: const TextStyle(
                          fontSize: 11,
                          color: TekaColors.mutedForeground,
                        ),
                      ),
                      if (log.note != null && log.note!.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          log.note!,
                          style: const TextStyle(
                            fontSize: 11,
                            fontStyle: FontStyle.italic,
                            color: TekaColors.mutedForeground,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }

  String _formatPaymentMethod(AppLocalizations l10n, String method) {
    switch (method.toUpperCase()) {
      case 'COD':
      case 'CASH_ON_DELIVERY':
        return l10n.paymentCOD;
      case 'MOBILE_MONEY':
      case 'MPESA':
      case 'AIRTEL':
      case 'ORANGE':
        return l10n.paymentMobileMoney;
      default:
        return method;
    }
  }

  String _formatPaymentStatus(AppLocalizations l10n, String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return l10n.paymentPending;
      case 'COMPLETED':
      case 'PAID':
        return l10n.paymentCompleted;
      case 'FAILED':
        return l10n.paymentFailed;
      default:
        return status;
    }
  }

  String _getStatusLabel(AppLocalizations l10n, String status) {
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

  Future<void> _performAction(
    BuildContext context,
    AppLocalizations l10n,
    String actionLabel,
    Future<SellerOrderModel> Function() action,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(actionLabel),
        content: Text(l10n.orderActionConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: TekaColors.tekaRed,
              foregroundColor: Colors.white,
            ),
            child: Text(actionLabel),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _isPerformingAction = true);
    try {
      await action();
      ref.invalidate(sellerOrderDetailProvider(widget.orderId));
      ref.invalidate(sellerOrdersProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.orderActionSuccess),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.authGenericError),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isPerformingAction = false);
    }
  }

  Future<void> _showRejectDialog(
    BuildContext context,
    AppLocalizations l10n,
    SellerOrderModel order,
  ) async {
    final reasonController = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.orderReject),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l10n.orderRejectReason),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: l10n.orderRejectHint,
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l10n.cancel),
          ),
          ElevatedButton(
            onPressed: () {
              final text = reasonController.text.trim();
              if (text.isNotEmpty) {
                Navigator.pop(ctx, text);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: TekaColors.destructive,
              foregroundColor: Colors.white,
            ),
            child: Text(l10n.orderReject),
          ),
        ],
      ),
    );

    reasonController.dispose();

    if (reason == null || reason.isEmpty || !mounted) return;

    setState(() => _isPerformingAction = true);
    try {
      await ref
          .read(sellerOrdersRepositoryProvider)
          .rejectOrder(order.id, reason);
      ref.invalidate(sellerOrderDetailProvider(widget.orderId));
      ref.invalidate(sellerOrdersProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.orderActionSuccess),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.authGenericError),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isPerformingAction = false);
    }
  }
}
