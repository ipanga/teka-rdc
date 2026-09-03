import 'package:flutter/material.dart';
import '../theme/teka_colors.dart';

/// Presentation only: callers keep ownership of the domain status mapping.
class SellerStatusBadge extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool compact;

  const SellerStatusBadge({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 8 : 10,
        vertical: compact ? 4 : 6,
      ),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
            color.withValues(alpha: 0.08), TekaColors.background),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: compact ? 14 : 16, color: color),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: compact ? 11 : 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
