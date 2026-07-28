import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/deep_link/web_links.dart';
import 'package:buyer_mobile/core/providers/core_providers.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';
import 'package:buyer_mobile/core/theme/app_theme.dart';
import 'package:buyer_mobile/core/theme/teka_colors.dart';
import 'package:buyer_mobile/features/catalog/data/catalog_repository.dart';
import 'package:buyer_mobile/features/catalog/data/models/product_model.dart';
import 'package:buyer_mobile/features/catalog/presentation/screens/product_detail_screen.dart';
import 'package:buyer_mobile/features/reviews/data/models/review_model.dart';
import 'package:buyer_mobile/features/reviews/data/reviews_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
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
  slug: 'telephone-intelligent',
  shortCode: 'a1b2c3',
  citySlug: 'lubumbashi',
);

Future<Widget> _harness(ReviewStatsModel stats) async {
  SharedPreferences.setMockInitialValues({});
  final preferences = await SharedPreferences.getInstance();
  final router = GoRouter(
    initialLocation: '/products/${_product.id}',
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
        _CatalogRepository(_product),
      ),
      reviewsRepositoryProvider.overrideWithValue(
        _ReviewsRepository(stats),
      ),
    ],
    child: MaterialApp.router(
      theme: AppTheme.lightTheme,
      routerConfig: router,
    ),
  );
}

void main() {
  setUpAll(FlavorConfig.initialize);

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
    expect(find.text('4,6'), findsOneWidget);
    expect(find.text('128 avis'), findsNWidgets(2));

    final titleBottom = tester.getRect(find.text(_product.title)).bottom;
    final ratingCenter = tester.getCenter(find.text('4,6'));
    final favoriteCenter = tester.getCenter(find.byIcon(Icons.favorite_border));
    final shareCenter = tester.getCenter(find.byIcon(Icons.ios_share_outlined));
    expect(titleBottom, lessThan(favoriteCenter.dy));
    expect(favoriteCenter.dy, closeTo(ratingCenter.dy, 4));
    expect(shareCenter.dy, closeTo(ratingCenter.dy, 4));
    expect(favoriteCenter.dx, lessThan(shareCenter.dx));

    final discountedPrice =
        tester.widget<Text>(find.text('1.599.999 FC').first);
    expect(discountedPrice.style?.color, TekaColors.foreground);

    await tester.ensureVisible(find.text('128 avis').first);
    await tester.tap(find.text('128 avis').first);
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
}
