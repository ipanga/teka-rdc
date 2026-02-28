import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/promotion_provider.dart';
import '../widgets/promotion_card.dart';

class PromotionsListScreen extends ConsumerWidget {
  const PromotionsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(sellerPromotionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.promotionMyPromotions),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/promotions/create'),
        icon: const Icon(Icons.add),
        label: Text(l10n.promotionCreate),
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(sellerPromotionsProvider.notifier).loadPromotions(),
        child: state.isLoading && state.promotions.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : state.error != null && state.promotions.isEmpty
                ? _buildError(context, ref, l10n)
                : state.promotions.isEmpty
                    ? _buildEmpty(context, l10n)
                    : _buildList(context, ref, l10n, state),
      ),
    );
  }

  Widget _buildList(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
    PromotionsListState state,
  ) {
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification is ScrollEndNotification &&
            notification.metrics.extentAfter < 200 &&
            state.hasMore &&
            !state.isLoadingMore) {
          ref.read(sellerPromotionsProvider.notifier).loadMore();
        }
        return false;
      },
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: state.promotions.length + (state.isLoadingMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == state.promotions.length) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            );
          }

          final promotion = state.promotions[index];
          return PromotionCard(
            promotion: promotion,
            onCancel: promotion.canCancel
                ? () => _confirmCancel(context, ref, l10n, promotion.id)
                : null,
          );
        },
      ),
    );
  }

  Widget _buildEmpty(BuildContext context, AppLocalizations l10n) {
    return ListView(
      children: [
        const SizedBox(height: 100),
        Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.campaign_outlined,
                  size: 64, color: TekaColors.mutedForeground),
              const SizedBox(height: 16),
              Text(
                l10n.promotionNoPromotions,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                  color: TekaColors.foreground,
                ),
              ),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 48),
                child: Text(
                  l10n.promotionCreateFirst,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    color: TekaColors.mutedForeground,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildError(
      BuildContext context, WidgetRef ref, AppLocalizations l10n) {
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
                  ref.read(sellerPromotionsProvider.notifier).loadPromotions(),
              child: Text(l10n.loadMore),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmCancel(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
    String promotionId,
  ) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.promotionCancel),
        content: Text(l10n.promotionConfirmCancel),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: TekaColors.destructive,
            ),
            onPressed: () async {
              Navigator.of(ctx).pop();
              final success = await ref
                  .read(sellerPromotionsProvider.notifier)
                  .cancelPromotion(promotionId);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(success
                        ? l10n.promotionCancelled
                        : l10n.authGenericError),
                  ),
                );
              }
            },
            child: Text(l10n.promotionCancel),
          ),
        ],
      ),
    );
  }
}
