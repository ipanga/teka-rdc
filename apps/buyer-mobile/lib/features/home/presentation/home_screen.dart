import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../l10n/app_localizations.dart';
import '../../../core/theme/teka_colors.dart';
import '../../auth/presentation/providers/auth_provider.dart';
import '../../cart/presentation/providers/cart_provider.dart';
import '../../catalog/data/models/category_model.dart';
import '../../catalog/data/models/product_model.dart';
import '../../catalog/presentation/providers/catalog_provider.dart';
import '../../catalog/presentation/widgets/category_chip.dart';
import '../../catalog/presentation/widgets/product_card.dart';
import '../../messaging/presentation/providers/messaging_provider.dart';
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
    final l10n = AppLocalizations.of(context)!;
    final authState = ref.watch(authProvider);
    final userName = authState.user?['firstName'] as String? ?? '';
    final categories = ref.watch(categoriesProvider);
    final popular = ref.watch(popularProductsProvider);
    final newest = ref.watch(newestProductsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.appName),
        actions: [
          IconButton(
            icon: const Icon(Icons.favorite_border),
            tooltip: l10n.wishlistTitle,
            onPressed: () => context.push('/wishlist'),
          ),
          const _MessagesIconButton(),
          const _CartIconButton(),
          IconButton(
            icon: const Icon(Icons.search),
            tooltip: l10n.search,
            onPressed: () => context.push('/search'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: l10n.authLogout,
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/auth/login');
            },
          ),
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
          // Wait for data to reload
          await Future.wait([
            ref.read(bannersProvider.future).catchError((_) => <BannerModel>[]),
            ref.read(flashDealsProvider.future).catchError((_) => <FlashDealModel>[]),
            ref.read(categoriesProvider.future).catchError((_) => <CategoryModel>[]),
            ref.read(popularProductsProvider.future).catchError((_) => <BrowseProductModel>[]),
            ref.read(newestProductsProvider.future).catchError((_) => <BrowseProductModel>[]),
          ]);
        },
        child: ListView(
          children: [
            // Banner carousel at the top
            const SizedBox(height: 12),
            const BannerCarousel(),
            const SizedBox(height: 16),

            // Flash deals section
            const FlashDealsSection(),
            const SizedBox(height: 8),

            // Welcome message
            if (userName.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Text(
                  'Bonjour, $userName !',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: TekaColors.foreground,
                      ),
                ),
              ),

            const SizedBox(height: 16),

            // Categories strip
            _SectionHeader(
              title: l10n.categories,
              onSeeAll: null,
            ),
            const SizedBox(height: 8),
            categories.when(
              data: (cats) => SizedBox(
                height: 40,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: cats.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, index) => CategoryChip(
                    category: cats[index],
                  ),
                ),
              ),
              loading: () => const SizedBox(
                height: 40,
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
                  l10n.authGenericError,
                  style: TextStyle(color: TekaColors.mutedForeground, fontSize: 13),
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Popular products (horizontal scroll)
            _SectionHeader(
              title: l10n.popularProducts,
              onSeeAll: null,
            ),
            const SizedBox(height: 8),
            popular.when(
              data: (products) => products.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        l10n.productNoResults,
                        style: TextStyle(
                          color: TekaColors.mutedForeground,
                          fontSize: 13,
                        ),
                      ),
                    )
                  : SizedBox(
                      height: 260,
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
              loading: () => const SizedBox(
                height: 260,
                child: Center(
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              error: (_, __) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  l10n.authGenericError,
                  style: TextStyle(color: TekaColors.mutedForeground, fontSize: 13),
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Newest products (grid)
            _SectionHeader(
              title: l10n.newestProducts,
              onSeeAll: null,
            ),
            const SizedBox(height: 8),
            newest.when(
              data: (products) => products.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(16),
                      child: Center(
                        child: Text(
                          l10n.productNoResults,
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
                          childAspectRatio: 0.65,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: products.length,
                        itemBuilder: (context, index) => ProductCard(
                          product: products[index],
                        ),
                      ),
                    ),
              loading: () => const Padding(
                padding: EdgeInsets.all(32),
                child: Center(
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              error: (_, __) => Padding(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: Text(
                    l10n.authGenericError,
                    style: TextStyle(
                      color: TekaColors.mutedForeground,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _MessagesIconButton extends ConsumerWidget {
  const _MessagesIconButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unreadCount = ref.watch(
        messagingProvider.select((state) => state.unreadCount));

    return IconButton(
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          const Icon(Icons.chat_bubble_outline),
          if (unreadCount > 0)
            Positioned(
              right: -6,
              top: -4,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(
                  color: TekaColors.tekaRed,
                  shape: BoxShape.circle,
                ),
                constraints: const BoxConstraints(
                  minWidth: 18,
                  minHeight: 18,
                ),
                child: Text(
                  unreadCount > 99 ? '99+' : '$unreadCount',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
        ],
      ),
      onPressed: () => context.push('/messages'),
    );
  }
}

class _CartIconButton extends ConsumerWidget {
  const _CartIconButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartCount = ref.watch(cartItemCountProvider);

    return IconButton(
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          const Icon(Icons.shopping_cart_outlined),
          if (cartCount > 0)
            Positioned(
              right: -6,
              top: -4,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(
                  color: TekaColors.tekaRed,
                  shape: BoxShape.circle,
                ),
                constraints: const BoxConstraints(
                  minWidth: 18,
                  minHeight: 18,
                ),
                child: Text(
                  cartCount > 99 ? '99+' : '$cartCount',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
        ],
      ),
      onPressed: () => context.push('/cart'),
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
