import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
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
    final l10n = AppLocalizations.of(context)!;
    final config = _statusConfig(l10n);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 6 : 10,
        vertical: compact ? 2 : 4,
      ),
      decoration: BoxDecoration(
        color: config.color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: config.color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(config.icon, size: compact ? 12 : 14, color: config.color),
          const SizedBox(width: 4),
          Text(
            config.label,
            style: TextStyle(
              color: config.color,
              fontSize: compact ? 10 : 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  _StatusConfig _statusConfig(AppLocalizations l10n) {
    switch (status) {
      case ProductStatus.draft:
        return _StatusConfig(
          color: TekaColors.mutedForeground,
          icon: Icons.edit_note,
          label: l10n.statusDraft,
        );
      case ProductStatus.pendingReview:
        return _StatusConfig(
          color: TekaColors.warning,
          icon: Icons.hourglass_empty,
          label: l10n.statusPendingReview,
        );
      case ProductStatus.active:
        return _StatusConfig(
          color: TekaColors.success,
          icon: Icons.check_circle_outline,
          label: l10n.statusActive,
        );
      case ProductStatus.rejected:
        return _StatusConfig(
          color: TekaColors.destructive,
          icon: Icons.cancel_outlined,
          label: l10n.statusRejected,
        );
      case ProductStatus.archived:
        return _StatusConfig(
          color: const Color(0xFF9CA3AF),
          icon: Icons.archive_outlined,
          label: l10n.statusArchived,
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
