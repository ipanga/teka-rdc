import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/deep_link/web_links.dart';
import 'package:buyer_mobile/core/providers/core_providers.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';
import 'package:buyer_mobile/core/theme/app_theme.dart';
import 'package:buyer_mobile/core/theme/teka_colors.dart';
import 'package:buyer_mobile/features/auth/data/auth_repository.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/cart/data/cart_repository.dart';
import 'package:buyer_mobile/features/cart/data/models/cart_model.dart';
import 'package:buyer_mobile/features/catalog/data/catalog_repository.dart';
import 'package:buyer_mobile/features/catalog/data/models/product_model.dart';
import 'package:buyer_mobile/features/catalog/presentation/screens/product_detail_screen.dart';
import 'package:buyer_mobile/features/reviews/data/models/review_model.dart';
import 'package:buyer_mobile/features/reviews/data/reviews_repository.dart';
import 'package:buyer_mobile/features/wishlist/data/wishlist_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _GuestTokenStorage extends TokenStorage {
  _GuestTokenStorage() : super(const FlutterSecureStorage());

  @override
  Future<bool> hasTokens() async => false;
}

class _AuthenticatedNotifier extends AuthNotifier {
  _AuthenticatedNotifier()
      : super(
            AuthRepository(Dio(), _GuestTokenStorage()), _GuestTokenStorage());

  @override
  Future<void> checkAuthStatus() async {
    state = const AuthState(status: AuthStatus.authenticated);
  }
}

class _EmptyCartRepository extends CartRepository {
  _EmptyCartRepository() : super(Dio());

  @override
  Future<CartModel> getCart() async => const CartModel(
        id: 'test-cart',
        userId: 'test-buyer',
        createdAt: '',
      );
}

class _WishlistRepository extends WishlistRepository {
  _WishlistRepository() : super(Dio());

  final added = <String>[];
  final removed = <String>[];

  @override
  Future<PaginatedWishlistResponse> getWishlist(
          {int page = 1, int limit = 20}) async =>
      const PaginatedWishlistResponse(
        data: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
      );

  @override
  Future<int> getCount() async => 0;

  @override
  Future<void> addToWishlist(String productId) async => added.add(productId);

  @override
  Future<void> removeFromWishlist(String productId) async =>
      removed.add(productId);
}

class _CatalogRepository extends CatalogRepository {
  _CatalogRepository(this.product) : super(Dio());

  final ProductDetailModel product;

  @override
  Future<ProductDetailModel> getProductDetail(String id) async => product;

  @override
  Future<List<BrowseProductModel>> getRelatedProducts(String productId) async =>
      const [];
}

class _ReviewsRepository extends ReviewsRepository {
  _ReviewsRepository(this.stats) : super(Dio());

  final ReviewStatsModel stats;

  @override
  Future<PaginatedReviewsResponse> getProductReviews(
    String productId, {
    int page = 1,
    int limit = 10,
    String sort = 'newest',
  }) async =>
      const PaginatedReviewsResponse(
        data: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
      );

  @override
  Future<ReviewStatsModel> getReviewStats(String productId) async => stats;

  @override
  Future<CanReviewModel> canReview(String productId) async =>
      const CanReviewModel(canReview: false);

  @override
  Future<ReviewModel?> getMyReview(String productId) async => null;
}

const _product = ProductDetailModel(
  id: '31000000-0000-0000-0000-000000000186',
  title: 'Téléphone intelligent de grande qualité',
  priceCDF: '199999900',
  discountPriceCDF: '159999900',
  condition: 'NEW',
  quantity: 0,
  seller: BrowseProductSeller(
    id: 'seller-1',
    businessName: 'Teka RDC Officiel',
  ),
  breadcrumb: [
    BreadcrumbItem(id: 'category-1', name: 'Téléphones'),
    BreadcrumbItem(id: 'category-2', name: 'Smartphones'),
  ],
  slug: 'telephone-intelligent',
  shortCode: 'a1b2c3',
  citySlug: 'lubumbashi',
);

Future<Widget> _harness(
  ReviewStatsModel stats, {
  ProductDetailModel product = _product,
  _WishlistRepository? wishlist,
}) async {
  SharedPreferences.setMockInitialValues({});
  final preferences = await SharedPreferences.getInstance();
  final router = GoRouter(
    initialLocation: '/products/${product.shortCode}',
    routes: [
      GoRoute(
        path: '/products/:id',
        builder: (_, state) => ProductDetailScreen(
          identifier: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/products/:id/reviews',
        builder: (_, __) => const Scaffold(
          body: Center(child: Text('Écran des avis')),
        ),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(preferences),
      tokenStorageProvider.overrideWithValue(_GuestTokenStorage()),
      catalogRepositoryProvider.overrideWithValue(
        _CatalogRepository(product),
      ),
      reviewsRepositoryProvider.overrideWithValue(
        _ReviewsRepository(stats),
      ),
      if (wishlist != null) ...[
        authProvider.overrideWith((ref) => _AuthenticatedNotifier()),
        wishlistRepositoryProvider.overrideWithValue(wishlist),
        cartRepositoryProvider.overrideWithValue(_EmptyCartRepository()),
      ],
    ],
    child: MaterialApp.router(
      theme: AppTheme.lightTheme,
      routerConfig: router,
    ),
  );
}

void main() {
  setUpAll(FlavorConfig.initialize);

  const stats = ReviewStatsModel(
    avgRating: 4.6,
    totalReviews: 128,
    distribution: {1: 0, 2: 1, 3: 4, 4: 40, 5: 83},
  );

  group('seller badge (PR 5) — from the API flags only', () {
    ProductDetailModel withSeller(BrowseProductSeller seller) =>
        ProductDetailModel(
          id: _product.id,
          title: _product.title,
          priceCDF: '3500000',
          condition: 'NEW',
          quantity: 10,
          seller: seller,
          shortCode: _product.shortCode,
        );

    testWidgets('verified seller shows « Vérifié » with the help text',
        (tester) async {
      await tester.pumpWidget(await _harness(stats,
          product: withSeller(const BrowseProductSeller(
              id: 's1', businessName: 'Boutique Kabila', verified: true))));
      await tester.pumpAndSettle();
      expect(find.text('Boutique Kabila'), findsOneWidget);
      expect(find.text('Vérifié'), findsOneWidget);
      expect(find.text('Officiel'), findsNothing);
      final tooltip = tester.widget<Tooltip>(find.ancestor(
          of: find.text('Vérifié'), matching: find.byType(Tooltip)));
      expect(tooltip.message, kSellerVerifiedHelp);
      expect(kSellerVerifiedHelp, isNot(contains('garanti')));
    });

    testWidgets(
        'unverified seller shows no badge at all — even when named « Teka RDC Officiel »',
        (tester) async {
      await tester.pumpWidget(await _harness(stats,
          product: withSeller(const BrowseProductSeller(
              id: 's1', businessName: 'Teka RDC Officiel'))));
      await tester.pumpAndSettle();
      expect(find.text('Vérifié'), findsNothing);
      expect(find.text('Officiel'), findsNothing);
      expect(find.text('Non vérifié'), findsNothing);
      expect(find.byKey(const Key('pdp-seller-verified')), findsNothing);
    });

    testWidgets('official wins over verified: one badge, « Officiel »',
        (tester) async {
      await tester.pumpWidget(await _harness(stats,
          product: withSeller(const BrowseProductSeller(
              id: 'p',
              businessName: 'Teka RDC Officiel',
              verified: true,
              official: true))));
      await tester.pumpAndSettle();
      expect(find.text('Officiel'), findsOneWidget);
      expect(find.text('Vérifié'), findsNothing);
    });

    testWidgets('a long seller name keeps the badge visible without overflow',
        (tester) async {
      await tester.pumpWidget(await _harness(stats,
          product: withSeller(const BrowseProductSeller(
              id: 's1',
              businessName:
                  'Établissements Kabila Mwamba Import-Export et Fils SARL Lubumbashi',
              verified: true))));
      await tester.pumpAndSettle();
      expect(find.text('Vérifié'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  for (final discounted in [true, false]) {
    for (final inStock in [true, false]) {
      testWidgets(
        'PDP hierarchy and pricing: discounted=$discounted, inStock=$inStock',
        (tester) async {
          final product = ProductDetailModel(
            id: _product.id,
            title: _product.title,
            priceCDF: '3500000',
            discountPriceCDF: discounted ? '2500000' : null,
            condition: 'NEW',
            quantity: inStock ? 10 : 0,
            seller: _product.seller,
            shortCode: _product.shortCode,
          );
          await tester.pumpWidget(await _harness(stats, product: product));
          await tester.pumpAndSettle();

          expect(find.textContaining('Vous économisez'), findsNothing);
          final price = find.text(discounted ? '25.000 FC' : '35.000 FC');
          expect(price, findsOneWidget);
          expect(find.text('-29%'), discounted ? findsOneWidget : findsNothing);
          final original = tester.widget<Text>(find.text('35.000 FC'));
          expect(
              original.style?.decoration,
              discounted
                  ? TextDecoration.lineThrough
                  : isNot(TextDecoration.lineThrough));

          final stock = find.bySemanticsLabel(
            'Disponibilité : ${inStock ? 'En stock' : 'Rupture de stock'}',
          );
          final rating = find.text('4,6 · 128 avis');
          final favorite = find.byTooltip('Ajouter aux favoris');
          final share = find.byTooltip('Partager ce produit');
          for (final control in [stock, rating, favorite, share]) {
            expect(control, findsOneWidget);
          }
          expect(tester.getRect(find.text(product.title)).bottom,
              lessThan(tester.getRect(price).top));
          // Pin the actual gaps so removing the savings line cannot leave an
          // empty slot behind. These products have no optional USD price.
          expect(tester.getRect(stock).top - tester.getRect(price).bottom,
              closeTo(12, 0.1));
          expect(
              tester.getRect(find.byKey(const Key('pdp-rating-actions'))).top -
                  tester.getRect(stock).bottom,
              closeTo(8, 0.1));
          expect(tester.getCenter(rating).dy,
              closeTo(tester.getCenter(favorite).dy, 4));
          expect(tester.getCenter(share).dy,
              closeTo(tester.getCenter(favorite).dy, 0.1));

          final cartButton = tester.widget<FilledButton>(
            find.widgetWithText(FilledButton,
                inStock ? 'Ajouter au panier' : 'Rupture de stock'),
          );
          expect(cartButton.onPressed, inStock ? isNotNull : isNull);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('moved favorite action toggles the resolved product and state',
      (tester) async {
    final wishlist = _WishlistRepository();
    await tester.pumpWidget(await _harness(stats, wishlist: wishlist));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byTooltip('Ajouter aux favoris'));
    await tester.tap(find.byTooltip('Ajouter aux favoris'));
    await tester.pumpAndSettle();
    expect(wishlist.added, [_product.id]);
    expect(find.byIcon(Icons.favorite), findsOneWidget);
    expect(find.byTooltip('Retirer des favoris'), findsOneWidget);

    await tester.tap(find.byTooltip('Retirer des favoris'));
    await tester.pumpAndSettle();
    expect(wishlist.removed, [_product.id]);
    expect(find.byIcon(Icons.favorite_border), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('moved share action sends the canonical URL and button origin',
      (tester) async {
    const channel = MethodChannel('dev.fluttercommunity.plus/share');
    final calls = <MethodCall>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      (call) async {
        calls.add(call);
        return 'dev.fluttercommunity.plus/share/unavailable';
      },
    );
    addTearDown(() => tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null));
    await tester.pumpWidget(await _harness(stats));
    await tester.pumpAndSettle();
    final share = find.widgetWithIcon(IconButton, Icons.ios_share_outlined);
    await tester.ensureVisible(share);
    final rect = tester.getRect(share);
    await tester.tap(share);
    await tester.pumpAndSettle();

    expect(calls, hasLength(1));
    expect(calls.single.method, 'share');
    expect(
        calls.single.arguments,
        containsPair('text',
            '${_product.title}\nhttps://teka.cd/lubumbashi/telephone-intelligent-a1b2c3'));
    expect(calls.single.arguments, containsPair('subject', _product.title));
    expect(calls.single.arguments, containsPair('originX', rect.left));
    expect(calls.single.arguments, containsPair('originY', rect.top));
    expect(calls.single.arguments, containsPair('originWidth', rect.width));
    expect(calls.single.arguments, containsPair('originHeight', rect.height));
    expect(tester.takeException(), isNull);
  });

  testWidgets('PDP shows a content-shaped loading state', (tester) async {
    await tester.pumpWidget(
      await _harness(
        const ReviewStatsModel(
          avgRating: 0,
          totalReviews: 0,
          distribution: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
        ),
      ),
    );

    expect(find.byKey(const Key('pdp-loading-skeleton')), findsOneWidget);
    expect(find.bySemanticsLabel('Chargement du produit'), findsOneWidget);

    await tester.pumpAndSettle();
  });

  test('share URL is canonical and never falls back to the database UUID', () {
    expect(
      productWebUrl(_product),
      'https://teka.cd/lubumbashi/telephone-intelligent-a1b2c3',
    );
    expect(
      productWebUrl(
        const ProductDetailModel(
          id: '31000000-0000-0000-0000-000000000186',
          title: 'Produit sans adresse publique',
          priceCDF: '10000',
          condition: 'NEW',
          quantity: 1,
          seller: BrowseProductSeller(),
        ),
      ),
      isNull,
    );
  });

  testWidgets('PDP uses icon-only actions and a tappable French rating summary',
      (tester) async {
    await tester.pumpWidget(
      await _harness(
        const ReviewStatsModel(
          avgRating: 4.6,
          totalReviews: 128,
          distribution: {1: 0, 2: 1, 3: 4, 4: 40, 5: 83},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byTooltip('Ajouter aux favoris'), findsOneWidget);
    expect(find.byTooltip('Partager ce produit'), findsOneWidget);
    expect(find.text('Favoris'), findsNothing);
    expect(find.text('Partager'), findsNothing);
    expect(find.text('4,6 · 128 avis'), findsOneWidget);
    expect(find.text('128 avis'), findsOneWidget);
    expect(find.text('Téléphones'), findsNothing,
        reason: 'Buyer Mobile PDP must not render web-style breadcrumbs');
    expect(find.text('Smartphones'), findsNothing);
    expect(find.text('Paiement à la livraison'), findsOneWidget);
    expect(find.text('Livraison assurée par Teka'), findsOneWidget);

    final purchaseBar = tester.getRect(
      find.byKey(const Key('pdp-purchase-bar')),
    );
    expect(purchaseBar.height, lessThan(80));
    expect(
      find.ancestor(
        of: find.text('Paiement à la livraison'),
        matching: find.byKey(const Key('pdp-fulfilment-highlights')),
      ),
      findsOneWidget,
    );
    expect(
      find.ancestor(
        of: find.text('Paiement à la livraison'),
        matching: find.byKey(const Key('pdp-purchase-bar')),
      ),
      findsNothing,
      reason: 'delivery assurances belong in scrollable product content, '
          'not in the sticky purchase bar',
    );

    final disabledButton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Rupture de stock'),
    );
    expect(
      disabledButton.style?.foregroundColor?.resolve(
        const {WidgetState.disabled},
      ),
      TekaColors.mutedForeground,
    );

    final titleBottom = tester.getRect(find.text(_product.title)).bottom;
    final ratingCenter = tester.getCenter(find.text('4,6 · 128 avis'));
    final favoriteCenter = tester.getCenter(find.byIcon(Icons.favorite_border));
    final shareCenter = tester.getCenter(find.byIcon(Icons.ios_share_outlined));
    expect(titleBottom, lessThan(favoriteCenter.dy));
    expect(favoriteCenter.dy, closeTo(ratingCenter.dy, 4));
    expect(shareCenter.dy, closeTo(ratingCenter.dy, 4));
    expect(favoriteCenter.dx, lessThan(shareCenter.dx));

    final discountedPrice =
        tester.widget<Text>(find.text('1.599.999 FC').first);
    expect(discountedPrice.style?.color, TekaColors.foreground);

    await tester.ensureVisible(find.text('4,6 · 128 avis'));
    await tester.tap(find.text('4,6 · 128 avis'));
    await tester.pumpAndSettle();
    expect(find.text('Écran des avis'), findsOneWidget);
  });

  testWidgets('PDP top summary presents the no-review state without zero stars',
      (tester) async {
    await tester.pumpWidget(
      await _harness(
        const ReviewStatsModel(
          avgRating: 0,
          totalReviews: 0,
          distribution: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Aucun avis'), findsOneWidget);
    expect(find.text('0,0'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('PDP remains overflow-free on a small phone with large text',
      (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await tester.pumpWidget(
      await _harness(
        const ReviewStatsModel(
          avgRating: 4.6,
          totalReviews: 128,
          distribution: {1: 0, 2: 1, 3: 4, 4: 40, 5: 83},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text(_product.title), findsOneWidget);
    expect(find.byKey(const Key('pdp-purchase-bar')), findsOneWidget);
  });
}
