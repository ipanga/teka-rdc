import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../../core/widgets/product_skeletons.dart';
import '../../../catalog/data/models/product_model.dart';
import '../../../catalog/presentation/widgets/product_card.dart';
import '../../data/models/wishlist_model.dart';
import '../providers/wishlist_provider.dart';

class WishlistScreen extends ConsumerStatefulWidget {
  const WishlistScreen({super.key});

  @override
  ConsumerState<WishlistScreen> createState() => _WishlistScreenState();
}

class _WishlistScreenState extends ConsumerState<WishlistScreen> {
  bool _viewedTracked = false;

  @override
  void initState() {
    super.initState();
    // Fire wishlist_viewed once the screen opens. If the list is already
    // loaded (the provider may have loaded earlier), fire immediately;
    // otherwise the ref.listen in build fires it on first load completion.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final s = ref.read(wishlistProvider);
      if (!s.isLoading && s.error == null) _trackViewedOnce(s.items.length);
    });
  }

  void _trackViewedOnce(int itemCount) {
    if (_viewedTracked) return;
    _viewedTracked = true;
    const PosthogAnalytics().capture(
      'wishlist_viewed',
      properties: {'item_count': itemCount},
    );
  }

  @override
  Widget build(BuildContext context) {
    final wishlistState = ref.watch(wishlistProvider);
    final visibleItems =
        wishlistState.items.where((item) => item.product != null).toList();

    // Fire wishlist_viewed on the first successful load if it wasn't already
    // loaded when the screen opened.
    ref.listen(wishlistProvider, (_, next) {
      if (!next.isLoading && next.error == null) {
        _trackViewedOnce(next.items.length);
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: Text("Mes favoris"),
      ),
      body: wishlistState.isLoading
          ? ProductGridSkeleton(
              count: 6,
              mainAxisExtent: productCardGridExtent(
                context,
                variant: ProductCardVariant.catalog,
              ),
            )
          : wishlistState.error != null
              ? AppErrorState(
                  message: wishlistState.error,
                  onRetry: () => ref.read(wishlistProvider.notifier).refresh(),
                )
              : visibleItems.isEmpty
                  ? AppEmptyState(
                      icon: Icons.favorite_border,
                      title: "Aucun favori",
                      message:
                          "Ajoutez des produits à vos favoris pour les retrouver facilement",
                      actionLabel: "Découvrir les produits",
                      onAction: () => context.go('/categories'),
                    )
                  : RefreshIndicator(
                      color: TekaColors.tekaRed,
                      onRefresh: () =>
                          ref.read(wishlistProvider.notifier).refresh(),
                      child: GridView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(16),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisExtent: productCardGridExtent(
                            context,
                            variant: ProductCardVariant.catalog,
                          ),
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: visibleItems.length,
                        itemBuilder: (context, index) {
                          final product = visibleItems[index].product!;
                          return ProductCard(
                            product: product.toBrowseProduct(),
                          );
                        },
                      ),
                    ),
    );
  }
}

extension on WishlistProductModel {
  BrowseProductModel toBrowseProduct() {
    final imageUrl = image;
    return BrowseProductModel(
      id: id,
      title: title,
      priceCDF: priceCDF,
      priceUSD: priceUSD,
      discountPriceCDF: discountPriceCDF,
      condition: condition,
      quantity: quantity,
      image: imageUrl != null && imageUrl.isNotEmpty
          ? ProductImageModel(
              id: '$id-image',
              url: imageUrl,
              thumbnailUrl: imageUrl,
            )
          : null,
      seller: BrowseProductSeller(businessName: seller?.businessName),
      avgRating: avgRating ?? 0,
      totalReviews: totalReviews ?? 0,
    );
  }
}
