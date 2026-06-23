import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../providers/promotion_provider.dart';
import '../widgets/promotion_card.dart';

class PromotionsListScreen extends ConsumerWidget {
  const PromotionsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(sellerPromotionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text("Mes promotions"),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/promotions/create'),
        icon: const Icon(Icons.add),
        label: const Text("Creer une promotion"),
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(sellerPromotionsProvider.notifier).loadPromotions(),
        child: state.isLoading && state.promotions.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : state.error != null && state.promotions.isEmpty
                ? _buildError(context, ref)
                : state.promotions.isEmpty
                    ? _buildEmpty(context)
                    : _buildList(context, ref, state),
      ),
    );
  }

  Widget _buildList(
    BuildContext context,
    WidgetRef ref,
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
                ? () => _confirmCancel(context, ref, promotion.id)
                : null,
          );
        },
      ),
    );
  }

  Widget _buildEmpty(BuildContext context) {
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
              const Text(
                "Aucune promotion",
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                  color: TekaColors.foreground,
                ),
              ),
              const SizedBox(height: 8),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 48),
                child: Text(
                  "Creez votre premiere promotion pour augmenter vos ventes",
                  textAlign: TextAlign.center,
                  style: TextStyle(
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

  Widget _buildError(BuildContext context, WidgetRef ref) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                size: 48, color: TekaColors.destructive),
            const SizedBox(height: 12),
            const Text("Une erreur est survenue. Veuillez reessayer."),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () =>
                  ref.read(sellerPromotionsProvider.notifier).loadPromotions(),
              child: const Text("Reessayer"),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmCancel(
    BuildContext context,
    WidgetRef ref,
    String promotionId,
  ) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Annuler la promotion"),
        content: const Text("Etes-vous sur de vouloir annuler cette promotion ?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text("Annuler"),
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
                        ? "Annulee"
                        : "Une erreur est survenue. Veuillez reessayer."),
                  ),
                );
              }
            },
            child: const Text("Annuler la promotion"),
          ),
        ],
      ),
    );
  }
}
