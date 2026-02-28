import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../cart/presentation/providers/cart_provider.dart';
import '../../../reviews/presentation/providers/reviews_provider.dart';
import '../../../reviews/presentation/widgets/review_stats_bar.dart';
import '../../../reviews/presentation/widgets/review_tile.dart';
import '../../../wishlist/presentation/widgets/wishlist_button.dart';
import '../providers/catalog_provider.dart';
import '../widgets/image_gallery.dart';

class ProductDetailScreen extends ConsumerWidget {
  final String productId;

  const ProductDetailScreen({super.key, required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final productAsync = ref.watch(productDetailProvider(productId));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.productDetail),
        actions: [
          WishlistButton(productId: productId),
        ],
      ),
      body: productAsync.when(
        data: (product) {
          final title = product.localizedTitle(locale);
          final description = product.localizedDescription(locale);
          final price = formatCDF(product.priceCDF);
          final priceUSD = product.priceUSD != null
              ? formatUSD(product.priceUSD!)
              : null;
          final isNew = product.condition.toUpperCase() == 'NEW' ||
              product.condition.toUpperCase() == 'NEUF';

          return Column(
            children: [
              Expanded(
                child: RefreshIndicator(
                  color: TekaColors.tekaRed,
                  onRefresh: () async {
                    ref.invalidate(productDetailProvider(productId));
                    ref.invalidate(reviewsProvider(productId));
                    await ref.read(productDetailProvider(productId).future);
                  },
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Image gallery
                        ImageGallery(images: product.images),

                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Breadcrumb
                              if (product.breadcrumb.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Wrap(
                                    children: [
                                      for (var i = 0;
                                          i < product.breadcrumb.length;
                                          i++) ...[
                                        if (i > 0)
                                          const Padding(
                                            padding: EdgeInsets.symmetric(
                                                horizontal: 4),
                                            child: Text(
                                              '>',
                                              style: TextStyle(
                                                color:
                                                    TekaColors.mutedForeground,
                                                fontSize: 12,
                                              ),
                                            ),
                                          ),
                                        Text(
                                          product.breadcrumb[i]
                                              .localizedName(locale),
                                          style: const TextStyle(
                                            color: TekaColors.mutedForeground,
                                            fontSize: 12,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),

                              // Title
                              Text(
                                title,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(
                                      fontWeight: FontWeight.bold,
                                      color: TekaColors.foreground,
                                    ),
                              ),
                              const SizedBox(height: 8),

                              // Price
                              Text(
                                price,
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineSmall
                                    ?.copyWith(
                                      fontWeight: FontWeight.bold,
                                      color: TekaColors.tekaRed,
                                    ),
                              ),
                              if (priceUSD != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(
                                    priceUSD,
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(
                                          color: TekaColors.mutedForeground,
                                        ),
                                  ),
                                ),
                              const SizedBox(height: 12),

                              // Condition badge + stock
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: isNew
                                          ? TekaColors.success
                                          : TekaColors.warning,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      isNew
                                          ? l10n.productConditionNew
                                          : l10n.productConditionUsed,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  if (product.isOutOfStock)
                                    Text(
                                      l10n.productOutOfStock,
                                      style: const TextStyle(
                                        color: TekaColors.destructive,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    )
                                  else if (product.isLowStock)
                                    Text(
                                      l10n.productLowStock,
                                      style: const TextStyle(
                                        color: TekaColors.warning,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    )
                                  else
                                    Text(
                                      '${product.quantity} ${l10n.productDetail.toLowerCase()}',
                                      style: const TextStyle(
                                        color: TekaColors.success,
                                        fontSize: 13,
                                      ),
                                    ),
                                ],
                              ),

                              const SizedBox(height: 16),
                              const Divider(color: TekaColors.border),
                              const SizedBox(height: 12),

                              // Seller info
                              if (product.seller.businessName != null &&
                                  product.seller.businessName!.isNotEmpty) ...[
                                Row(
                                  children: [
                                    const Icon(
                                      Icons.storefront_outlined,
                                      size: 20,
                                      color: TekaColors.mutedForeground,
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      '${l10n.productSeller}: ',
                                      style: const TextStyle(
                                        color: TekaColors.mutedForeground,
                                        fontSize: 14,
                                      ),
                                    ),
                                    Expanded(
                                      child: Text(
                                        product.seller.businessName!,
                                        style: const TextStyle(
                                          color: TekaColors.foreground,
                                          fontWeight: FontWeight.w600,
                                          fontSize: 14,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                // Contact seller button
                                if (product.seller.id != null &&
                                    product.seller.id!.isNotEmpty)
                                  SizedBox(
                                    width: double.infinity,
                                    child: OutlinedButton.icon(
                                      onPressed: () {
                                        context.push(
                                          '/messages/new',
                                          extra: {
                                            'sellerId': product.seller.id,
                                          },
                                        );
                                      },
                                      icon: const Icon(
                                        Icons.chat_bubble_outline,
                                        size: 18,
                                      ),
                                      label: Text(l10n.contactSeller),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: TekaColors.tekaRed,
                                        side: const BorderSide(
                                          color: TekaColors.tekaRed,
                                        ),
                                        padding: const EdgeInsets.symmetric(
                                            vertical: 10),
                                      ),
                                    ),
                                  ),
                                const SizedBox(height: 16),
                                const Divider(color: TekaColors.border),
                                const SizedBox(height: 12),
                              ],

                              // Description
                              if (description.isNotEmpty) ...[
                                Text(
                                  l10n.productDetail,
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleSmall
                                      ?.copyWith(
                                        fontWeight: FontWeight.bold,
                                      ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  description,
                                  style: const TextStyle(
                                    color: TekaColors.foreground,
                                    fontSize: 14,
                                    height: 1.5,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                const Divider(color: TekaColors.border),
                                const SizedBox(height: 12),
                              ],

                              // Specifications
                              if (product.specifications.isNotEmpty) ...[
                                Text(
                                  l10n.specifications,
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleSmall
                                      ?.copyWith(
                                        fontWeight: FontWeight.bold,
                                      ),
                                ),
                                const SizedBox(height: 8),
                                Table(
                                  columnWidths: const {
                                    0: FlexColumnWidth(2),
                                    1: FlexColumnWidth(3),
                                  },
                                  border: TableBorder(
                                    horizontalInside: BorderSide(
                                      color: TekaColors.border,
                                      width: 0.5,
                                    ),
                                  ),
                                  children: product.specifications
                                      .map(
                                        (spec) => TableRow(
                                          children: [
                                            Padding(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      vertical: 8),
                                              child: Text(
                                                spec.name,
                                                style: const TextStyle(
                                                  color: TekaColors
                                                      .mutedForeground,
                                                  fontSize: 13,
                                                ),
                                              ),
                                            ),
                                            Padding(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      vertical: 8),
                                              child: Text(
                                                spec.value,
                                                style: const TextStyle(
                                                  color: TekaColors.foreground,
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w500,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      )
                                      .toList(),
                                ),
                                const SizedBox(height: 16),
                                const Divider(color: TekaColors.border),
                                const SizedBox(height: 12),
                              ],

                              // Reviews section
                              _ReviewsSection(productId: productId),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Bottom bar with Add to Cart button
              Container(
                padding: EdgeInsets.only(
                  left: 16,
                  right: 16,
                  top: 12,
                  bottom: 12 + MediaQuery.of(context).viewPadding.bottom,
                ),
                decoration: BoxDecoration(
                  color: TekaColors.background,
                  border: const Border(
                    top: BorderSide(color: TekaColors.border),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 8,
                      offset: const Offset(0, -2),
                    ),
                  ],
                ),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: product.isOutOfStock
                        ? null
                        : () async {
                            try {
                              await ref
                                  .read(cartProvider.notifier)
                                  .addItem(product.id);
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(l10n.addToCart),
                                    backgroundColor: TekaColors.success,
                                    duration: const Duration(seconds: 2),
                                  ),
                                );
                              }
                            } catch (_) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(l10n.authGenericError),
                                    backgroundColor: TekaColors.destructive,
                                    duration: const Duration(seconds: 2),
                                  ),
                                );
                              }
                            }
                          },
                    icon: const Icon(Icons.shopping_cart_outlined),
                    label: Text(l10n.addToCart),
                    style: FilledButton.styleFrom(
                      backgroundColor: TekaColors.tekaRed,
                      disabledBackgroundColor: TekaColors.muted,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      textStyle: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
        loading: () => const Center(
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        error: (error, _) => Center(
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
                  l10n.authGenericError,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: TekaColors.mutedForeground),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () {
                    ref.invalidate(productDetailProvider(productId));
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: TekaColors.tekaRed,
                  ),
                  child: Text(l10n.backToHome),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Shows review stats + first 3 reviews + "See all" link.
class _ReviewsSection extends ConsumerWidget {
  final String productId;

  const _ReviewsSection({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final reviewsState = ref.watch(reviewsProvider(productId));

    // Show loading only briefly
    if (reviewsState.isLoading && reviewsState.stats == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }

    // Don't show section at all if there was an error and no stats
    if (reviewsState.stats == null) return const SizedBox.shrink();

    final stats = reviewsState.stats!;
    final previewReviews = reviewsState.reviews.take(3).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section header
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '${l10n.reviewsTitle} (${stats.totalReviews})',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: TekaColors.foreground,
                  ),
            ),
            if (stats.totalReviews > 0)
              TextButton(
                onPressed: () =>
                    context.push('/products/$productId/reviews'),
                child: Text(
                  l10n.seeAllReviews,
                  style: const TextStyle(
                    color: TekaColors.tekaRed,
                    fontSize: 13,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),

        // Stats bar
        if (stats.totalReviews > 0) ...[
          ReviewStatsBar(stats: stats),
          const SizedBox(height: 16),

          // Preview reviews
          ...previewReviews.map(
            (review) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ReviewTile(review: review),
            ),
          ),

          // See all button
          if (stats.totalReviews > 3)
            Center(
              child: TextButton(
                onPressed: () =>
                    context.push('/products/$productId/reviews'),
                child: Text(
                  l10n.seeAllReviews,
                  style: const TextStyle(color: TekaColors.tekaRed),
                ),
              ),
            ),
        ] else ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              l10n.noReviews,
              style: const TextStyle(
                color: TekaColors.mutedForeground,
                fontSize: 13,
              ),
            ),
          ),
        ],

        const SizedBox(height: 16),
      ],
    );
  }
}
