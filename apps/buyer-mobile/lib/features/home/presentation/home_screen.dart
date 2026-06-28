import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/teka_colors.dart';
import '../../../core/widgets/app_bar_actions.dart';
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
      appBar: AppBar(
        toolbarHeight: 72,
        title: _HomeAppBarTitle(
          cityName: cityName,
          cityAccent: cityAccent,
          onCityTap: () => context.push('/city-selection'),
        ),
        actions: [
          _HomeNotificationAction(
            unreadCount: unreadNotifications,
            onPressed: () => context.push('/notifications'),
          ),
          const SizedBox(width: 12),
        ],
      ),
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
        child: ListView(
          controller: _scrollController,
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
              title: "Catégories",
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
                child: _CategoryStripSkeleton(),
              ),
              error: (_, __) => _InlineFeedState(
                icon: Icons.grid_view_rounded,
                title: "Catégories indisponibles",
                message: "Vérifiez votre connexion puis tirez pour actualiser.",
                onRetry: () => ref.invalidate(categoriesProvider),
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
                  ? const _InlineFeedState(
                      icon: Icons.inventory_2_outlined,
                      title: "Aucun produit populaire",
                      message: "Les produits de votre ville apparaîtront ici.",
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
        width: 135,
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

class _CategoryStripSkeleton extends StatelessWidget {
  const _CategoryStripSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
      itemCount: 5,
      separatorBuilder: (_, __) => const SizedBox(width: 10),
      itemBuilder: (_, __) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: TekaColors.surface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: TekaColors.border),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            width: 56,
            height: 10,
            decoration: BoxDecoration(
              color: TekaColors.muted,
              borderRadius: BorderRadius.circular(999),
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
