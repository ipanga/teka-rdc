import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/auth/auth_guard.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../cart/presentation/providers/cart_provider.dart';
import '../../../reviews/presentation/providers/reviews_provider.dart';
import '../../../reviews/presentation/widgets/review_stats_bar.dart';
import '../../../reviews/presentation/widgets/review_tile.dart';
import '../../../wishlist/presentation/widgets/wishlist_button.dart';
import '../../data/catalog_repository.dart';
import '../../data/models/product_model.dart';
import '../../data/recently_viewed_store.dart';
import '../providers/catalog_provider.dart';
import '../widgets/image_gallery.dart';
import '../widgets/product_card.dart';
import '../widgets/recently_viewed_section.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;

  const ProductDetailScreen({super.key, required this.productId});

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  bool _viewTracked = false;

  @override
  Widget build(BuildContext context) {
    final productId = widget.productId;
    final productAsync = ref.watch(productDetailProvider(productId));

    // Fire product_viewed once on first successful load (buyer-owned UI event,
    // parity with buyer-web). ids/price only — no PII.
    ref.listen(productDetailProvider(productId), (prev, next) {
      next.whenData((product) {
        if (_viewTracked) return;
        _viewTracked = true;
        // Record in the client-local recently-viewed history (Phase D).
        ref
            .read(recentlyViewedStoreProvider)
            .add(BrowseProductModel.fromDetail(product));
        const PosthogAnalytics().capture('product_viewed', properties: {
          'productId': product.id,
          if (product.category != null) 'categoryId': product.category!.id,
          'price_cdf': int.tryParse(product.priceCDF) ?? 0,
          if (product.seller.id != null) 'sellerId': product.seller.id!,
        });
      });
    });

    return Scaffold(
      appBar: AppBar(
        title: Text("Details du produit"),
        actions: [
          WishlistButton(productId: productId),
        ],
      ),
      body: productAsync.when(
        data: (product) {
          final title = product.title;
          final description = product.description ?? '';
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
                                          product.breadcrumb[i].name,
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
                              if (product.unitsSold > 0)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(
                                    "${product.unitsSold} ${(product.unitsSold) == 1 ? 'vendu' : 'vendus'}",
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
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
                                          ? "Neuf"
                                          : "Occasion",
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
                                      "Rupture de stock",
                                      style: const TextStyle(
                                        color: TekaColors.destructive,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    )
                                  else if (product.isLowStock)
                                    Text(
                                      "Plus que ${product.quantity} en stock",
                                      style: const TextStyle(
                                        color: TekaColors.warning,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    )
                                  else
                                    Text(
                                      '${product.quantity} ${"Details du produit".toLowerCase()}',
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
                                      '${"Vendeur"}: ',
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
                                // Direct buyer↔seller messaging retired
                                // 2026-05-17 — buyers contact Teka RDC
                                // support instead. The seller name + city
                                // shown above are the entire seller card now.
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 10),
                                  decoration: BoxDecoration(
                                    color: TekaColors.surface,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                      color: TekaColors.border,
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(
                                        Icons.support_agent_outlined,
                                        size: 18,
                                        color: TekaColors.tekaRed,
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          "Pour toute question, contactez le support Teka RDC.",
                                          style: const TextStyle(
                                            color: TekaColors.foreground,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 16),
                                const Divider(color: TekaColors.border),
                                const SizedBox(height: 12),
                              ],

                              // Description
                              if (description.isNotEmpty) ...[
                                Text(
                                  "Details du produit",
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
                                  "Caracteristiques",
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

                              // Related products (same category + price)
                              const SizedBox(height: 24),
                              _RelatedSection(productId: productId),

                              // Recently viewed (client-local), excl. current
                              const SizedBox(height: 24),
                              RecentlyViewedSection(excludeId: productId),
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
                            // Cart requires an account — gate guests to login.
                            if (!ensureAuthenticated(context, ref)) return;
                            try {
                              await ref
                                  .read(cartProvider.notifier)
                                  .addItem(product.id);
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text("Ajouter au panier"),
                                    backgroundColor: TekaColors.success,
                                    duration: const Duration(seconds: 2),
                                  ),
                                );
                              }
                            } catch (_) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text("Une erreur est survenue. Veuillez reessayer."),
                                    backgroundColor: TekaColors.destructive,
                                    duration: const Duration(seconds: 2),
                                  ),
                                );
                              }
                            }
                          },
                    icon: const Icon(Icons.shopping_cart_outlined),
                    label: Text("Ajouter au panier"),
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
                  "Une erreur est survenue. Veuillez reessayer.",
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
                  child: Text("Reessayer"),
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
              '${"Avis"} (${stats.totalReviews})',
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
                  "Voir tous les avis",
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
                  "Voir tous les avis",
                  style: const TextStyle(color: TekaColors.tekaRed),
                ),
              ),
            ),
        ] else ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              "Aucun avis pour le moment",
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

class _RelatedSection extends ConsumerStatefulWidget {
  final String productId;
  const _RelatedSection({required this.productId});

  @override
  ConsumerState<_RelatedSection> createState() => _RelatedSectionState();
}

class _RelatedSectionState extends ConsumerState<_RelatedSection> {
  List<BrowseProductModel>? _items;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await ref
          .read(catalogRepositoryProvider)
          .getRelatedProducts(widget.productId);
      if (mounted) setState(() => _items = items);
    } catch (_) {
      if (mounted) setState(() => _items = const []);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    if (items == null || items.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "Produits similaires",
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 260,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, i) => SizedBox(
              width: 150,
              child: ProductCard(product: items[i]),
            ),
          ),
        ),
      ],
    );
  }
}
