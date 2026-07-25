import 'package:flutter/material.dart';
import '../theme/teka_colors.dart';

/// Shared empty + error state widgets so every screen renders these the same
/// way (consistent icon size, hierarchy, copy, and a retry/CTA affordance)
/// instead of re-implementing them ad hoc. French copy is passed in by the
/// caller (or defaulted for errors).

/// Friendly empty state: icon + title (+ optional message) + optional CTA.
class AppEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: TekaColors.surface,
            border: Border.all(color: TekaColors.border),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: TekaColors.surfaceMuted,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child:
                      Icon(icon, size: 28, color: TekaColors.mutedForeground),
                ),
                const SizedBox(height: 14),
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: TekaColors.foreground,
                        fontWeight: FontWeight.w700,
                      ),
                  textAlign: TextAlign.center,
                ),
                if (message != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    message!,
                    style: const TextStyle(
                      color: TekaColors.mutedForeground,
                      fontSize: 13,
                      height: 1.35,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
                if (actionLabel != null && onAction != null) ...[
                  const SizedBox(height: 20),
                  FilledButton(onPressed: onAction, child: Text(actionLabel!)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Friendly error state: icon + (already-localized) message + a Réessayer
/// button. The message must already be user-safe French (the providers map
/// Dio errors via `friendlyErrorMessage`/`extractDioErrorMessage`); this widget
/// never shows a raw exception.
class AppErrorState extends StatelessWidget {
  final String? message;
  final VoidCallback? onRetry;

  /// Label for the action button. Defaults to "Réessayer" for the common
  /// retry case; override (e.g. "Retour") when the action isn't a retry.
  final String? actionLabel;

  const AppErrorState({
    super.key,
    this.message,
    this.onRetry,
    this.actionLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: TekaColors.surface,
            border: Border.all(color: TekaColors.border),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.error_outline,
                  size: 42,
                  color: TekaColors.tekaRed,
                ),
                const SizedBox(height: 12),
                Text(
                  message ?? 'Une erreur est survenue. Veuillez réessayer.',
                  style: const TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 13,
                    height: 1.35,
                  ),
                  textAlign: TextAlign.center,
                ),
                if (onRetry != null) ...[
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: onRetry,
                    child: Text(actionLabel ?? 'Réessayer'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
