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
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 72, color: TekaColors.mutedForeground),
            const SizedBox(height: 16),
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: TekaColors.mutedForeground,
                    fontWeight: FontWeight.w600,
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
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 24),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
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

  const AppErrorState({super.key, this.message, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                size: 48, color: TekaColors.mutedForeground),
            const SizedBox(height: 12),
            Text(
              message ?? 'Une erreur est survenue. Veuillez reessayer.',
              style: const TextStyle(
                color: TekaColors.mutedForeground,
                fontSize: 13,
              ),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              FilledButton(onPressed: onRetry, child: const Text('Reessayer')),
            ],
          ],
        ),
      ),
    );
  }
}
