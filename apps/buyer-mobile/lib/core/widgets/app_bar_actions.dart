import 'package:flutter/material.dart';

import '../theme/teka_colors.dart';

class TekaAppBarIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final int badgeCount;
  final bool destructive;

  const TekaAppBarIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.badgeCount = 0,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final foreground =
        destructive ? TekaColors.destructive : TekaColors.foreground;
    final background =
        destructive ? TekaColors.destructiveSubtle : TekaColors.surfaceMuted;

    final button = IconButton(
      icon: Icon(icon, size: 22),
      tooltip: tooltip,
      onPressed: onPressed,
      style: IconButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        disabledBackgroundColor: TekaColors.surfaceMuted,
        disabledForegroundColor: TekaColors.mutedForeground,
        fixedSize: const Size(44, 44),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: TekaColors.border),
        ),
      ),
    );

    if (badgeCount <= 0) return button;

    return Badge(
      label: Text(badgeCount > 9 ? '9+' : '$badgeCount'),
      backgroundColor: TekaColors.tekaRed,
      textColor: Colors.white,
      child: button,
    );
  }
}

class TekaAppBarTextAction extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;

  const TekaAppBarTextAction({
    super.key,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: TekaColors.tekaRed,
        backgroundColor: TekaColors.tekaRedSubtle,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        minimumSize: const Size(0, 40),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
        textStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w800,
        ),
      ),
      child: Text(label),
    );
  }
}
