import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_states.dart';
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
    final reviewsState = ref.watch(reviewsProvider(productId));
    final authState = ref.watch(authProvider);
    final currentUserId = authState.user?['id'] as String?;

    return Scaffold(
      appBar: AppBar(
        title: Text("Avis"),
      ),
      floatingActionButton: reviewsState.canReviewResult?.canReview == true
          ? FloatingActionButton.extended(
              onPressed: () => _showReviewForm(context, ref),
              backgroundColor: TekaColors.tekaRed,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.rate_review_outlined),
              label: Text("Ecrire un avis"),
            )
          : null,
      body: reviewsState.isLoading
          ? const Center(
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : reviewsState.error != null
              ? AppErrorState(
                  message: reviewsState.error!,
                  onRetry: () => ref
                      .read(reviewsProvider(productId).notifier)
                      .loadReviews(),
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
                          "Votre note",
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
                          onDelete: () => _confirmDelete(
                              context, ref, reviewsState.myReview!.id),
                        ),
                        const SizedBox(height: 20),
                      ],

                      // All reviews
                      if (reviewsState.reviews.isNotEmpty) ...[
                        Text(
                          'Avis (${reviewsState.stats?.totalReviews ?? reviewsState.reviews.length})',
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
                                  ? () =>
                                      _confirmDelete(context, ref, review.id)
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
                                    .read(reviewsProvider(productId).notifier)
                                    .loadReviews(page: reviewsState.page + 1),
                                child: Text(
                                  "Charger plus",
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
                                "Aucun avis pour le moment",
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
    final orderId = reviewsState.canReviewResult?.orderId ?? '';

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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Avis soumis avec succes"),
            backgroundColor: TekaColors.success,
          ),
        );
      }
    });
  }

  void _confirmDelete(BuildContext context, WidgetRef ref, String reviewId) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text("Supprimer l'avis"),
        content: Text("Voulez-vous supprimer votre avis ?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text("Reinitialiser"),
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
                    content: Text("Avis supprime"),
                    backgroundColor: TekaColors.success,
                  ),
                );
              }
            },
            style: FilledButton.styleFrom(
              backgroundColor: TekaColors.destructive,
            ),
            child: Text("Supprimer l'avis"),
          ),
        ],
      ),
    );
  }
}
