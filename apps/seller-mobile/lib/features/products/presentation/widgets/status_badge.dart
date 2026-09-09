import 'package:flutter/material.dart';
import '../../../../core/widgets/seller_status_badge.dart';
import '../../data/models/product_model.dart';
import '../product_status_ui.dart';

/// Product status chip. Wording, icon and tone come from [ProductStatusUi].
class StatusBadge extends StatelessWidget {
  final ProductStatus status;
  final bool compact;

  const StatusBadge({
    super.key,
    required this.status,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final ui = ProductStatusUi.of(status);
    return SellerStatusBadge(
      label: ui.label,
      icon: ui.icon,
      color: ui.color,
      compact: compact,
    );
  }
}
