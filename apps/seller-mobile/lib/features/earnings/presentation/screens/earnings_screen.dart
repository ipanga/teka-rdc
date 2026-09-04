import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../providers/earnings_provider.dart';
import '../widgets/earning_tile.dart';
import '../widgets/payout_tile.dart';
import '../widgets/wallet_card.dart';

const _minPayoutCdf = 5000;
const _pendingPayoutStatuses = ['REQUESTED', 'APPROVED', 'PROCESSING'];

class EarningsScreen extends ConsumerStatefulWidget {
  const EarningsScreen({super.key});

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
    // button can detect an existing pending payout.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(earningsProvider.notifier).loadPayouts();
    });
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

    // Keep tab controller in sync with state
    if (_tabController.index != state.selectedTab) {
      _tabController.index = state.selectedTab;
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text("Revenus"),
      ),
      body: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) => [
          SliverToBoxAdapter(
            child: _WalletSummary(state: state),
          ),
          SliverPersistentHeader(
            pinned: true,
            delegate: _TabBarHeader(
              TabBar(
                controller: _tabController,
                labelColor: TekaColors.tekaRed,
                unselectedLabelColor: TekaColors.mutedForeground,
                indicatorColor: TekaColors.tekaRed,
                tabs: const [
                  Tab(text: "Gains"),
                  Tab(text: "Virements"),
                ],
              ),
            ),
          ),
        ],
        body: TabBarView(
          controller: _tabController,
          children: [
            _EarningsTab(state: state),
            _PayoutsTab(state: state),
          ],
        ),
      ),
    );
  }
}

class _WalletSummary extends StatelessWidget {
  final EarningsState state;

  const _WalletSummary({required this.state});

  @override
  Widget build(BuildContext context) {
    final wallet = state.wallet;
    final expanded = MediaQuery.textScalerOf(context).scale(1) > 1.3;
    final cards = [
      WalletCard(
        label: "Solde disponible",
        amountCDF: wallet?.balanceCDFDisplay ?? 0,
        icon: Icons.account_balance_wallet_outlined,
        color: TekaColors.tekaRed,
      ),
      WalletCard(
        label: "Revenus totaux",
        amountCDF: wallet?.totalEarnedCDFDisplay ?? 0,
        icon: Icons.trending_up,
        color: TekaColors.success,
      ),
      WalletCard(
        label: "Commission prélevée",
        amountCDF: wallet?.totalCommissionCDFDisplay ?? 0,
        icon: Icons.percent,
        color: TekaColors.warning,
      ),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              if (expanded || constraints.maxWidth < 340) {
                return Column(
                  children: [
                    for (var i = 0; i < cards.length; i++) ...[
                      cards[i],
                      if (i < cards.length - 1) const SizedBox(height: 8),
                    ],
                  ],
                );
              }
              final width = (constraints.maxWidth - 12) / 2;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final card in cards) SizedBox(width: width, child: card)
                ],
              );
            },
          ),
          if ((wallet?.pendingCDFDisplay ?? 0) > 0) ...[
            const SizedBox(height: 8),
            Text(
              "+ ${formatFcNumber(wallet!.pendingCDFDisplay)} FC en attente "
              "(fenêtre de retour de 2 jours)",
              style: const TextStyle(
                fontSize: 12,
                color: TekaColors.mutedForeground,
              ),
            ),
          ],
          const SizedBox(height: 12),
          _PayoutRequestAction(
            balanceCdf: wallet?.balanceCDFDisplay ?? 0,
            hasPendingPayout: state.payouts.any(
                (p) => _pendingPayoutStatuses.contains(p.status.toUpperCase())),
            walletLoaded: wallet != null,
          ),
          const SizedBox(height: 12),
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

class _EarningsTab extends ConsumerWidget {
  final EarningsState state;

  const _EarningsTab({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (state.isLoading && state.earnings.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && state.earnings.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline,
                  size: 48, color: TekaColors.destructive),
              const SizedBox(height: 12),
              const Text("Une erreur est survenue. Veuillez réessayer."),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(earningsProvider.notifier).loadEarnings(),
                child: const Text("Réessayer"),
              ),
            ],
          ),
        ),
      );
    }

    if (state.earnings.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.monetization_on_outlined,
                size: 48, color: TekaColors.mutedForeground),
            const SizedBox(height: 12),
            const Text(
              "Aucun revenu pour le moment",
              style: TextStyle(color: TekaColors.mutedForeground),
            ),
          ],
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
        padding: const EdgeInsets.all(16),
        itemCount: state.earnings.length + (state.isLoadingMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == state.earnings.length) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            );
          }
          return EarningTile(earning: state.earnings[index]);
        },
      ),
    );
  }
}

class _PayoutsTab extends ConsumerWidget {
  final EarningsState state;

  const _PayoutsTab({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (state.isLoading && state.payouts.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && state.payouts.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline,
                  size: 48, color: TekaColors.destructive),
              const SizedBox(height: 12),
              const Text("Une erreur est survenue. Veuillez réessayer."),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(earningsProvider.notifier).loadPayouts(),
                child: const Text("Réessayer"),
              ),
            ],
          ),
        ),
      );
    }

    if (state.payouts.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.send_outlined,
                size: 48, color: TekaColors.mutedForeground),
            const SizedBox(height: 12),
            const Text(
              "Aucun virement pour le moment",
              style: TextStyle(color: TekaColors.mutedForeground),
            ),
          ],
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
        padding: const EdgeInsets.all(16),
        itemCount: state.payouts.length + (state.isLoadingMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == state.payouts.length) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            );
          }
          return PayoutTile(payout: state.payouts[index]);
        },
      ),
    );
  }
}

/// Request-payout button + min-balance / pending guards.
class _PayoutRequestAction extends StatelessWidget {
  final int balanceCdf;
  final bool hasPendingPayout;
  final bool walletLoaded;

  const _PayoutRequestAction({
    required this.balanceCdf,
    required this.hasPendingPayout,
    required this.walletLoaded,
  });

  @override
  Widget build(BuildContext context) {
    final belowMin = balanceCdf < _minPayoutCdf;
    final canRequest = walletLoaded && !belowMin && !hasPendingPayout;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ElevatedButton(
          onPressed: canRequest
              ? () => context.push('/earnings/request-payout')
              : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: TekaColors.tekaRed,
            foregroundColor: Colors.white,
            disabledBackgroundColor: TekaColors.muted,
          ),
          child: const Text("Demander un virement"),
        ),
        if (walletLoaded && belowMin) ...[
          const SizedBox(height: 6),
          const Text(
            "Solde minimum: 5 000 FC",
            style: TextStyle(
              fontSize: 12,
              color: TekaColors.mutedForeground,
            ),
          ),
        ] else if (hasPendingPayout) ...[
          const SizedBox(height: 6),
          const Text(
            "Vous avez déjà une demande de virement en cours. Vous pourrez en faire une nouvelle une fois celle-ci traitée.",
            style: TextStyle(
              fontSize: 12,
              color: TekaColors.mutedForeground,
            ),
          ),
        ],
      ],
    );
  }
}
