import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../providers/reviews_provider.dart';
import '../widgets/review_form_dialog.dart';
import '../widgets/review_stats_bar.dart';
import '../widgets/review_tile.dart';

class ProductReviewsScreen extends ConsumerWidget {
  final String productId;

  const ProductReviewsScreen({super.key, required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final reviewsState = ref.watch(reviewsProvider(productId));
    final authState = ref.watch(authProvider);
    final currentUserId = authState.user?['id'] as String?;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.reviewsTitle),
      ),
      floatingActionButton: reviewsState.canReviewResult?.canReview == true
          ? FloatingActionButton.extended(
              onPressed: () => _showReviewForm(context, ref),
              backgroundColor: TekaColors.tekaRed,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.rate_review_outlined),
              label: Text(l10n.writeReview),
            )
          : null,
      body: reviewsState.isLoading
          ? const Center(
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : reviewsState.error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.error_outline,
                          size: 48,
                          color: TekaColors.mutedForeground,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          reviewsState.error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: TekaColors.mutedForeground,
                          ),
                        ),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () => ref
                              .read(reviewsProvider(productId).notifier)
                              .loadReviews(),
                          style: FilledButton.styleFrom(
                            backgroundColor: TekaColors.tekaRed,
                          ),
                          child: Text(l10n.backToHome),
                        ),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  color: TekaColors.tekaRed,
                  onRefresh: () async {
                    ref.invalidate(reviewsProvider(productId));
                  },
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Stats
                      if (reviewsState.stats != null) ...[
                        ReviewStatsBar(stats: reviewsState.stats!),
                        const SizedBox(height: 20),
                      ],

                      // My review
                      if (reviewsState.myReview != null) ...[
                        Text(
                          l10n.yourRating,
                          style:
                              Theme.of(context).textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: TekaColors.foreground,
                                  ),
                        ),
                        const SizedBox(height: 8),
                        ReviewTile(
                          review: reviewsState.myReview!,
                          isOwn: true,
                          onDelete: () =>
                              _confirmDelete(context, ref, reviewsState.myReview!.id),
                        ),
                        const SizedBox(height: 20),
                      ],

                      // All reviews
                      if (reviewsState.reviews.isNotEmpty) ...[
                        Text(
                          '${l10n.reviewsTitle} (${reviewsState.stats?.totalReviews ?? reviewsState.reviews.length})',
                          style:
                              Theme.of(context).textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: TekaColors.foreground,
                                  ),
                        ),
                        const SizedBox(height: 12),
                        ...reviewsState.reviews.map(
                          (review) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: ReviewTile(
                              review: review,
                              isOwn: review.buyerId == currentUserId,
                              onDelete: review.buyerId == currentUserId
                                  ? () => _confirmDelete(
                                      context, ref, review.id)
                                  : null,
                            ),
                          ),
                        ),

                        // Pagination
                        if (reviewsState.hasNextPage)
                          Center(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              child: TextButton(
                                onPressed: () => ref
                                    .read(
                                        reviewsProvider(productId).notifier)
                                    .loadReviews(
                                        page: reviewsState.page + 1),
                                child: Text(
                                  l10n.productLoadMore,
                                  style: const TextStyle(
                                    color: TekaColors.tekaRed,
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ] else ...[
                        const SizedBox(height: 40),
                        Center(
                          child: Column(
                            children: [
                              const Icon(
                                Icons.rate_review_outlined,
                                size: 64,
                                color: TekaColors.mutedForeground,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                l10n.noReviews,
                                style: const TextStyle(
                                  color: TekaColors.mutedForeground,
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
    );
  }

  void _showReviewForm(BuildContext context, WidgetRef ref) {
    final reviewsState = ref.read(reviewsProvider(productId));
    final orderId =
        reviewsState.canReviewResult?.orderId ?? '';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => ReviewFormDialog(
        productId: productId,
        orderId: orderId,
      ),
    ).then((submitted) {
      if (submitted == true && context.mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.reviewSubmitted),
            backgroundColor: TekaColors.success,
          ),
        );
      }
    });
  }

  void _confirmDelete(BuildContext context, WidgetRef ref, String reviewId) {
    final l10n = AppLocalizations.of(context)!;

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.deleteReview),
        content: Text(l10n.confirmDeleteReview),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(l10n.filterReset),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              final success = await ref
                  .read(reviewsProvider(productId).notifier)
                  .deleteReview(reviewId);
              if (success && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(l10n.reviewDeleted),
                    backgroundColor: TekaColors.success,
                  ),
                );
              }
            },
            style: FilledButton.styleFrom(
              backgroundColor: TekaColors.destructive,
            ),
            child: Text(l10n.deleteReview),
          ),
        ],
      ),
    );
  }
}
