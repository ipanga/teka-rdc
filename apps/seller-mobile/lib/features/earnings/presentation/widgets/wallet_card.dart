import 'package:flutter/material.dart';
import 'package:seller_mobile/core/utils/price_formatter.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/seller_status_badge.dart';
import '../../data/models/earning_model.dart';

/// The seller's money, in the order the seller asks about it (Seller UX PR E):
/// what can be withdrawn now (hero), what is on its way to the balance, what
/// is committed to a payout, then the lifetime figures behind it. Every
/// number is the API's — the wallet endpoint and the open payout row —
/// nothing is recomputed here (`docs/payouts.md`).
///
/// Three equal cards used to share one weight, and « Revenus totaux » was
/// the *gross* of delivered sales (before commission) — a seller read it as
/// money owed to them. It is now named for what it is.
class WalletSummaryCard extends StatelessWidget {
  const WalletSummaryCard({
    super.key,
    required this.wallet,
    this.openPayoutAmount,
  });

  final SellerWallet wallet;

  /// Amount of the seller's open payout (REQUESTED / APPROVED / PROCESSING),
  /// from the payouts list — shown as « Virement en cours ».
  final int? openPayoutAmount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final available = wallet.balanceCDFDisplay;
    final pending = wallet.pendingCDFDisplay;
    final gross = wallet.totalEarnedCDFDisplay;
    final commission = wallet.totalCommissionCDFDisplay;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(TekaSpacing.md),
      decoration: BoxDecoration(
        color: TekaColors.background,
        borderRadius: TekaRadius.lgAll,
        border: Border.all(color: TekaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Solde disponible',
              style: theme.labelLarge
                  ?.copyWith(color: TekaColors.mutedForeground)),
          const SizedBox(height: TekaSpacing.xxs),
          Semantics(
            label: 'Solde disponible, ${formatFcNumber(available)} francs',
            child: ExcludeSemantics(
              child: HeroAmount(available),
            ),
          ),
          const SizedBox(height: TekaSpacing.xxs),
          Text('Montant que vous pouvez demander en virement.',
              style: theme.bodySmall
                  ?.copyWith(color: TekaColors.mutedForeground)),
          if (pending > 0 || (openPayoutAmount ?? 0) > 0) ...[
            const SizedBox(height: TekaSpacing.sm),
            Wrap(
              spacing: TekaSpacing.xs,
              runSpacing: TekaSpacing.xs,
              children: [
                if (pending > 0)
                  SellerStatusBadge(
                    label: '${formatFcNumber(pending)} FC en attente',
                    icon: Icons.schedule,
                    color: TekaColors.warningForeground,
                  ),
                if ((openPayoutAmount ?? 0) > 0)
                  SellerStatusBadge(
                    label:
                        '${formatFcNumber(openPayoutAmount!)} FC · virement en cours',
                    icon: Icons.sync,
                    color: TekaColors.infoForeground,
                  ),
              ],
            ),
            if (pending > 0) ...[
              const SizedBox(height: TekaSpacing.xxs),
              Text(
                'Les gains en attente rejoignent votre solde après la fenêtre de retour de 2 jours.',
                style: theme.bodySmall
                    ?.copyWith(color: TekaColors.mutedForeground),
              ),
            ],
          ],
          const Padding(
            padding: EdgeInsets.symmetric(vertical: TekaSpacing.sm),
            child: Divider(height: 1),
          ),
          WalletLine(
            label: 'Ventes livrées (montant brut)',
            amount: gross,
          ),
          const SizedBox(height: TekaSpacing.xs),
          WalletLine(
            label: 'Commission Teka prélevée',
            amount: commission,
            negative: true,
          ),
          const SizedBox(height: TekaSpacing.xs),
          WalletLine(
            label: 'Vos gains nets (depuis le début)',
            amount: gross - commission,
            strong: true,
          ),
        ],
      ),
    );
  }
}

/// One « label … amount » line of the summary. Label left, amount right on
/// one baseline when they fit; on a narrow width or at large text the
/// amount drops to its own line rather than breaking inside the number.
class WalletLine extends StatelessWidget {
  const WalletLine({
    super.key,
    required this.label,
    required this.amount,
    this.negative = false,
    this.strong = false,
  });

  final String label;
  final int amount;
  final bool negative;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final text = '${negative ? '− ' : ''}${formatFcNumber(amount)} FC';
    return Wrap(
      alignment: WrapAlignment.spaceBetween,
      spacing: TekaSpacing.sm,
      runSpacing: 2,
      children: [
        Text(label,
            style: theme.bodyMedium?.copyWith(
                color:
                    strong ? TekaColors.foreground : TekaColors.mutedForeground,
                fontWeight: strong ? FontWeight.w600 : null)),
        Text(text,
            softWrap: false,
            style: theme.bodyMedium?.copyWith(
                color: TekaColors.foreground,
                fontWeight: strong ? FontWeight.w700 : FontWeight.w500)),
      ],
    );
  }
}

/// Static placeholder for the summary while the wallet loads (no spinner).
class WalletSummarySkeleton extends StatelessWidget {
  const WalletSummarySkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    Widget block(double w, double h) => Container(
          width: w,
          height: h,
          decoration: BoxDecoration(
              color: TekaColors.muted, borderRadius: TekaRadius.smAll),
        );
    return Semantics(
      label: 'Chargement de votre solde',
      liveRegion: true,
      child: ExcludeSemantics(
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(TekaSpacing.md),
          decoration: BoxDecoration(
            color: TekaColors.background,
            borderRadius: TekaRadius.lgAll,
            border: Border.all(color: TekaColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              block(110, 14),
              const SizedBox(height: TekaSpacing.xs),
              block(180, 32),
              const SizedBox(height: TekaSpacing.md),
              block(220, 14),
              const SizedBox(height: TekaSpacing.xs),
              block(200, 14),
              const SizedBox(height: TekaSpacing.xs),
              block(240, 14),
            ],
          ),
        ),
      ),
    );
  }
}

/// Hero money figure: one line always, scaled down rather than broken when
/// the width or the text scale would not fit it.
class HeroAmount extends StatelessWidget {
  const HeroAmount(this.amount, {super.key});
  final int amount;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            '${formatFcNumber(amount)} FC',
            softWrap: false,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w700, color: TekaColors.foreground),
          ),
        ),
      );
}
