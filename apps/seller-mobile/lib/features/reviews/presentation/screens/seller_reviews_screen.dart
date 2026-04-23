import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/review_model.dart';
import '../providers/reviews_provider.dart';
import '../widgets/review_tile.dart';
import '../widgets/star_rating.dart';

class SellerReviewsScreen extends ConsumerWidget {
  const SellerReviewsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(sellerReviewsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.reviewsTitle),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(sellerReviewsProvider.notifier).refresh(),
        child: state.isLoadingProducts && state.products.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : state.products.isEmpty
                ? _buildEmptyProducts(context, l10n)
                : _buildContent(context, ref, l10n, state),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
    SellerReviewsState state,
  ) {
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification is ScrollEndNotification &&
            notification.metrics.extentAfter < 200 &&
            state.hasMore &&
            !state.isLoadingMore) {
          ref.read(sellerReviewsProvider.notifier).loadMoreReviews();
        }
        return false;
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Product selector
          _buildProductSelector(context, ref, l10n, state),
          const SizedBox(height: 16),

          // Stats section
          if (state.stats != null) ...[
            _buildStatsCard(context, l10n, state.stats!),
            const SizedBox(height: 16),
          ],

          // Reviews header
          Text(
            l10n.recentReviews,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 12),

          // Reviews list
          if (state.isLoadingReviews && state.reviews.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: CircularProgressIndicator(),
              ),
            )
          else if (state.error != null && state.reviews.isEmpty)
            _buildError(context, ref, l10n)
          else if (state.reviews.isEmpty)
            _buildEmptyReviews(context, l10n)
          else ...[
            ...state.reviews.map((review) => ReviewTile(review: review)),
            if (state.isLoadingMore)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _buildProductSelector(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
    SellerReviewsState state,
  ) {
    final locale = l10n.localeName;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        border: Border.all(color: TekaColors.border),
        borderRadius: BorderRadius.circular(12),
        color: TekaColors.background,
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: state.selectedProductId,
          isExpanded: true,
          hint: Text(l10n.filterByProduct),
          icon: const Icon(Icons.keyboard_arrow_down),
          items: state.products.map((product) {
            return DropdownMenuItem<String>(
              value: product.id,
              child: Text(
                product.getLocalizedTitle(locale),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            );
          }).toList(),
          onChanged: (value) {
            if (value != null) {
              ref.read(sellerReviewsProvider.notifier).selectProduct(value);
            }
          },
        ),
      ),
    );
  }

  Widget _buildStatsCard(
    BuildContext context,
    AppLocalizations l10n,
    ReviewStatsModel stats,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: TekaColors.muted,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: TekaColors.border),
      ),
      child: Row(
        children: [
          // Average rating display
          Column(
            children: [
              Text(
                stats.avgRating.toStringAsFixed(1),
                style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.bold,
                  color: TekaColors.foreground,
                ),
              ),
              StarRatingDouble(rating: stats.avgRating, size: 18),
              const SizedBox(height: 4),
              Text(
                '${stats.totalReviews} ${l10n.totalReviews.toLowerCase()}',
                style: const TextStyle(
                  fontSize: 12,
                  color: TekaColors.mutedForeground,
                ),
              ),
            ],
          ),
          const SizedBox(width: 20),
          // Distribution bars
          Expanded(
            child: Column(
              children: List.generate(5, (index) {
                final starNum = 5 - index;
                final count = stats.distribution[starNum] ?? 0;
                final percentage = stats.totalReviews > 0
                    ? count / stats.totalReviews
                    : 0.0;

                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 14,
                        child: Text(
                          '$starNum',
                          style: const TextStyle(
                            fontSize: 12,
                            color: TekaColors.mutedForeground,
                          ),
                        ),
                      ),
                      const Icon(
                        Icons.star_rounded,
                        size: 12,
                        color: Colors.amber,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: percentage,
                            backgroundColor: TekaColors.border,
                            valueColor: const AlwaysStoppedAnimation<Color>(
                                Colors.amber),
                            minHeight: 8,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 28,
                        child: Text(
                          '$count',
                          style: const TextStyle(
                            fontSize: 12,
                            color: TekaColors.mutedForeground,
                          ),
                          textAlign: TextAlign.end,
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyProducts(BuildContext context, AppLocalizations l10n) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.inventory_2_outlined,
              size: 48, color: TekaColors.mutedForeground),
          const SizedBox(height: 12),
          Text(
            l10n.noProducts,
            style: const TextStyle(color: TekaColors.mutedForeground),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyReviews(BuildContext context, AppLocalizations l10n) {
    return Container(
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          const Icon(Icons.rate_review_outlined,
              size: 48, color: TekaColors.mutedForeground),
          const SizedBox(height: 12),
          Text(
            l10n.noReviews,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: TekaColors.foreground,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            l10n.noReviewsDesc,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 13,
              color: TekaColors.mutedForeground,
            ),
          ),
        ],
      ),
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
                  ref.read(sellerReviewsProvider.notifier).loadReviews(),
              child: Text(l10n.loadMore),
            ),
          ],
        ),
      ),
    );
  }
}
