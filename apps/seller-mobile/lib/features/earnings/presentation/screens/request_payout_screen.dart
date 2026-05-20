import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';

/// Payout request flow is temporarily disabled. The screen still resolves
/// (so any in-app deep links and bookmarks don't 404), but it shows a
/// "temporairement indisponible" notice instead of the operator+phone form.
/// The backend (POST /v1/sellers/payouts + the past-payouts list) is
/// untouched — re-enabling later is a UI-only change.
class RequestPayoutScreen extends ConsumerWidget {
  const RequestPayoutScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.payoutFormTitle),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.info_outline,
                size: 48,
                color: TekaColors.mutedForeground,
              ),
              const SizedBox(height: 16),
              Text(
                l10n.payoutTemporarilyUnavailable,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  color: TekaColors.mutedForeground,
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => context.pop(),
                child: Text(l10n.commonBack),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
