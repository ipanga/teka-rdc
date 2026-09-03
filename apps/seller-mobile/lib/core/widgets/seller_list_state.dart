import 'package:flutter/material.dart';
import '../theme/teka_colors.dart';

/// Shared empty/error content. Can also be used as a non-blocking list footer.
class SellerListMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  const SellerListMessage({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 32, color: TekaColors.mutedForeground),
          const SizedBox(height: 16),
          Text(title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  )),
          const SizedBox(height: 8),
          Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: TekaColors.mutedForeground)),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: onAction,
            style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
            child: Text(actionLabel, textAlign: TextAlign.center),
          ),
        ],
      ),
    );
  }
}

/// Scrollable even when empty, so refresh and large text work on short screens.
class SellerListState extends StatelessWidget {
  final Widget child;
  const SellerListState({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverFillRemaining(hasScrollBody: false, child: Center(child: child)),
      ],
    );
  }
}

/// Static placeholders avoid animation/rebuild overhead and honor reduced motion.
class SellerListLoading extends StatelessWidget {
  final String label;
  const SellerListLoading({super.key, required this.label});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      liveRegion: true,
      child: ExcludeSemantics(
        child: ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: 4,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (_, __) => Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: TekaColors.background,
              border: Border.all(color: TekaColors.border),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Placeholder(width: 160, height: 18),
                SizedBox(height: 12),
                _Placeholder(width: 110, height: 14),
                SizedBox(height: 12),
                _Placeholder(width: 200, height: 14),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  final double width;
  final double height;
  const _Placeholder({required this.width, required this.height});

  @override
  Widget build(BuildContext context) => Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: TekaColors.muted,
          borderRadius: BorderRadius.circular(4),
        ),
      );
}
