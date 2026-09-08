import 'package:flutter/material.dart';
import '../../../../core/widgets/seller_status_badge.dart';
import '../../data/models/order_model.dart';
import '../order_status_ui.dart';

/// Status chip. Wording, icon and tone come from [OrderStatusUi] — the same
/// source as the timeline and the filter bar.
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
    final ui = OrderStatusUi.of(status);
    return SellerStatusBadge(
      label: ui.label,
      icon: ui.icon,
      color: ui.color,
      compact: compact,
    );
  }
}
