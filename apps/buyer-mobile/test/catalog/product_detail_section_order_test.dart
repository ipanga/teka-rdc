// Product-detail section order (2026-07-28, Priority 4).
//
// Seller info was moved to sit *immediately before* the ratings and reviews it
// contextualises — a buyer reads "who is selling this" and then "what did other
// buyers think", in that order.
//
// The change itself was a pure block move (66 lines out, 66 lines in) with no
// behaviour of its own, which is precisely why it needs pinning: the next
// rewrite of this screen has nothing to fail if the order silently reverts. It
// has already happened once — #580 rewrote this file and undid guarantees that
// were protected only by comments.
//
// The body is a `SingleChildScrollView`, so every section is laid out even when
// far below the fold. That makes the order assertable here rather than only on
// a device, where verifying it needs a physical scroll.

import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/providers/core_providers.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';
import 'package:buyer_mobile/core/theme/app_theme.dart';
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
  _ReviewsRepository() : super(Dio());

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
  Future<ReviewStatsModel> getReviewStats(String productId) async =>
      const ReviewStatsModel(
        avgRating: 4.5,
        totalReviews: 12,
        distribution: {1: 0, 2: 0, 3: 1, 4: 4, 5: 7},
      );

  @override
  Future<CanReviewModel> canReview(String productId) async =>
      const CanReviewModel(canReview: false);

  @override
  Future<ReviewModel?> getMyReview(String productId) async => null;
}

// Every optional section populated, so all four headings are present at once —
// an ordering assertion is only meaningful when nothing is missing.
const _product = ProductDetailModel(
  id: '31000000-0000-0000-0000-000000000186',
  title: 'Lot de 2 chemises de bureau',
  description: 'Coton respirant, coupe ajustée, manches longues.',
  priceCDF: '3500000',
  condition: 'NEW',
  quantity: 8,
  seller: BrowseProductSeller(
    id: 'seller-1',
    businessName: 'Teka RDC Officiel',
  ),
  specifications: [
    ProductSpecification(name: 'Matière', value: 'Coton'),
    ProductSpecification(name: 'Taille', value: 'L'),
  ],
  slug: 'lot-de-2-chemises-de-bureau',
  shortCode: 'h0d799',
  citySlug: 'lubumbashi',
);

Future<Widget> _harness() async {
  SharedPreferences.setMockInitialValues({});
  final preferences = await SharedPreferences.getInstance();
  final router = GoRouter(
    initialLocation: '/products/${_product.shortCode}',
    routes: [
      GoRoute(
        path: '/products/:id',
        builder: (_, state) => ProductDetailScreen(
          identifier: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/products/:id/reviews',
        builder: (_, __) => const Scaffold(body: Text('Écran des avis')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(preferences),
      tokenStorageProvider.overrideWithValue(_GuestTokenStorage()),
      catalogRepositoryProvider.overrideWithValue(_CatalogRepository(_product)),
      reviewsRepositoryProvider.overrideWithValue(_ReviewsRepository()),
    ],
    child: MaterialApp.router(
      theme: AppTheme.lightTheme,
      routerConfig: router,
    ),
  );
}

void main() {
  setUpAll(FlavorConfig.initialize);

  testWidgets('seller info sits between the specifications and the reviews',
      (tester) async {
    await tester.pumpWidget(await _harness());
    await tester.pumpAndSettle();

    double topOf(String label) => tester.getRect(find.text(label).first).top;

    final details = topOf('Détails du produit');
    final specs = topOf('Caractéristiques');
    final seller = topOf('Vendeur: ');
    // The loaded state heads the section with the count; a bare "Avis" is the
    // stats-failed branch, which would make this assertion vacuous.
    final reviews = topOf('Avis (12)');

    expect(details, lessThan(specs));
    expect(specs, lessThan(seller),
        reason: 'seller info must come after the characteristics table');
    expect(seller, lessThan(reviews),
        reason: 'seller info must come immediately BEFORE the reviews — the '
            'whole point of the move');
  });

  testWidgets('nothing was lost in the move', (tester) async {
    // A block move is the easiest way to drop a widget by accident: the
    // deleted range and the inserted range are edited independently.
    await tester.pumpWidget(await _harness());
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Teka RDC Officiel'), findsOneWidget);
    expect(find.text('Officiel'), findsOneWidget); // platform-seller badge
    expect(find.byIcon(Icons.storefront_outlined), findsOneWidget);
    expect(find.byIcon(Icons.verified), findsOneWidget);
    expect(find.text('Matière'), findsOneWidget);
    expect(find.text('Coton'), findsOneWidget);

    // Exactly one seller block — a move that copied instead of moving would
    // render two, and both would look right in a screenshot.
    expect(find.text('Vendeur: '), findsOneWidget);
  });
}
