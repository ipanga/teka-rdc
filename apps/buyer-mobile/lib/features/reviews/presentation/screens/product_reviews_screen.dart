import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/models/review_model.dart';
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
    final myReview = reviewsState.myReview;
    // The buyer's own review has its own « Votre avis » block above the list;
    // the API's list contains it too, so it is dropped here (it rendered
    // twice — pre-scale audit, 2026-09-06). buyer-web applies the same filter.
    final others = myReview == null
        ? reviewsState.reviews
        : reviewsState.reviews.where((r) => r.id != myReview.id).toList();
    // A failed load only takes over the screen when there is nothing to show;
    // with reviews already loaded (e.g. « Charger plus » failed) the list
    // stays and the failure is shown inline.
    final blockingError = reviewsState.error != null &&
        reviewsState.reviews.isEmpty &&
        reviewsState.stats == null;

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
              label: const Text('Écrire un avis'),
            )
          : null,
      body: reviewsState.isLoading
          ? const Center(
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : blockingError
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
                      if (myReview != null) ...[
                        Text(
                          'Votre avis',
                          style:
                              Theme.of(context).textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: TekaColors.foreground,
                                  ),
                        ),
                        const SizedBox(height: 8),
                        ReviewTile(
                          review: myReview,
                          isOwn: true,
                          onEdit: () => _showReviewForm(
                            context,
                            ref,
                            existing: myReview,
                          ),
                          onDelete: () =>
                              _confirmDelete(context, ref, myReview.id),
                        ),
                        const SizedBox(height: 20),
                      ],

                      if (reviewsState.error != null)
                        _InlineLoadError(
                          message: reviewsState.error!,
                          onRetry: () => ref
                              .read(reviewsProvider(productId).notifier)
                              .loadReviews(),
                        ),

                      // Everyone else's reviews
                      if (others.isNotEmpty) ...[
                        Text(
                          'Tous les avis (${reviewsState.stats?.totalReviews ?? reviewsState.reviews.length})',
                          style:
                              Theme.of(context).textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: TekaColors.foreground,
                                  ),
                        ),
                        const SizedBox(height: 12),
                        ...others.map(
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
                      ] else if (myReview == null) ...[
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

  /// Opens the review form. With [existing] the form edits that review in
  /// place (prefilled); without it, a new review is created.
  void _showReviewForm(
    BuildContext context,
    WidgetRef ref, {
    ReviewModel? existing,
  }) {
    final reviewsState = ref.read(reviewsProvider(productId));
    // When editing there is no canReview orderId — the API reports
    // ALREADY_REVIEWED once a review exists — so fall back to the review's own
    // order. PATCH does not send it; it is only here for the create path.
    final orderId =
        existing?.orderId ?? reviewsState.canReviewResult?.orderId ?? '';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => ReviewFormDialog(
        productId: productId,
        orderId: orderId,
        existingReview: existing,
      ),
    ).then((submitted) {
      if (submitted == true && context.mounted) {
        showAppSnackbar(
          context,
          message: existing != null ? 'Avis modifié' : 'Avis publié. Merci !',
          tone: AppSnackbarTone.success,
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
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              final notifier = ref.read(reviewsProvider(productId).notifier);
              final success = await notifier.deleteReview(reviewId);
              if (!context.mounted) return;
              if (success) {
                showAppSnackbar(
                  context,
                  message: 'Avis supprimé',
                  tone: AppSnackbarTone.success,
                );
              } else {
                // A8: a failed delete used to vanish silently (and the
                // error replaced the list). The review is still there.
                final message = ref.read(reviewsProvider(productId)).mutationError ??
                    "Impossible de supprimer l'avis.";
                notifier.clearMutationError();
                showAppSnackbar(
                  context,
                  message: message,
                  tone: AppSnackbarTone.error,
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

/// Load failure shown ABOVE an already-loaded list (never instead of it).
class _InlineLoadError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _InlineLoadError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TekaColors.destructive.withValues(alpha: 0.06),
        border: Border.all(color: TekaColors.destructive.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, size: 18, color: TekaColors.destructive),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 13, color: TekaColors.foreground),
            ),
          ),
          TextButton(
            onPressed: onRetry,
            child: const Text('Réessayer'),
          ),
        ],
      ),
    );
  }
}
