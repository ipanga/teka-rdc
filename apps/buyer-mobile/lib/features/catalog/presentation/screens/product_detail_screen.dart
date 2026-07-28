import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:share_plus/share_plus.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/auth/auth_guard.dart';
import '../../../../core/deep_link/web_links.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../../core/widgets/commerce_header.dart';
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
import '../../../../core/constants/stock.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  /// How the product was addressed in the route — a UUID, a 6-char shortCode
  /// or a slug. `GET /v1/browse/products/:identifier` resolves all three.
  ///
  /// It is deliberately NOT called `productId`: only `/browse/products` accepts
  /// a non-UUID. Reviews, wishlist and related are `ParseUUIDPipe`, so they
  /// must be given the *resolved* `product.id` instead. Passing this value to
  /// them is what produced "Validation failed (uuid is expected)" when the PDP
  /// was opened from Order Detail (which links by shortCode).
  final String identifier;

  const ProductDetailScreen({super.key, required this.identifier});

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  bool _viewTracked = false;

  /// Anchors the iPad/macOS share popover. Without an origin rect `Share.share`
  /// throws on those form factors, which is one of the ways this action could
  /// look like it "does nothing".
  final GlobalKey _shareButtonKey = GlobalKey();

  /// Share the product's canonical web URL — opens the app via App/Universal
  /// Links when the recipient has it installed, else the website.
  ///
  /// Every failure path used to return silently; each one now tells the user
  /// something and reports the technical detail to Sentry.
  Future<void> _shareProduct(ProductDetailModel product) async {
    final String? url;
    try {
      url = productWebUrl(product);
    } catch (e, stack) {
      // productWebUrl reads FlavorConfig.instance, which throws a StateError
      // if initialize() never ran.
      _reportShareFailure(e, stack, product);
      _showShareError();
      return;
    }

    if (url == null) {
      _reportShareFailure(
        StateError('productWebUrl returned null (no slug/shortCode)'),
        StackTrace.current,
        product,
      );
      _showShareError();
      return;
    }

    const PosthogAnalytics().capture('product_shared', properties: {
      'productId': product.id,
    });

    try {
      await Share.share(
        '${product.title}\n$url',
        subject: product.title,
        sharePositionOrigin: _shareOrigin(),
      );
    } catch (e, stack) {
      _reportShareFailure(e, stack, product);
      _showShareError();
    }
  }

  Rect? _shareOrigin() {
    final box =
        _shareButtonKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return null;
    return box.localToGlobal(Offset.zero) & box.size;
  }

  void _showShareError() {
    if (!mounted) return;
    showAppSnackbar(
      context,
      message: 'Impossible de partager ce produit pour le moment.',
      tone: AppSnackbarTone.error,
    );
  }

  void _reportShareFailure(
    Object error,
    StackTrace? stack,
    ProductDetailModel product,
  ) {
    // No-op when Sentry isn't initialised (dev/test).
    Sentry.captureException(
      error,
      stackTrace: stack,
      withScope: (scope) {
        scope.level = SentryLevel.error;
        scope.setTag('action', 'product_share');
        scope.setTag('productId', product.id);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final identifier = widget.identifier;
    final productAsync = ref.watch(productDetailProvider(identifier));

    // Fire product_viewed once on first successful load (buyer-owned UI event,
    // parity with buyer-web). ids/price only — no PII.
    ref.listen(productDetailProvider(identifier), (prev, next) {
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
          'price_cdf': int.tryParse(product.effectivePriceCDF) ?? 0,
          if (product.hasDiscount) 'discount_percent': product.discountPct,
          if (product.seller.id != null) 'sellerId': product.seller.id!,
        });
      });
    });

    return Scaffold(
      appBar: const CommerceAppBar(
        searchLabel: 'Rechercher dans Teka...',
      ),
      body: productAsync.when(
        data: (product) {
          final title = product.title;
          final description = product.description ?? '';
          // A spec with no label or no value would render as a half-empty row.
          final specs =
              product.specifications.where((s) => s.isRenderable).toList();
          final hasDiscount = product.hasDiscount;
          final price = formatCDF(product.effectivePriceCDF);
          final priceUSD =
              product.priceUSD != null ? formatUSD(product.priceUSD!) : null;

          return Column(
            children: [
              Expanded(
                child: RefreshIndicator(
                  color: TekaColors.tekaRed,
                  onRefresh: () async {
                    ref.invalidate(productDetailProvider(identifier));
                    ref.invalidate(reviewsProvider(product.id));
                    await ref.read(productDetailProvider(identifier).future);
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

                              // The title owns the full summary width. Product
                              // actions sit on the secondary rating row so a
                              // long French name never wraps around controls.
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
                              const SizedBox(height: 6),

                              // Uses the exact same reviewsProvider instance as
                              // the detailed section below, so no client-side
                              // recalculation or duplicate request is created.
                              Row(
                                children: [
                                  Expanded(
                                    child: Align(
                                      alignment: Alignment.centerLeft,
                                      child: _PdpRatingSummary(
                                        productId: product.id,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  _PdpActionSurface(
                                    child: WishlistButton(
                                      // Wishlist routes require the resolved
                                      // UUID, never the route slug/shortCode.
                                      productId: product.id,
                                      size: 20,
                                      inactiveColor: TekaColors.foreground,
                                      padding: EdgeInsets.zero,
                                      constraints:
                                          const BoxConstraints.tightFor(
                                        width: 44,
                                        height: 44,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  _PdpActionSurface(
                                    child: IconButton(
                                      key: _shareButtonKey,
                                      onPressed: () => _shareProduct(product),
                                      tooltip: 'Partager ce produit',
                                      padding: EdgeInsets.zero,
                                      constraints:
                                          const BoxConstraints.tightFor(
                                        width: 44,
                                        height: 44,
                                      ),
                                      icon: const Icon(
                                        Icons.ios_share_outlined,
                                        size: 20,
                                        color: TekaColors.foreground,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),

                              // Price — effective price prominent; when on
                              // promo, show the original struck through, a −X%
                              // badge, and the savings.
                              Wrap(
                                crossAxisAlignment: WrapCrossAlignment.center,
                                spacing: 10,
                                runSpacing: 6,
                                children: [
                                  Text(
                                    price,
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineSmall
                                        ?.copyWith(
                                          fontWeight: FontWeight.bold,
                                          color: TekaColors.foreground,
                                        ),
                                  ),
                                  if (hasDiscount) ...[
                                    Text(
                                      formatCDF(product.priceCDF),
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium
                                          ?.copyWith(
                                            color: TekaColors.mutedForeground,
                                            decoration:
                                                TextDecoration.lineThrough,
                                          ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: TekaColors.tekaRed,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        "-${product.discountPct}%",
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 12,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              if (hasDiscount)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(
                                    "Vous économisez ${formatCDF(product.savingsCentimes.toString())}",
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(
                                          color: TekaColors.success,
                                          fontWeight: FontWeight.w600,
                                        ),
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

                              // Availability. The Neuf / Occasion badge that
                              // used to lead this row was removed 2026-07-28:
                              // Teka sells new products only, so a "Neuf" pill
                              // on every product carried no information. The
                              // field is still stored and still emitted in
                              // JSON-LD on the web — see
                              // docs/product-condition-deprecation.md.
                              Row(
                                children: [
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
                                      stockStatusLabel(StockStatus.lowStock),
                                      style: const TextStyle(
                                        color: TekaColors.warning,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    )
                                  else
                                    Text(
                                      stockStatusLabel(StockStatus.inStock),
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
                                    Flexible(
                                      child: Text(
                                        product.seller.businessName!,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          color: TekaColors.foreground,
                                          fontWeight: FontWeight.w600,
                                          fontSize: 14,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    // Officiel (platform seller) / Vérifié badge.
                                    Icon(
                                      Icons.verified,
                                      size: 15,
                                      color: product.seller.businessName ==
                                              'Teka RDC Officiel'
                                          ? TekaColors.tekaRed
                                          : TekaColors.success,
                                    ),
                                    const SizedBox(width: 2),
                                    Text(
                                      product.seller.businessName ==
                                              'Teka RDC Officiel'
                                          ? "Officiel"
                                          : "Vérifié",
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: product.seller.businessName ==
                                                'Teka RDC Officiel'
                                            ? TekaColors.tekaRed
                                            : TekaColors.success,
                                      ),
                                    ),
                                  ],
                                ),
                                // Direct buyer↔seller messaging was retired
                                // 2026-05-17; the support pointer that stood
                                // here was removed 2026-07-26 (support lives in
                                // Compte → Aide and /contact). The seller name
                                // + city above are the entire seller card now.
                                const SizedBox(height: 16),
                                const Divider(color: TekaColors.border),
                                const SizedBox(height: 12),
                              ],

                              // Description
                              if (description.isNotEmpty) ...[
                                Text(
                                  "Détails du produit",
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
                              if (specs.isNotEmpty) ...[
                                Text(
                                  "Caractéristiques",
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
                                  children: specs
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

                              // Everything below is API-bound and therefore
                              // takes the RESOLVED uuid, never the route
                              // identifier (which may be a shortCode or slug).
                              _ReviewsSection(productId: product.id),

                              // Related products (same category + price)
                              const SizedBox(height: 24),
                              _RelatedSection(productId: product.id),

                              // Recently viewed (client-local), excl. current
                              const SizedBox(height: 24),
                              RecentlyViewedSection(excludeId: product.id),
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
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 8,
                      offset: const Offset(0, -2),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        children: const [
                          Icon(Icons.payments_outlined,
                              size: 16, color: TekaColors.success),
                          SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Paiement à la livraison',
                              style: TextStyle(
                                color: TekaColors.mutedForeground,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          Icon(Icons.local_shipping_outlined,
                              size: 16, color: TekaColors.success),
                          SizedBox(width: 6),
                          Text(
                            'Livraison locale',
                            style: TextStyle(
                              color: TekaColors.mutedForeground,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    _PdpCartBar(product: product),
                  ],
                ),
              ),
            ],
          );
        },
        loading: () => const Center(
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        error: (error, _) {
          // A 404 means the product was removed, suspended or is no longer
          // available — offer a way back to browsing rather than a pointless
          // retry. Transient errors keep the retry affordance.
          final isUnavailable =
              error is DioException && error.response?.statusCode == 404;
          if (isUnavailable) {
            return AppErrorState(
              message: "Ce produit n'est plus disponible.",
              actionLabel: 'Retour',
              onRetry: () =>
                  context.canPop() ? context.pop() : context.go('/categories'),
            );
          }
          return AppErrorState(
            message: "Une erreur est survenue. Veuillez réessayer.",
            onRetry: () {
              ref.invalidate(productDetailProvider(identifier));
            },
          );
        },
      ),
    );
  }
}

class _PdpActionSurface extends StatelessWidget {
  final Widget child;

  const _PdpActionSurface({required this.child});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: TekaColors.surface,
        shape: BoxShape.circle,
        border: Border.all(color: TekaColors.border),
      ),
      child: child,
    );
  }
}

class _PdpRatingSummary extends ConsumerWidget {
  final String productId;

  const _PdpRatingSummary({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviewsState = ref.watch(reviewsProvider(productId));
    final stats = reviewsState.stats;

    if (stats == null) {
      if (!reviewsState.isLoading) {
        return const SizedBox.shrink();
      }
      return const SizedBox(
        height: 44,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 1.5),
            ),
            SizedBox(width: 8),
            Text(
              'Chargement des avis…',
              style: TextStyle(
                fontSize: 13,
                color: TekaColors.mutedForeground,
              ),
            ),
          ],
        ),
      );
    }

    final hasReviews = stats.totalReviews > 0;
    final rating = stats.avgRating.toStringAsFixed(1).replaceAll('.', ',');
    final semanticLabel = hasReviews
        ? 'Note $rating sur 5, ${stats.totalReviews} avis. Voir les avis.'
        : 'Aucun avis. Voir les avis.';

    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () => context.push('/products/$productId/reviews'),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  hasReviews ? Icons.star_rounded : Icons.star_border_rounded,
                  size: 19,
                  color: hasReviews
                      ? const Color(0xFFF59E0B)
                      : TekaColors.mutedForeground,
                ),
                const SizedBox(width: 5),
                if (hasReviews) ...[
                  Text(
                    rating,
                    style: const TextStyle(
                      color: TekaColors.foreground,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 5),
                  const Text(
                    '·',
                    style: TextStyle(color: TekaColors.mutedForeground),
                  ),
                  const SizedBox(width: 5),
                  Flexible(
                    child: Text(
                      '${stats.totalReviews} avis',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: TekaColors.mutedForeground,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ] else
                  const Text(
                    'Aucun avis',
                    style: TextStyle(
                      color: TekaColors.mutedForeground,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                const SizedBox(width: 2),
                const Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: TekaColors.mutedForeground,
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

    // Stats failed to load. Previously this returned SizedBox.shrink(), which
    // is why a 400 from passing a non-uuid made the whole "Avis" section look
    // like it did not exist. Show a compact, retryable notice instead — a
    // missing section is indistinguishable from a product with no reviews.
    if (reviewsState.stats == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Avis",
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: TekaColors.foreground,
                ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.error_outline,
                  size: 16, color: TekaColors.mutedForeground),
              const SizedBox(width: 6),
              const Expanded(
                child: Text(
                  "Impossible de charger les avis.",
                  style: TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 13,
                  ),
                ),
              ),
              TextButton(
                onPressed: () =>
                    ref.read(reviewsProvider(productId).notifier).refresh(),
                child: const Text(
                  "Réessayer",
                  style: TextStyle(color: TekaColors.tekaRed, fontSize: 13),
                ),
              ),
            ],
          ),
        ],
      );
    }

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
                onPressed: () => context.push('/products/$productId/reviews'),
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
                onPressed: () => context.push('/products/$productId/reviews'),
                child: Text(
                  "Voir tous les avis",
                  style: const TextStyle(color: TekaColors.tekaRed),
                ),
              ),
            ),
        ] else ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Column(
              children: [
                const Icon(Icons.star_border_rounded,
                    size: 36, color: TekaColors.border),
                const SizedBox(height: 6),
                const Text(
                  "Aucun avis pour ce produit.",
                  style: TextStyle(
                    color: TekaColors.foreground,
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  "Soyez le premier à laisser un avis.",
                  style: const TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 13,
                  ),
                ),
              ],
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
          height: productCardRowExtent(
            context,
            variant: ProductCardVariant.discovery,
            itemWidth: 150,
          ),
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, i) => SizedBox(
              width: 150,
              child: ProductCard(
                product: items[i],
                variant: ProductCardVariant.discovery,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// PDP action bar (Jumia-style). Reacts to cart state via [cartItemProvider]:
///   • out of stock → disabled "Rupture de stock"
///   • not in cart  → "Ajouter au panier" (gates guests to login, then adds)
///   • in cart      → [ accueil | − | qté | + ] with stock-capped +/−; − at
///     qty 1 removes the line and restores the add button. Kept in sync with
///     the cart/checkout everywhere because it derives from the cart provider.
class _PdpCartBar extends ConsumerWidget {
  final ProductDetailModel product;

  const _PdpCartBar({required this.product});

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    // Cart requires an account — gate guests to login, then add in place.
    if (!await ensureAuthenticated(context, ref)) return;
    if (!context.mounted) return;
    try {
      await ref.read(cartProvider.notifier).addItem(product.id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Produit ajouté au panier"),
            backgroundColor: TekaColors.success,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Une erreur est survenue. Veuillez réessayer."),
            backgroundColor: TekaColors.destructive,
            duration: Duration(seconds: 2),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (product.isOutOfStock) {
      return SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: null,
          style: FilledButton.styleFrom(
            disabledBackgroundColor: TekaColors.muted,
            padding: const EdgeInsets.symmetric(vertical: 14),
            textStyle:
                const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
          child: const Text("Rupture de stock"),
        ),
      );
    }

    final cartItem = ref.watch(cartItemProvider(product.id));
    final qty = cartItem?.quantity ?? 0;

    // Not in cart → the add button.
    if (qty <= 0) {
      return SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          onPressed: () => _add(context, ref),
          icon: const Icon(Icons.shopping_cart_outlined),
          label: const Text("Ajouter au panier"),
          style: FilledButton.styleFrom(
            backgroundColor: TekaColors.tekaRed,
            padding: const EdgeInsets.symmetric(vertical: 14),
            textStyle:
                const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      );
    }

    // In cart → [ accueil | − | qté | + ].
    final stock = product.quantity;
    final atMax = qty >= stock;
    return Row(
      children: [
        // Home shortcut (mirrors the Jumia bottom bar's house icon).
        _PdpBarIconButton(
          icon: Icons.home_outlined,
          tooltip: "Accueil",
          onTap: () => context.go('/'),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Container(
            height: 48,
            // Outer border matches the home icon so the three controls read as
            // one segmented stepper: red − | white qty | red +.
            decoration: BoxDecoration(
              border: Border.all(color: TekaColors.border),
              borderRadius: BorderRadius.circular(10),
            ),
            clipBehavior: Clip.antiAlias,
            child: Row(
              children: [
                _PdpQtyButton(
                  icon: Icons.remove,
                  onTap: () {
                    final notifier = ref.read(cartProvider.notifier);
                    if (qty <= 1) {
                      notifier.removeItem(product.id);
                    } else {
                      notifier.updateQuantity(product.id, qty - 1);
                    }
                  },
                ),
                // Quantity readout — white background like the home icon (not
                // red), dark text for legibility.
                Expanded(
                  child: Container(
                    alignment: Alignment.center,
                    color: TekaColors.surface,
                    child: Text(
                      '$qty',
                      style: const TextStyle(
                        color: TekaColors.foreground,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                _PdpQtyButton(
                  icon: Icons.add,
                  // Dim + block at the stock ceiling, with clear feedback.
                  dimmed: atMax,
                  onTap: () {
                    if (atMax) {
                      ScaffoldMessenger.of(context)
                        ..clearSnackBars()
                        ..showSnackBar(
                          SnackBar(
                            // Deliberately no count: the cap still applies,
                            // but the exact remaining quantity is internal
                            // inventory. See core/constants/stock.dart.
                            content: const Text("Stock maximum atteint"),
                            duration: const Duration(seconds: 2),
                          ),
                        );
                      return;
                    }
                    ref
                        .read(cartProvider.notifier)
                        .updateQuantity(product.id, qty + 1);
                  },
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// A square outlined icon button used at the left of the in-cart PDP bar.
class _PdpBarIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _PdpBarIconButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            border: Border.all(color: TekaColors.border),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: TekaColors.foreground, size: 22),
        ),
      ),
    );
  }
}

/// A +/− control inside the in-cart PDP stepper.
class _PdpQtyButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool dimmed;

  const _PdpQtyButton({
    required this.icon,
    required this.onTap,
    this.dimmed = false,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        width: 52,
        height: 48,
        alignment: Alignment.center,
        color: TekaColors.tekaRed,
        child: Icon(
          icon,
          color: dimmed ? Colors.white54 : Colors.white,
          size: 22,
        ),
      ),
    );
  }
}
