import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/providers/seller_refresh_provider.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../../home/presentation/widgets/dashboard_rows.dart';
import '../providers/earnings_provider.dart';
import '../widgets/earning_tile.dart';
import '../widgets/payout_tile.dart';
import '../widgets/wallet_card.dart';

/// The API's minimum (`MIN_PAYOUT_AMOUNT_CDF`, `docs/payouts.md`), mirrored
/// here only to explain a disabled button before the request is sent. The
/// server re-checks under a row lock; a 400 from it is shown verbatim.
const minPayoutCdf = 5000;

/// Seller earnings + payouts (Seller UX PR E, 2026-09-08).
///
/// Financial semantics are the API's (`docs/payouts.md`): the wallet's
/// available / pending / gross / commission figures and the earnings
/// states are shown, never recomputed; the only client-side reading is
/// « an open payout exists » from the payouts list, which also feeds the
/// « virement en cours » amount.
class EarningsScreen extends ConsumerStatefulWidget {
  const EarningsScreen({super.key, this.initialTab = 0});

  /// 0 = Gains, 1 = Virements. Set from `/earnings?tab=payouts` (payout
  /// notifications). The shell keeps this widget alive across navigations,
  /// so a change is honoured in `didUpdateWidget`, not only in `initState`.
  final int initialTab;

  @override
  ConsumerState<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends ConsumerState<EarningsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(_onTabChanged);
    // Load payouts up-front (not just on the payouts tab) so the request
    // button can detect an existing open payout.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(earningsProvider.notifier).loadPayouts();
      if (widget.initialTab != 0) {
        ref.read(earningsProvider.notifier).selectTab(widget.initialTab);
      }
    });
  }

  @override
  void didUpdateWidget(covariant EarningsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialTab != oldWidget.initialTab) {
      ref.read(earningsProvider.notifier).selectTab(widget.initialTab);
    }
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    super.dispose();
  }

  void _onTabChanged() {
    if (_tabController.indexIsChanging) return;
    ref.read(earningsProvider.notifier).selectTab(_tabController.index);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(earningsProvider);
    // A payout push (foreground) or an app resume invalidates wallet + payouts.
    ref.listen<int>(
      sellerRefreshProvider.select((r) => r.earnings),
      (prev, next) {
        if (prev != null && next != prev) {
          ref.read(earningsProvider.notifier).refresh();
        }
      },
    );

    // Keep tab controller in sync with state
    if (_tabController.index != state.selectedTab) {
      _tabController.index = state.selectedTab;
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Revenus'),
        actions: [
          IconButton(
            tooltip: 'Actualiser',
            icon: const Icon(Icons.refresh),
            onPressed: state.isLoading
                ? null
                : () => ref.read(earningsProvider.notifier).refresh(),
          ),
        ],
      ),
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: NestedScrollView(
          headerSliverBuilder: (context, innerBoxIsScrolled) => [
            SliverToBoxAdapter(child: _WalletSummary(state: state)),
            SliverPersistentHeader(
              pinned: true,
              delegate: _TabBarHeader(
                TabBar(
                  controller: _tabController,
                  labelColor: TekaColors.tekaRed,
                  unselectedLabelColor: TekaColors.mutedForeground,
                  indicatorColor: TekaColors.tekaRed,
                  tabs: const [
                    Tab(text: 'Gains'),
                    Tab(text: 'Virements'),
                  ],
                ),
              ),
            ),
          ],
          body: TabBarView(
            controller: _tabController,
            children: [
              _EarningsTab(state: state),
              _PayoutsTab(state: state, tabController: _tabController),
            ],
          ),
        ),
      ),
    );
  }
}

class _WalletSummary extends ConsumerWidget {
  final EarningsState state;

  const _WalletSummary({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wallet = state.wallet;
    final open = state.openPayout;

    final Widget summary;
    if (wallet != null) {
      summary = WalletSummaryCard(
        wallet: wallet,
        openPayoutAmount: open?.amountCDFDisplay,
      );
    } else if (state.walletError != null) {
      // A failed wallet request is an error, not « 0 FC ».
      summary = _WalletError(
        message: state.walletError!,
        onRetry: () => ref.read(earningsProvider.notifier).loadWallet(),
      );
    } else {
      summary = const WalletSummarySkeleton();
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(
          TekaSpacing.md, TekaSpacing.md, TekaSpacing.md, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          summary,
          if (wallet != null) ...[
            const SizedBox(height: TekaSpacing.sm),
            PayoutRequestAction(
              balanceCdf: wallet.balanceCDFDisplay,
              openPayoutId: open?.id,
            ),
          ],
          const SizedBox(height: TekaSpacing.sm),
        ],
      ),
    );
  }
}

/// The wallet request failed and nothing is cached: say so, with a retry,
/// instead of rendering « 0 FC » as if the seller had no money.
class _WalletError extends StatelessWidget {
  const _WalletError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
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
          Row(children: [
            const Icon(Icons.cloud_off,
                size: 20, color: TekaColors.warningForeground),
            const SizedBox(width: TekaSpacing.xs),
            Expanded(
              child: Text('Solde indisponible',
                  style: theme.titleSmall
                      ?.copyWith(color: TekaColors.warningForeground)),
            ),
          ]),
          const SizedBox(height: TekaSpacing.xs),
          Text(message,
              style:
                  theme.bodySmall?.copyWith(color: TekaColors.mutedForeground)),
          const SizedBox(height: TekaSpacing.xs),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton(
              onPressed: onRetry,
              style:
                  OutlinedButton.styleFrom(minimumSize: const Size(48, 40)),
              child: const Text('Réessayer'),
            ),
          ),
        ],
      ),
    );
  }
}

class _TabBarHeader extends SliverPersistentHeaderDelegate {
  final TabBar tabBar;

  const _TabBarHeader(this.tabBar);

  @override
  double get minExtent => tabBar.preferredSize.height;

  @override
  double get maxExtent => tabBar.preferredSize.height;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Material(color: TekaColors.background, child: tabBar);
  }

  @override
  bool shouldRebuild(_TabBarHeader oldDelegate) => oldDelegate.tabBar != tabBar;
}

/// Empty-state copy for the two lists — contextual, and honest about what
/// makes each list fill up.
({String title, String message}) earningsEmptyCopy() => (
      title: 'Aucun gain pour le moment',
      message:
          'Vos gains apparaîtront ici après la livraison de vos commandes, commission Teka déduite.',
    );

({String title, String message}) payoutsEmptyCopy() => (
      title: 'Aucun virement pour le moment',
      message:
          'Vous pourrez demander un virement dès que votre solde disponible atteint ${formatFcNumber(minPayoutCdf)} FC.',
    );

class _EarningsTab extends ConsumerWidget {
  final EarningsState state;

  const _EarningsTab({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (state.isLoading && state.earnings.isEmpty) {
      return const SellerListLoading(label: 'Chargement de vos gains');
    }

    if (state.error != null && state.earnings.isEmpty) {
      return _TopAligned(
        child: SellerListMessage(
          icon: Icons.cloud_off,
          title: 'Impossible de charger vos gains',
          message: state.error!,
          actionLabel: 'Réessayer',
          onAction: () => ref.read(earningsProvider.notifier).loadEarnings(),
        ),
      );
    }

    if (state.earnings.isEmpty) {
      final copy = earningsEmptyCopy();
      return _TopAligned(
        child: SellerListMessage(
          icon: Icons.monetization_on_outlined,
          title: copy.title,
          message: copy.message,
          actionLabel: 'Voir mes commandes',
          onAction: () => context.go('/orders'),
        ),
      );
    }

    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification is ScrollEndNotification &&
            notification.metrics.extentAfter < 200 &&
            state.hasMoreEarnings &&
            !state.isLoadingMore) {
          ref.read(earningsProvider.notifier).loadMoreEarnings();
        }
        return false;
      },
      child: ListView.builder(
        padding: const EdgeInsets.all(TekaSpacing.md),
        itemCount: state.earnings.length + (state.isLoadingMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == state.earnings.length) return const _LoadMoreFooter();
          return EarningTile(earning: state.earnings[index]);
        },
      ),
    );
  }
}

class _PayoutsTab extends ConsumerWidget {
  final EarningsState state;
  final TabController tabController;

  const _PayoutsTab({required this.state, required this.tabController});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (state.isLoading && state.payouts.isEmpty) {
      return const SellerListLoading(label: 'Chargement de vos virements');
    }

    if (state.error != null && state.payouts.isEmpty) {
      return _TopAligned(
        child: SellerListMessage(
          icon: Icons.cloud_off,
          title: 'Impossible de charger vos virements',
          message: state.error!,
          actionLabel: 'Réessayer',
          onAction: () => ref.read(earningsProvider.notifier).loadPayouts(),
        ),
      );
    }

    if (state.payouts.isEmpty) {
      final copy = payoutsEmptyCopy();
      final eligible = (state.wallet?.balanceCDFDisplay ?? 0) >= minPayoutCdf;
      return _TopAligned(
        child: SellerListMessage(
          icon: Icons.send_outlined,
          title: copy.title,
          message: copy.message,
          actionLabel: eligible ? 'Demander un virement' : 'Voir mes gains',
          onAction: eligible
              ? () => context.push('/earnings/request-payout')
              : () => tabController.animateTo(0),
        ),
      );
    }

    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification is ScrollEndNotification &&
            notification.metrics.extentAfter < 200 &&
            state.hasMorePayouts &&
            !state.isLoadingMore) {
          ref.read(earningsProvider.notifier).loadMorePayouts();
        }
        return false;
      },
      child: ListView.builder(
        padding: const EdgeInsets.all(TekaSpacing.md),
        itemCount: state.payouts.length + (state.isLoadingMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == state.payouts.length) return const _LoadMoreFooter();
          return PayoutTile(payout: state.payouts[index]);
        },
      ),
    );
  }
}

/// Empty / error content of a tab. The tab body sits under a summary that
/// scrolls away, and `SellerListState` centres within the whole scroll
/// extent — which put the CTA below the fold on a phone. Anchoring the
/// message at the top keeps the call to action visible without scrolling.
class _TopAligned extends StatelessWidget {
  const _TopAligned({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => SellerListState(
        child: Align(alignment: Alignment.topCenter, child: child),
      );
}

/// Static placeholder while the next page loads (no spinner).
class _LoadMoreFooter extends StatelessWidget {
  const _LoadMoreFooter();

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Chargement de la suite',
        child: const ExcludeSemantics(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: TekaSpacing.sm),
            child: Center(child: SkeletonBlock(width: 160, height: 14)),
          ),
        ),
      );
}

/// The one seller action of this screen. Prominent only when the API would
/// accept the request (balance ≥ minimum, no open payout); otherwise the
/// reason is stated in words and, for an open payout, a link to it.
class PayoutRequestAction extends StatelessWidget {
  final int balanceCdf;

  /// Id of the open payout blocking a new request, if any.
  final String? openPayoutId;

  const PayoutRequestAction({
    super.key,
    required this.balanceCdf,
    this.openPayoutId,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final belowMin = balanceCdf < minPayoutCdf;
    final blocked = openPayoutId != null;
    final canRequest = !belowMin && !blocked;
    final hint = blocked
        ? 'Une demande de virement est déjà en cours. Vous pourrez en faire une nouvelle une fois celle-ci traitée.'
        : belowMin
            ? 'Solde minimum pour un virement : ${formatFcNumber(minPayoutCdf)} FC.'
            : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ElevatedButton.icon(
          onPressed: canRequest
              ? () => context.push('/earnings/request-payout')
              : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: TekaColors.tekaRed,
            foregroundColor: Colors.white,
            disabledBackgroundColor: TekaColors.muted,
            disabledForegroundColor: TekaColors.mutedForeground,
            minimumSize: const Size.fromHeight(48),
          ),
          icon: const Icon(Icons.send_outlined, size: 18),
          label: const Text('Demander un virement'),
        ),
        if (hint != null) ...[
          const SizedBox(height: TekaSpacing.xs),
          Text(hint,
              style:
                  theme.bodySmall?.copyWith(color: TekaColors.mutedForeground)),
        ],
        if (blocked)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () =>
                  context.push('/earnings/payouts/$openPayoutId'),
              style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(48, 40),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap),
              child: const Text('Voir le virement en cours'),
            ),
          ),
      ],
    );
  }
}
