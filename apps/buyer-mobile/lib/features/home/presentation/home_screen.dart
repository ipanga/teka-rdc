import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/teka_colors.dart';
import '../../../core/widgets/product_skeletons.dart';
import '../../auth/presentation/providers/auth_provider.dart';
import '../../catalog/data/models/category_model.dart';
import '../../catalog/data/models/product_model.dart';
import '../../catalog/presentation/providers/catalog_provider.dart';
import '../../catalog/presentation/widgets/category_circle.dart';
import '../../notifications/presentation/providers/notifications_provider.dart';
import 'widgets/city_hero.dart';
import '../../catalog/presentation/widgets/product_card.dart';
import '../../catalog/presentation/widgets/recently_viewed_section.dart';
import '../../city/presentation/providers/city_provider.dart';
import '../../wishlist/presentation/providers/wishlist_provider.dart';
import '../data/models/banner_model.dart';
import '../data/models/flash_deal_model.dart';
import 'providers/banner_provider.dart';
import 'providers/flash_deal_provider.dart';
import 'widgets/banner_carousel.dart';
import 'widgets/flash_deals_section.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cityState = ref.watch(cityProvider);
    final cityName = cityState.selectedCity?.name;
    // Town accent — driven by the city's accentColor (data-driven; copper /
    // cobalt / brand-red default).
    final cityAccent =
        TekaColors.cityAccent(cityState.selectedCity?.accentColor).$1;
    final categories = ref.watch(categoriesProvider);
    final popular = ref.watch(popularProductsProvider);
    final newest = ref.watch(newestProductsProvider);
    // Unread notification badge — only for authenticated buyers.
    final isAuthed =
        ref.watch(authProvider).status == AuthStatus.authenticated;
    final unreadNotifications = isAuthed
        ? (ref.watch(notificationUnreadCountProvider).valueOrNull ?? 0)
        : 0;
    final promo = ref.watch(promoProductsProvider);

    // Hydrate wishlist heart state for the visible products (batch /check —
    // one request per list, no per-card N+1). Only for authenticated users —
    // the wishlist endpoints are auth-only, so guests skip them entirely
    // (Guest Browsing, 2026-06-22).
    ref.listen(popularProductsProvider, (_, next) {
      if (ref.read(authProvider).status != AuthStatus.authenticated) return;
      next.whenData((list) => ref
          .read(wishlistProvider.notifier)
          .loadWishlistIds(list.map((p) => p.id).toList()));
    });
    ref.listen(newestProductsProvider, (_, next) {
      if (ref.read(authProvider).status != AuthStatus.authenticated) return;
      next.whenData((list) => ref
          .read(wishlistProvider.notifier)
          .loadWishlistIds(list.map((p) => p.id).toList()));
    });

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Teka RDC"),
            if (cityName != null)
              GestureDetector(
                onTap: () => context.push('/city-selection'),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.location_on,
                      size: 12,
                      color: cityAccent,
                    ),
                    const SizedBox(width: 2),
                    Text(
                      cityName,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: cityAccent,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(width: 2),
                    Icon(
                      Icons.keyboard_arrow_down,
                      size: 14,
                      color: TekaColors.mutedForeground,
                    ),
                  ],
                ),
              ),
          ],
        ),
        actions: [
          IconButton(
            icon: unreadNotifications > 0
                ? Badge(
                    label: Text(
                        unreadNotifications > 9 ? '9+' : '$unreadNotifications'),
                    backgroundColor: TekaColors.tekaRed,
                    textColor: Colors.white,
                    child: const Icon(Icons.notifications_none_rounded),
                  )
                : const Icon(Icons.notifications_none_rounded),
            tooltip: "Notifications",
            onPressed: () => context.push('/notifications'),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: RefreshIndicator(
        color: TekaColors.tekaRed,
        onRefresh: () async {
          ref.invalidate(bannersProvider);
          ref.invalidate(flashDealsProvider);
          ref.invalidate(categoriesProvider);
          ref.invalidate(popularProductsProvider);
          ref.invalidate(newestProductsProvider);
          ref.invalidate(promoProductsProvider);
          if (isAuthed) ref.invalidate(notificationUnreadCountProvider);
          // Wait for data to reload
          await Future.wait([
            ref.read(bannersProvider.future).catchError((_) => <BannerModel>[]),
            ref.read(flashDealsProvider.future).catchError((_) => <FlashDealModel>[]),
            ref.read(categoriesProvider.future).catchError((_) => <CategoryModel>[]),
            ref.read(popularProductsProvider.future).catchError((_) => <BrowseProductModel>[]),
            ref.read(newestProductsProvider.future).catchError((_) => <BrowseProductModel>[]),
            ref.read(promoProductsProvider.future).catchError((_) => <BrowseProductModel>[]),
          ]);
        },
        child: ListView(
          children: [
            // Prominent search entry — search is an action, not a tab, so it
            // lives at the top of the home feed (taps open the search screen).
            const _HomeSearchBar(),

            // City hero — premium, city-branded header (mirrors the web city
            // landing hero). Renders nothing until a town is selected.
            const SizedBox(height: 8),
            const CityHero(),
            const SizedBox(height: 8),

            // Banner carousel
            const BannerCarousel(),
            const SizedBox(height: 16),

            // Categories strip
            _SectionHeader(
              title: "Categories",
              onSeeAll: null,
            ),
            const SizedBox(height: 8),
            categories.when(
              data: (cats) => SizedBox(
                height: 118,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  // Vertical padding gives the tile shadows room (the list clips
                  // to its bounds).
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
                  itemCount: cats.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (context, index) => CategoryCircle(
                    category: cats[index],
                  ),
                ),
              ),
              loading: () => const SizedBox(
                height: 118,
                child: Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ),
              error: (_, __) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  "Une erreur est survenue. Veuillez reessayer.",
                  style: TextStyle(color: TekaColors.mutedForeground, fontSize: 13),
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Promotions (horizontal scroll) — only shown when promos exist.
            promo.maybeWhen(
              data: (products) => products.isEmpty
                  ? const SizedBox.shrink()
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SectionHeader(
                          title: "Promotions",
                          onSeeAll: () => context.push('/promotions'),
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          height: 280,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: products.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(width: 12),
                            itemBuilder: (context, index) => SizedBox(
                              width: 160,
                              child: ProductCard(product: products[index]),
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                      ],
                    ),
              orElse: () => const SizedBox.shrink(),
            ),

            // Popular products (horizontal scroll)
            _SectionHeader(
              title: "Produits populaires",
              onSeeAll: null,
            ),
            const SizedBox(height: 8),
            popular.when(
              data: (products) => products.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        "Aucun produit trouve",
                        style: TextStyle(
                          color: TekaColors.mutedForeground,
                          fontSize: 13,
                        ),
                      ),
                    )
                  : SizedBox(
                      // 160 (square image) + 22 (vertical padding) + ~85
                      // (title 2-line + 6 + price + 4 + seller) ≈ 267.
                      // Bumped from 260 to give a few px of safety after
                      // the home screen showed "BOTTOM OVERFLOWED BY 7.0
                      // PIXELS" on the 2026-05-23 smoke.
                      height: 280,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: products.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 12),
                        itemBuilder: (context, index) => SizedBox(
                          width: 160,
                          child: ProductCard(product: products[index]),
                        ),
                      ),
                    ),
              loading: () => const ProductRowSkeleton(),
              error: (_, __) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  "Une erreur est survenue. Veuillez reessayer.",
                  style: TextStyle(color: TekaColors.mutedForeground, fontSize: 13),
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Newest products (grid)
            _SectionHeader(
              title: "Nouveautes",
              onSeeAll: null,
            ),
            const SizedBox(height: 8),
            newest.when(
              data: (products) => products.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(16),
                      child: Center(
                        child: Text(
                          "Aucun produit trouve",
                          style: TextStyle(
                            color: TekaColors.mutedForeground,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    )
                  : Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          // Shared product-grid cell shape across home,
                          // category, search, wishlist — see
                          // kProductCardAspectRatio in product_skeletons.dart.
                          childAspectRatio: kProductCardAspectRatio,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: products.length,
                        itemBuilder: (context, index) => ProductCard(
                          product: products[index],
                        ),
                      ),
                    ),
              loading: () => const ProductGridSkeleton(count: 6),
              error: (_, __) => Padding(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: Text(
                    "Une erreur est survenue. Veuillez reessayer.",
                    style: TextStyle(
                      color: TekaColors.mutedForeground,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Flash deals section (self-hides when there are no active deals).
            const FlashDealsSection(),

            // Recently viewed (client-local; self-hides until the buyer has
            // viewed products).
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: RecentlyViewedSection(),
            ),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

/// Tappable search field on the home feed — styled like an input but routes to
/// the full search screen on tap (the actual query happens there).
class _HomeSearchBar extends StatelessWidget {
  const _HomeSearchBar();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: GestureDetector(
        onTap: () => context.push('/search'),
        child: Container(
          height: 50,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: TekaColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: TekaColors.border),
            boxShadow: [
              BoxShadow(
                color: TekaColors.foreground.withValues(alpha: 0.05),
                blurRadius: 12,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: const Row(
            children: [
              Icon(Icons.search_rounded, size: 22, color: TekaColors.tekaRed),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Rechercher des produits...',
                  style: TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 14.5,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final VoidCallback? onSeeAll;

  const _SectionHeader({required this.title, this.onSeeAll});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: TekaColors.foreground,
                ),
          ),
          if (onSeeAll != null)
            TextButton(
              onPressed: onSeeAll,
              child: const Text('Voir tout'),
            ),
        ],
      ),
    );
  }
}
