import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import '../../../../core/theme/teka_colors.dart';
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
    final orderAsync = ref.watch(sellerOrderDetailProvider(orderId));

    return Scaffold(
      appBar: AppBar(
        title: Text("Commandes"),
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
                Text("Une erreur est survenue. Veuillez réessayer."),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () =>
                      ref.invalidate(sellerOrderDetailProvider(orderId)),
                  child: Text("Réessayer"),
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
    final locale = 'fr';
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm', locale);
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
                      "Commande ${order.orderNumber}",
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
                title: "Acheteur",
                icon: Icons.person_outline,
                children: [
                  if (order.buyer != null) ...[
                    _buildInfoRow(
                      "Acheteur",
                      order.buyer!.fullName,
                    ),
                    const SizedBox(height: 4),
                    _buildInfoRow(
                      "Téléphone",
                      order.buyer!.phone,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 12),

              // Items
              _buildSectionCard(
                context,
                title: "${order.items.length} article(s)",
                icon: Icons.shopping_bag_outlined,
                children: [
                  ...order.items
                      .map((item) => _buildOrderItem(context, item, locale)),
                ],
              ),
              const SizedBox(height: 12),

              // Price breakdown
              _buildSectionCard(
                context,
                title: "Total",
                icon: Icons.receipt_outlined,
                children: [
                  _buildPriceRow(
                    "Sous-total",
                    '${formatFcNumber(order.subtotalCDFDisplay)} FC',
                  ),
                  const SizedBox(height: 4),
                  _buildPriceRow(
                    "Frais de livraison",
                    '${formatFcNumber(order.deliveryFeeCDFDisplay)} FC',
                  ),
                  const Divider(height: 16),
                  _buildPriceRow(
                    "Total",
                    '${formatFcNumber(order.totalCDFDisplay)} FC',
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
                  title: "Mode de paiement",
                  icon: Icons.payment_outlined,
                  children: [
                    if (order.paymentMethod != null)
                      _buildInfoRow(
                        "Mode de paiement",
                        _formatPaymentMethod(order.paymentMethod!),
                      ),
                    if (order.paymentStatus != null) ...[
                      const SizedBox(height: 4),
                      _buildInfoRow(
                        "Statut du paiement",
                        _formatPaymentStatus(order.paymentStatus!),
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
                  title: "Adresse de livraison",
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
              if (order.buyerNote != null && order.buyerNote!.isNotEmpty) ...[
                const SizedBox(height: 12),
                _buildSectionCard(
                  context,
                  title: "Note de l'acheteur",
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
                  title: "Historique",
                  icon: Icons.timeline,
                  children: [
                    _buildStatusTimeline(context, order.statusLogs),
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
                        "Confirmer",
                        () => ref
                            .read(sellerOrdersRepositoryProvider)
                            .confirmOrder(order.id),
                      ),
                      onReject: () => _showRejectDialog(context, order),
                      onProcess: () => _performAction(
                        context,
                        "Preparer",
                        () => ref
                            .read(sellerOrdersRepositoryProvider)
                            .processOrder(order.id),
                      ),
                      onShip: () => _performAction(
                        context,
                        "Expedier",
                        () => ref
                            .read(sellerOrdersRepositoryProvider)
                            .shipOrder(order.id),
                      ),
                      onOutForDelivery: () => _performAction(
                        context,
                        "En livraison",
                        () => ref
                            .read(sellerOrdersRepositoryProvider)
                            .markOutForDelivery(order.id),
                      ),
                      onDeliver: () => _performAction(
                        context,
                        "Livrer",
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

  Widget _buildOrderItem(
      BuildContext context, OrderItemModel item, String locale) {
    final title = item.productTitle;

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
                  'Quantité: ${item.quantity} x ${formatFcNumber(item.unitPriceCDFDisplay)} FC',
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
            '${formatFcNumber(item.totalCDFDisplay)} FC',
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

  Widget _buildStatusTimeline(
      BuildContext context, List<OrderStatusLogModel> logs) {
    final dateFormat = DateFormat('dd/MM HH:mm', 'fr');

    return Column(
      children: List.generate(logs.length, (index) {
        final log = logs[index];
        final isLast = index == logs.length - 1;
        final statusLabel = _getStatusLabel(log.toStatus);

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

  String _formatPaymentMethod(String method) {
    switch (method.toUpperCase()) {
      case 'COD':
      case 'CASH_ON_DELIVERY':
        return "Paiement a la livraison";
      case 'MOBILE_MONEY':
      case 'MPESA':
      case 'AIRTEL':
      case 'ORANGE':
        return "Mobile Money";
      default:
        return method;
    }
  }

  String _formatPaymentStatus(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return "En attente";
      case 'COMPLETED':
      case 'PAID':
        return "Paye";
      case 'FAILED':
        return "Echoue";
      default:
        return status;
    }
  }

  String _getStatusLabel(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return "En attente";
      case 'CONFIRMED':
        return "Confirmee";
      case 'PROCESSING':
        return "En préparation";
      case 'SHIPPED':
        return "Expediee";
      case 'OUT_FOR_DELIVERY':
        return "En livraison";
      case 'DELIVERED':
        return "Livree";
      case 'CANCELLED':
        return "Annulee";
      case 'RETURNED':
        return "Retournee";
      default:
        return status;
    }
  }

  Future<void> _performAction(
    BuildContext context,
    String actionLabel,
    Future<SellerOrderModel> Function() action,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(actionLabel),
        content: Text("Confirmer cette action ?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text("Annuler"),
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
            content: Text("Action effectuee"),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Une erreur est survenue. Veuillez réessayer."),
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
    SellerOrderModel order,
  ) async {
    final reasonController = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text("Rejeter"),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text("Raison du rejet"),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: "Expliquez la raison...",
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text("Annuler"),
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
            child: Text("Rejeter"),
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
            content: Text("Action effectuee"),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Une erreur est survenue. Veuillez réessayer."),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isPerformingAction = false);
    }
  }
}
