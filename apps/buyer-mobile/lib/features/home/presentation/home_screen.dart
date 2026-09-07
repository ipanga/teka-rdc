import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/teka_colors.dart';
import '../../../core/widgets/app_bar_actions.dart';
import '../../../core/widgets/commerce_header.dart';
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
import '../../../core/theme/teka_spacing.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  // Drives the scroll-to-top button: attached to the home feed ListView so we
  // can read the offset (to reveal the button once past the first screenful)
  // and smoothly animate back to the top on tap.
  final ScrollController _scrollController = ScrollController();
  bool _showScrollToTop = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    final show = _scrollController.hasClients && _scrollController.offset > 600;
    if (show != _showScrollToTop) {
      setState(() => _showScrollToTop = show);
    }
  }

  void _scrollToTop() {
    _scrollController.animateTo(
      0,
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
    final isAuthed = ref.watch(authProvider).status == AuthStatus.authenticated;
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
      floatingActionButton: AnimatedScale(
        scale: _showScrollToTop ? 1 : 0,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        child: FloatingActionButton.small(
          heroTag: 'home_scroll_to_top',
          backgroundColor: TekaColors.tekaRed,
          foregroundColor: Colors.white,
          tooltip: 'Haut de page',
          onPressed: _showScrollToTop ? _scrollToTop : null,
          child: const Icon(Icons.keyboard_arrow_up_rounded),
        ),
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
            ref
                .read(flashDealsProvider.future)
                .catchError((_) => <FlashDealModel>[]),
            ref
                .read(categoriesProvider.future)
                .catchError((_) => <CategoryModel>[]),
            ref
                .read(popularProductsProvider.future)
                .catchError((_) => <BrowseProductModel>[]),
            ref
                .read(newestProductsProvider.future)
                .catchError((_) => <BrowseProductModel>[]),
            ref
                .read(promoProductsProvider.future)
                .catchError((_) => <BrowseProductModel>[]),
          ]);
        },
        child: CustomScrollView(
          controller: _scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            HomeCommerceHeader(
              onSearchPressed: () => context.push('/search'),
              expandedContent: Row(
                children: [
                  Expanded(
                    child: _HomeAppBarTitle(
                      cityName: cityName,
                      cityAccent: cityAccent,
                      onCityTap: () => context.push('/city-selection'),
                    ),
                  ),
                  _HomeNotificationAction(
                    unreadCount: unreadNotifications,
                    onPressed: () => context.push('/notifications'),
                  ),
                ],
              ),
            ),
            SliverList(
              delegate: SliverChildListDelegate([
                // City hero — premium, city-branded header (mirrors the web city
                // landing hero). Renders nothing until a town is selected.
                const SizedBox(height: TekaSpacing.xs),
                const CityHero(),
                const SizedBox(height: TekaSpacing.md),

                // Categories BEFORE the promotional banners (UX PR B).
                //
                // Both heroes were audited and both keep their place: the city
                // hero answers "where am I shopping" with the town's own image
                // and CTA, the banner carousel is admin merchandising. They are
                // not duplicates — what was wrong was the order. Two
                // full-width promotional blocks ran back to back (measured on
                // a 448 pt phone: hero 197 pt, banner 180 pt), so the category
                // strip — the app's primary navigation — did not start until
                // 617 pt down, in the bottom third of the first viewport.
                // Putting navigation before merchandising moves it to 429 pt,
                // 188 pt earlier, and costs the first product row 15 pt.
                _SectionHeader(
                  title: "Catégories",
                  onSeeAll: null,
                ),
                const SizedBox(height: TekaSpacing.xs),
                categories.when(
                  data: (cats) => _CategoryStrip(categories: cats),
                  loading: () => const _CategoryStrip.loading(),
                  error: (_, __) => _InlineFeedState(
                    icon: Icons.grid_view_rounded,
                    title: "Catégories indisponibles",
                    message:
                        "Vérifiez votre connexion puis tirez pour actualiser.",
                    onRetry: () => ref.invalidate(categoriesProvider),
                  ),
                ),

                const SizedBox(height: TekaSpacing.lg),

                // Banner carousel — merchandising, after the navigation.
                const BannerCarousel(),

                const SizedBox(height: TekaSpacing.xl),

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
                              height: productCardRowExtent(
                                context,
                                variant: ProductCardVariant.discovery,
                                itemWidth: 160,
                              ),
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 16),
                                itemCount: products.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(width: 12),
                                itemBuilder: (context, index) => SizedBox(
                                  width: 160,
                                  child: ProductCard(
                                    product: products[index],
                                    variant: ProductCardVariant.discovery,
                                  ),
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
                      ? const _InlineFeedState(
                          icon: Icons.inventory_2_outlined,
                          title: "Aucun produit populaire",
                          message:
                              "Les produits de votre ville apparaîtront ici.",
                        )
                      : SizedBox(
                          height: productCardRowExtent(
                            context,
                            variant: ProductCardVariant.discovery,
                            itemWidth: 160,
                          ),
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: products.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(width: 12),
                            itemBuilder: (context, index) => SizedBox(
                              width: 160,
                              child: ProductCard(
                                product: products[index],
                                variant: ProductCardVariant.discovery,
                              ),
                            ),
                          ),
                        ),
                  loading: () => ProductRowSkeleton(
                    height: productCardRowExtent(
                      context,
                      variant: ProductCardVariant.discovery,
                      itemWidth: 160,
                    ),
                  ),
                  error: (_, __) => _InlineFeedState(
                    icon: Icons.wifi_off_rounded,
                    title: "Produits indisponibles",
                    message: "Impossible de charger les produits populaires.",
                    onRetry: () => ref.invalidate(popularProductsProvider),
                  ),
                ),

                const SizedBox(height: 24),

                // Newest products (grid)
                _SectionHeader(
                  title: "Nouveautés",
                  onSeeAll: null,
                ),
                const SizedBox(height: 8),
                newest.when(
                  data: (products) => products.isEmpty
                      ? const _InlineFeedState(
                          icon: Icons.new_releases_outlined,
                          title: "Aucune nouveauté",
                          message: "Les nouveaux produits apparaîtront ici.",
                        )
                      : ProductGrid(
                          padding:
                              const EdgeInsets.symmetric(horizontal: 16),
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          variant: ProductCardVariant.discovery,
                          itemCount: products.length,
                          itemBuilder: (context, index) => ProductCard(
                            product: products[index],
                            variant: ProductCardVariant.discovery,
                          ),
                        ),
                  loading: () => ProductGridSkeleton(
                    count: 6,
                    mainAxisExtentFor: (cellWidth) => productCardGridExtent(
                      context,
                      variant: ProductCardVariant.discovery,
                      cellWidth: cellWidth,
                    ),
                  ),
                  error: (_, __) => _InlineFeedState(
                    icon: Icons.wifi_off_rounded,
                    title: "Nouveautés indisponibles",
                    message: "Impossible de charger les derniers produits.",
                    onRetry: () => ref.invalidate(newestProductsProvider),
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
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

class _HomeAppBarTitle extends StatelessWidget {
  final String? cityName;
  final Color cityAccent;
  final VoidCallback onCityTap;

  const _HomeAppBarTitle({
    required this.cityName,
    required this.cityAccent,
    required this.onCityTap,
  });

  @override
  Widget build(BuildContext context) {
    final label = cityName ?? 'Choisir une ville';

    return Semantics(
      label: 'Teka CD, livraison à $label',
      textDirection: TextDirection.ltr,
      child: SizedBox(
        width: 210,
        height: 56,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const _HomeBrandLogo(),
            const SizedBox(height: 4),
            _CitySwitcherChip(
              cityName: label,
              cityAccent: cityAccent,
              onTap: onCityTap,
            ),
          ],
        ),
      ),
    );
  }
}

class _HomeBrandLogo extends StatelessWidget {
  const _HomeBrandLogo();

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: SizedBox(
        height: 27,
        // 1300×320 wordmark (≈4.06:1) → intrinsic width at h27 ≈ 110.
        width: 110,
        child: Image.asset(
          'assets/brand/logo_teka_cd.png',
          alignment: Alignment.centerLeft,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.high,
          errorBuilder: (_, __, ___) => RichText(
            maxLines: 1,
            overflow: TextOverflow.clip,
            textDirection: TextDirection.ltr,
            text: const TextSpan(
              children: [
                TextSpan(
                  text: 'TEKA',
                  style: TextStyle(
                    color: TekaColors.foreground,
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0,
                    height: 1,
                  ),
                ),
                TextSpan(
                  text: '.CD',
                  style: TextStyle(
                    color: TekaColors.tekaRed,
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0,
                    height: 1,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CitySwitcherChip extends StatelessWidget {
  final String cityName;
  final Color cityAccent;
  final VoidCallback onTap;

  const _CitySwitcherChip({
    required this.cityName,
    required this.cityAccent,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // A city name sits inside a deliberately compact header chip. Preserve
    // accessibility growth without letting system-wide 200% text force the
    // chip over the logo/search boundary; Semantics carries the full name.
    final requestedScale = MediaQuery.textScalerOf(context).scale(11) / 11;
    final cityTextScaler = TextScaler.linear(
      requestedScale.clamp(1.0, 1.4),
    );

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 190),
      child: Material(
        // NOTE: Material forbids passing both `borderRadius` and `shape` (it
        // asserts in debug → error box + "99979px overflow"). The StadiumBorder
        // already gives a fully-rounded pill, so no borderRadius here.
        color: Colors.white,
        shape: StadiumBorder(
          side: BorderSide(color: cityAccent.withValues(alpha: 0.26)),
        ),
        child: InkWell(
          onTap: onTap,
          customBorder: const StadiumBorder(),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.location_on_rounded,
                  size: 13,
                  color: cityAccent,
                ),
                const SizedBox(width: 3),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 150),
                  child: Text(
                    cityName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textScaler: cityTextScaler,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: cityAccent,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0,
                        ),
                  ),
                ),
                const SizedBox(width: 1),
                Icon(
                  Icons.keyboard_arrow_down_rounded,
                  size: 14,
                  color: cityAccent,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HomeNotificationAction extends StatelessWidget {
  final int unreadCount;
  final VoidCallback onPressed;

  const _HomeNotificationAction({
    required this.unreadCount,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final icon = TekaAppBarIconButton(
      icon: Icons.notifications_none_rounded,
      tooltip: "Notifications",
      onPressed: onPressed,
    );

    if (unreadCount <= 0) return icon;

    return Badge(
      label: Text(unreadCount > 9 ? '9+' : '$unreadCount'),
      backgroundColor: TekaColors.tekaRed,
      textColor: Colors.white,
      child: icon,
    );
  }
}

/// The home category strip, loaded or loading.
///
/// The height used to be a magic `118` shared by both states, tuned to a
/// two-line French label at the default text scale — so « Téléphones &
/// Accessoires » fitted and the same strip clipped at 1.5x. It now asks
/// [categoryCircleHeight] for the height the tiles actually need at the
/// current text scale, and the skeleton uses the same number so the strip does
/// not resize when the data lands.
class _CategoryStrip extends StatelessWidget {
  final List<CategoryModel> categories;
  final bool isLoading;

  const _CategoryStrip({required this.categories}) : isLoading = false;

  const _CategoryStrip.loading()
      : categories = const [],
        isLoading = true;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: categoryCircleHeight(context),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        // Vertical padding gives the tile shadows room (the list clips to its
        // bounds).
        padding: const EdgeInsets.fromLTRB(
          TekaSpacing.md,
          6,
          TekaSpacing.md,
          6,
        ),
        itemCount: isLoading ? 5 : categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: TekaSpacing.xs),
        itemBuilder: (context, index) => isLoading
            ? const _CategoryCircleSkeleton()
            : CategoryCircle(category: categories[index]),
      ),
    );
  }
}

class _CategoryCircleSkeleton extends StatelessWidget {
  const _CategoryCircleSkeleton();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: kCategoryCircleWidth,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: kCategoryCircleDiameter,
            height: kCategoryCircleDiameter,
            decoration: const BoxDecoration(
              color: TekaColors.surface,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(height: TekaSpacing.xs),
          Container(
            width: 56,
            height: 10,
            decoration: const BoxDecoration(
              color: TekaColors.muted,
              borderRadius: TekaRadius.pillAll,
            ),
          ),
        ],
      ),
    );
  }
}

class _InlineFeedState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final VoidCallback? onRetry;

  const _InlineFeedState({
    required this.icon,
    required this.title,
    required this.message,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: TekaColors.surface,
          border: Border.all(color: TekaColors.border),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: TekaColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 22, color: TekaColors.mutedForeground),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: TekaColors.foreground,
                          ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      message,
                      style: const TextStyle(
                        color: TekaColors.mutedForeground,
                        fontSize: 12.5,
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
              if (onRetry != null) ...[
                const SizedBox(width: 8),
                IconButton.filledTonal(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh_rounded),
                  tooltip: 'Réessayer',
                ),
              ],
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
