import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../data/earnings_repository.dart';
import '../../data/models/earning_model.dart';
import '../payout_status.dart';

/// One payout, loaded by id through the OWNER-scoped endpoint. The id comes
/// from a push tap, a feed item or a link — never trusted: the API answers
/// 404 for a payout that is not the signed-in seller's, and that message is
/// shown verbatim (Rule 15: French 4xx messages pass through).
final payoutDetailProvider =
    FutureProvider.autoDispose.family<PayoutModel, String>((ref, id) {
  return ref.read(earningsRepositoryProvider).getPayout(id);
});

class PayoutDetailScreen extends ConsumerWidget {
  const PayoutDetailScreen({super.key, required this.payoutId});

  final String payoutId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(payoutDetailProvider(payoutId));

    return Scaffold(
      appBar: AppBar(
        // Reached from a push (cold start: nothing beneath) or from the feed
        // (stack beneath) — AdaptiveLeading keeps an exit in both cases.
        leading: const AdaptiveLeading(),
        title: const Text('Détail du virement'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorBody(
          message: friendlyErrorMessage(e),
          onRetry: () => ref.invalidate(payoutDetailProvider(payoutId)),
        ),
        data: (payout) => _PayoutBody(payout: payout),
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 48),
        const Icon(Icons.error_outline, size: 48, color: TekaColors.destructive),
        const SizedBox(height: 12),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        OutlinedButton(onPressed: onRetry, child: const Text('Réessayer')),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => context.go('/earnings?tab=payouts'),
          child: const Text('Voir tous mes virements'),
        ),
      ],
    );
  }
}

class _PayoutBody extends StatelessWidget {
  const _PayoutBody({required this.payout});

  final PayoutModel payout;

  @override
  Widget build(BuildContext context) {
    final ui = PayoutStatusUi.of(payout.status);
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    final status = payout.status.toUpperCase();
    final processed = payout.processedAt != null
        ? DateTime.tryParse(payout.processedAt!)
        : null;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: TekaColors.background,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: TekaColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${formatFcNumber(payout.amountCDFDisplay)} FC',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: ui.color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  ui.label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: ui.color,
                  ),
                ),
              ),
              if (ui.hint.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  ui.hint,
                  style: const TextStyle(
                    fontSize: 13,
                    color: TekaColors.mutedForeground,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        _Row('Destination',
            '${payoutMethodLabel(payout.payoutMethod)} · ${payout.payoutPhone}'),
        _Row('Demandé le', dateFormat.format(payout.requestedAtDate)),
        if (status == 'COMPLETED' && processed != null)
          _Row('Payé le', dateFormat.format(processed)),
        if (status == 'COMPLETED' &&
            payout.externalReference != null &&
            payout.externalReference!.isNotEmpty)
          _Row('Référence de paiement', payout.externalReference!),
        if (status == 'REJECTED')
          _Row(
            'Raison',
            (payout.rejectionReason ?? '').isEmpty
                ? 'Non précisée'
                : payout.rejectionReason!,
          ),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: () => context.go('/earnings?tab=payouts'),
          icon: const Icon(Icons.list_alt),
          label: const Text('Voir tous mes virements'),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: TekaColors.mutedForeground,
            ),
          ),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontSize: 14)),
        ],
      ),
    );
  }
}
