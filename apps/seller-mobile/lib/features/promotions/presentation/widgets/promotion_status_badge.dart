import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';

class PromotionStatusBadge extends StatelessWidget {
  final String status;
  final bool compact;

  const PromotionStatusBadge({
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

  _PromotionStatusConfig _statusConfig(AppLocalizations l10n) {
    switch (status) {
      case 'DRAFT':
        return _PromotionStatusConfig(
          color: TekaColors.mutedForeground,
          icon: Icons.edit_note,
          label: l10n.statusDraft,
        );
      case 'PENDING_APPROVAL':
        return _PromotionStatusConfig(
          color: TekaColors.warning,
          icon: Icons.hourglass_empty,
          label: l10n.promotionPendingApproval,
        );
      case 'APPROVED':
        return _PromotionStatusConfig(
          color: const Color(0xFF3B82F6),
          icon: Icons.check_circle_outline,
          label: l10n.promotionApproved,
        );
      case 'ACTIVE':
        return _PromotionStatusConfig(
          color: TekaColors.success,
          icon: Icons.campaign,
          label: l10n.statusActive,
        );
      case 'REJECTED':
        return _PromotionStatusConfig(
          color: TekaColors.destructive,
          icon: Icons.cancel_outlined,
          label: l10n.promotionRejected,
        );
      case 'EXPIRED':
        return _PromotionStatusConfig(
          color: const Color(0xFF9CA3AF),
          icon: Icons.timer_off_outlined,
          label: l10n.promotionExpired,
        );
      case 'CANCELLED':
        return _PromotionStatusConfig(
          color: const Color(0xFF9CA3AF),
          icon: Icons.block,
          label: l10n.promotionCancelled,
        );
      default:
        return _PromotionStatusConfig(
          color: TekaColors.mutedForeground,
          icon: Icons.help_outline,
          label: status,
        );
    }
  }
}

class _PromotionStatusConfig {
  final Color color;
  final IconData icon;
  final String label;

  const _PromotionStatusConfig({
    required this.color,
    required this.icon,
    required this.label,
  });
}
