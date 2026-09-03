import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/seller_status_badge.dart';
import '../../data/models/product_model.dart';

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
    final config = _statusConfig();

    return SellerStatusBadge(
      label: config.label,
      icon: config.icon,
      color: config.color,
      compact: compact,
    );
  }

  _StatusConfig _statusConfig() {
    switch (status) {
      case ProductStatus.draft:
        return _StatusConfig(
          color: TekaColors.neutralForeground,
          icon: Icons.edit_note,
          label: "Brouillon",
        );
      case ProductStatus.pendingReview:
        return _StatusConfig(
          color: TekaColors.warningForeground,
          icon: Icons.hourglass_empty,
          label: "En attente",
        );
      case ProductStatus.active:
        return _StatusConfig(
          color: TekaColors.successForeground,
          icon: Icons.check_circle_outline,
          label: "Actif",
        );
      case ProductStatus.rejected:
        return _StatusConfig(
          color: TekaColors.destructiveForeground,
          icon: Icons.cancel_outlined,
          label: "Rejeté",
        );
      case ProductStatus.archived:
        return _StatusConfig(
          color: TekaColors.neutralForeground,
          icon: Icons.archive_outlined,
          label: "Archivé",
        );
      case ProductStatus.suspended:
        return _StatusConfig(
          color: TekaColors.destructiveForeground,
          icon: Icons.block,
          label: "Suspendu",
        );
    }
  }
}

class _StatusConfig {
  final Color color;
  final IconData icon;
  final String label;

  const _StatusConfig({
    required this.color,
    required this.icon,
    required this.label,
  });
}
