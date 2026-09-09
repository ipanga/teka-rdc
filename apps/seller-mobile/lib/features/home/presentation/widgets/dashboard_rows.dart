import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../domain/action_center.dart';

/// Dashboard building blocks (Seller UX PR B). One row shape for tasks,
/// tracking and shortcuts; colour comes from the row's semantic tone, never
/// from the brand red, so the first screen stays calm and the pill colour
/// says what KIND of thing is waiting.

/// A section: header row (title + optional pill) above a white card.
class DashboardSection extends StatelessWidget {
  const DashboardSection({
    super.key,
    required this.title,
    required this.children,
    this.trailing,
  });
  final String title;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Expanded(
              child: Semantics(
                container: true,
                header: true,
                child: Text(title,
                    style: Theme.of(context).textTheme.titleLarge),
              ),
            ),
            if (trailing != null) trailing!,
          ]),
          const SizedBox(height: TekaSpacing.sm),
          DashboardCard(children: children),
        ],
      );
}

class DashboardCard extends StatelessWidget {
  const DashboardCard({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: TekaColors.background,
          border: Border.all(color: TekaColors.border),
          borderRadius: TekaRadius.lgAll,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0)
                const Divider(height: 1, indent: TekaSpacing.md),
              children[i],
            ],
          ],
        ),
      );
}

/// Pill colours by tone. Neutral = tracking / metrics (grey on muted).
class PillColors {
  const PillColors._(this.background, this.foreground);
  final Color background;
  final Color foreground;

  static const neutral = PillColors._(TekaColors.muted, TekaColors.foreground);
  static const attention =
      PillColors._(TekaColors.warningSubtle, TekaColors.warningForeground);
  static const rejected = PillColors._(
      TekaColors.destructiveSubtle, TekaColors.destructiveForeground);

  static PillColors of(ActionTone tone) => switch (tone) {
        ActionTone.attention => attention,
        ActionTone.rejected => rejected,
      };
}

/// Caps the visible number so a pill never widens past the row's title
/// column: « 999+ » is as much as a seller needs to read at a glance.
String pillLabel(int count) => count > 999 ? '999+' : '$count';

class CountPill extends StatelessWidget {
  const CountPill({super.key, required this.count, required this.colors});
  final int count;
  final PillColors colors;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minWidth: 36),
        padding: const EdgeInsets.symmetric(
            horizontal: TekaSpacing.xs, vertical: TekaSpacing.xxs),
        decoration: BoxDecoration(
            color: colors.background, borderRadius: TekaRadius.pillAll),
        child: Text(
          pillLabel(count),
          textAlign: TextAlign.center,
          style: Theme.of(context)
              .textTheme
              .labelLarge
              ?.copyWith(fontWeight: FontWeight.w700, color: colors.foreground),
        ),
      );
}

/// A tappable row: leading pill (count) or icon, title, helper, chevron.
/// The whole row is one button whose semantics read « 25, Commandes à
/// confirmer, Acceptez ou refusez… » — the count is never colour-only.
class DashboardRow extends StatelessWidget {
  const DashboardRow({
    super.key,
    required this.title,
    required this.icon,
    required this.onTap,
    this.subtitle,
    this.count,
    this.colors = PillColors.neutral,
    this.iconColor,
  });
  final String title;
  final String? subtitle;
  final IconData icon;
  final int? count;
  final PillColors colors;
  final Color? iconColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final label = [
      if (count != null) pillLabel(count!),
      title,
      if (subtitle != null) subtitle!,
    ].join(', ');
    return Semantics(
      container: true,
      button: true,
      label: label,
      child: ExcludeSemantics(
        child: InkWell(
          onTap: onTap,
          borderRadius: TekaRadius.lgAll,
          child: Padding(
            padding: const EdgeInsets.all(TekaSpacing.md),
            child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              if (count != null)
                CountPill(count: count!, colors: colors)
              else
                Icon(icon,
                    size: 22, color: iconColor ?? TekaColors.neutralForeground),
              const SizedBox(width: TekaSpacing.sm),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: theme.titleSmall),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(subtitle!,
                            style: theme.bodySmall
                                ?.copyWith(color: TekaColors.neutralForeground)),
                      ],
                    ]),
              ),
              const SizedBox(width: TekaSpacing.xs),
              const Icon(Icons.chevron_right, color: TekaColors.mutedForeground),
            ]),
          ),
        ),
      ),
    );
  }
}

/// « Nothing to do » — a positive, neutral line, not an empty warning box.
class DashboardClearRow extends StatelessWidget {
  const DashboardClearRow({super.key, required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(TekaSpacing.md),
        child: Row(children: [
          const Icon(Icons.check_circle_outline,
              size: 22, color: TekaColors.successForeground),
          const SizedBox(width: TekaSpacing.sm),
          Expanded(
              child: Text(label,
                  style: Theme.of(context).textTheme.bodyMedium)),
        ]),
      );
}

/// A source failed while its neighbours loaded: keep them, scope the error
/// to one row with its own retry. Never implies the queue is empty.
class DashboardErrorRow extends StatelessWidget {
  const DashboardErrorRow(
      {super.key, required this.title, required this.onRetry});
  final String title;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          TekaSpacing.md, TekaSpacing.xs, TekaSpacing.xs, TekaSpacing.xs),
      child: Row(children: [
        const Icon(Icons.cloud_off_outlined,
            size: 22, color: TekaColors.mutedForeground),
        const SizedBox(width: TekaSpacing.sm),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: theme.titleSmall),
            Text('Impossible d’actualiser les compteurs.',
                style: theme.bodySmall
                    ?.copyWith(color: TekaColors.neutralForeground)),
          ]),
        ),
        TextButton(
          onPressed: onRetry,
          style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
          child: const Text('Réessayer'),
        ),
      ]),
    );
  }
}

/// Static, content-shaped placeholders (no shimmer: cheap on a 2 GB phone
/// and still under reduced motion). [rows] task rows of pill + two lines.
class DashboardRowsSkeleton extends StatelessWidget {
  const DashboardRowsSkeleton({super.key, required this.label, this.rows = 2});
  final String label;
  final int rows;

  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        liveRegion: true,
        child: ExcludeSemantics(
          child: Column(children: [
            for (var i = 0; i < rows; i++)
              Padding(
                padding: const EdgeInsets.all(TekaSpacing.md),
                child: Row(children: [
                  const SkeletonBlock(width: 36, height: 24, pill: true),
                  const SizedBox(width: TekaSpacing.sm),
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SkeletonBlock(width: i.isEven ? 170 : 140, height: 15),
                          const SizedBox(height: TekaSpacing.xs),
                          const SkeletonBlock(width: 220, height: 12),
                        ]),
                  ),
                ]),
              ),
          ]),
        ),
      );
}

class SkeletonBlock extends StatelessWidget {
  const SkeletonBlock(
      {super.key,
      required this.width,
      required this.height,
      this.pill = false});
  final double width;
  final double height;
  final bool pill;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: BoxConstraints(maxWidth: width),
        child: Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            color: TekaColors.muted,
            borderRadius: pill ? TekaRadius.pillAll : TekaRadius.smAll,
          ),
        ),
      );
}
