import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../../../core/widgets/seller_status_badge.dart';
import '../../../home/presentation/widgets/dashboard_rows.dart';
import '../../data/earnings_repository.dart';
import '../../data/models/earning_model.dart';
import '../payout_status.dart';
import '../widgets/wallet_card.dart' show HeroAmount;

/// One payout, loaded by id through the OWNER-scoped endpoint. The id comes
/// from a push tap, a feed item or a link — never trusted: the API answers
/// 404 for a payout that is not the signed-in seller's, and that message is
/// shown verbatim (Rule 15: French 4xx messages pass through).
final payoutDetailProvider =
    FutureProvider.autoDispose.family<PayoutModel, String>((ref, id) {
  return ref.read(earningsRepositoryProvider).getPayout(id);
});

/// Payout detail (Seller UX PR E): amount, status in words, the full
/// destination (this is where the seller checks the number), then what
/// actually happened and when — from the API's timestamps only. The admin
/// who acted is never shown (the API row carries ids, the app ignores them).
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
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: async.when(
          loading: () => const PayoutDetailSkeleton(),
          error: (e, _) => SellerListState(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SellerListMessage(
                  icon: Icons.cloud_off,
                  title: 'Virement indisponible',
                  message: friendlyErrorMessage(e),
                  actionLabel: 'Réessayer',
                  onAction: () =>
                      ref.invalidate(payoutDetailProvider(payoutId)),
                ),
                TextButton(
                  onPressed: () => context.go('/earnings?tab=payouts'),
                  child: const Text('Voir tous mes virements'),
                ),
              ],
            ),
          ),
          data: (payout) => _PayoutBody(payout: payout),
        ),
      ),
    );
  }
}

class _PayoutBody extends StatelessWidget {
  const _PayoutBody({required this.payout});

  final PayoutModel payout;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final ui = PayoutStatusUi.of(payout.status);
    final dateFormat = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    final status = payout.status.toUpperCase();
    final reference = payout.externalReference?.trim() ?? '';
    final events = payoutEvents(payout);

    return ListView(
      padding: const EdgeInsets.all(TekaSpacing.md),
      children: [
        _Card(children: [
          Text('Montant du virement',
              style:
                  theme.labelLarge?.copyWith(color: TekaColors.mutedForeground)),
          const SizedBox(height: TekaSpacing.xxs),
          HeroAmount(payout.amountCDFDisplay),
          const SizedBox(height: TekaSpacing.xs),
          Align(
            alignment: Alignment.centerLeft,
            child: SellerStatusBadge(
                label: ui.label, icon: ui.icon, color: ui.color),
          ),
          if (ui.hint.isNotEmpty) ...[
            const SizedBox(height: TekaSpacing.xs),
            Text(ui.hint,
                style: theme.bodyMedium
                    ?.copyWith(color: TekaColors.mutedForeground)),
          ],
        ]),
        const SizedBox(height: TekaSpacing.sm),
        _Card(children: [
          Text('Destination', style: theme.titleSmall),
          const SizedBox(height: TekaSpacing.xs),
          _Row('Opérateur', payoutMethodLabel(payout.payoutMethod)),
          _Row('Numéro de réception', payout.payoutPhone),
          if (status == 'COMPLETED' && reference.isNotEmpty)
            _Row('Référence de paiement', reference, selectable: true),
          if (status == 'REJECTED')
            _Row(
              'Raison',
              (payout.rejectionReason ?? '').trim().isEmpty
                  ? 'Non précisée'
                  : payout.rejectionReason!.trim(),
            ),
        ]),
        const SizedBox(height: TekaSpacing.sm),
        _Card(children: [
          Text('Historique', style: theme.titleSmall),
          const SizedBox(height: TekaSpacing.xs),
          for (var i = 0; i < events.length; i++)
            _EventRow(
              event: events[i],
              date: dateFormat.format(events[i].at.toLocal()),
              last: i == events.length - 1,
            ),
        ]),
        const SizedBox(height: TekaSpacing.xl),
        OutlinedButton.icon(
          onPressed: () => context.go('/earnings?tab=payouts'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          icon: const Icon(Icons.list_alt),
          label: const Text('Voir tous mes virements'),
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(TekaSpacing.md),
        decoration: BoxDecoration(
          color: TekaColors.background,
          borderRadius: TekaRadius.lgAll,
          border: Border.all(color: TekaColors.border),
        ),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.selectable = false});

  final String label;
  final String value;
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final style = theme.bodyMedium?.copyWith(color: TekaColors.foreground);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: TekaSpacing.xxs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style:
                  theme.bodySmall?.copyWith(color: TekaColors.mutedForeground)),
          selectable
              ? SelectableText(value, style: style)
              : Text(value, style: style),
        ],
      ),
    );
  }
}

/// One dated fact of the history: a dot in the event's tone, the label and
/// the date on one baseline (the date never breaks).
class _EventRow extends StatelessWidget {
  const _EventRow(
      {required this.event, required this.date, required this.last});
  final PayoutEvent event;
  final String date;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : TekaSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Container(
              width: 10,
              height: 10,
              decoration:
                  BoxDecoration(color: event.color, shape: BoxShape.circle),
            ),
          ),
          const SizedBox(width: TekaSpacing.xs),
          Expanded(
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              spacing: TekaSpacing.sm,
              runSpacing: 2,
              children: [
                Text(event.label,
                    style: theme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
                Text(date,
                    softWrap: false,
                    style: theme.bodySmall
                        ?.copyWith(color: TekaColors.mutedForeground)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Static placeholder while the payout loads (no spinner).
class PayoutDetailSkeleton extends StatelessWidget {
  const PayoutDetailSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    Widget card(List<Widget> children) => Container(
          width: double.infinity,
          padding: const EdgeInsets.all(TekaSpacing.md),
          decoration: BoxDecoration(
            color: TekaColors.background,
            borderRadius: TekaRadius.lgAll,
            border: Border.all(color: TekaColors.border),
          ),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start, children: children),
        );
    return Semantics(
      label: 'Chargement du virement',
      liveRegion: true,
      child: ExcludeSemantics(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.all(TekaSpacing.md),
          children: [
            card(const [
              SkeletonBlock(width: 130, height: 14),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: 180, height: 32),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: 120, height: 26, pill: true),
            ]),
            const SizedBox(height: TekaSpacing.sm),
            card(const [
              SkeletonBlock(width: 90, height: 16),
              SizedBox(height: TekaSpacing.sm),
              SkeletonBlock(width: 160, height: 14),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: 140, height: 14),
            ]),
            const SizedBox(height: TekaSpacing.sm),
            card(const [
              SkeletonBlock(width: 90, height: 16),
              SizedBox(height: TekaSpacing.sm),
              SkeletonBlock(width: 220, height: 14),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: 200, height: 14),
            ]),
          ],
        ),
      ),
    );
  }
}
