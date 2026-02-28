import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/earnings_provider.dart';
import '../widgets/earning_tile.dart';
import '../widgets/payout_tile.dart';
import '../widgets/wallet_card.dart';

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
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(earningsProvider);

    // Keep tab controller in sync with state
    if (_tabController.index != state.selectedTab) {
      _tabController.index = state.selectedTab;
    }

    final wallet = state.wallet;
    final balanceCDF = wallet?.balanceCDFDisplay ?? 0;
    final canRequestPayout = balanceCDF >= 5000;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.earningsTitle),
      ),
      body: Column(
        children: [
          // Wallet cards
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: WalletCard(
                        label: l10n.earningsWalletBalance,
                        amountCDF: wallet?.balanceCDFDisplay ?? 0,
                        icon: Icons.account_balance_wallet_outlined,
                        color: TekaColors.tekaRed,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: WalletCard(
                        label: l10n.earningsTotalEarned,
                        amountCDF: wallet?.totalEarnedCDFDisplay ?? 0,
                        icon: Icons.trending_up,
                        color: TekaColors.success,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                WalletCard(
                  label: l10n.earningsTotalCommission,
                  amountCDF: wallet?.totalCommissionCDFDisplay ?? 0,
                  icon: Icons.percent,
                  color: TekaColors.warning,
                ),
                const SizedBox(height: 12),

                // Request payout button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed:
                        canRequestPayout
                            ? () => context.push('/earnings/request-payout')
                            : null,
                    icon: const Icon(Icons.send),
                    label: Text(l10n.earningsRequestPayout),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
                if (!canRequestPayout) ...[
                  const SizedBox(height: 4),
                  Text(
                    l10n.payoutMinimumBalance,
                    style: const TextStyle(
                      fontSize: 11,
                      color: TekaColors.mutedForeground,
                    ),
                  ),
                ],
                const SizedBox(height: 12),
              ],
            ),
          ),

          // Tab bar
          TabBar(
            controller: _tabController,
            labelColor: TekaColors.tekaRed,
            unselectedLabelColor: TekaColors.mutedForeground,
            indicatorColor: TekaColors.tekaRed,
            tabs: [
              Tab(text: l10n.earningsTabEarnings),
              Tab(text: l10n.earningsTabPayouts),
            ],
          ),

          // Tab content
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _EarningsTab(state: state),
                _PayoutsTab(state: state),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EarningsTab extends ConsumerWidget {
  final EarningsState state;

  const _EarningsTab({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

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
              Text(l10n.authGenericError),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(earningsProvider.notifier).loadEarnings(),
                child: Text(l10n.loadMore),
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
            Text(
              l10n.earningsNoEarnings,
              style: const TextStyle(color: TekaColors.mutedForeground),
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
    final l10n = AppLocalizations.of(context)!;

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
              Text(l10n.authGenericError),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(earningsProvider.notifier).loadPayouts(),
                child: Text(l10n.loadMore),
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
            Text(
              l10n.earningsNoPayouts,
              style: const TextStyle(color: TekaColors.mutedForeground),
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
