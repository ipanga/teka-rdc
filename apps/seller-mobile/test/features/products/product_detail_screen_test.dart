import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/screens/product_detail_screen.dart';
import '../../support/seller_dashboard_fixtures.dart';

class _Repo extends ProductsRepository {
  _Repo(this.product) : super(Dio());
  SellerProductModel product;
  bool holdDetail = false;
  final detailFetches = <Completer<SellerProductModel>>[];
  int submits = 0;
  int archives = 0;
  Object? failWith;

  @override
  Future<SellerProductModel> getProduct(String id) {
    if (!holdDetail) return Future.value(product);
    final c = Completer<SellerProductModel>();
    detailFetches.add(c);
    return c.future;
  }

  @override
  Future<PaginatedResponse<SellerProductModel>> getProducts(
          {int page = 1, int limit = 20, String? status, String? search}) async =>
      PaginatedResponse(items: const [], total: 0, page: page, limit: limit);

  @override
  Future<SellerProductModel> submitForReview(String id) async {
    submits++;
    if (failWith != null) throw failWith!;
    product = _copy(product, ProductStatus.pendingReview);
    return product;
  }

  @override
  Future<void> archiveProduct(String id) async {
    archives++;
    product = _copy(product, ProductStatus.archived);
  }
}

SellerProductModel _copy(SellerProductModel p, ProductStatus status) =>
    SellerProductModel(
      id: p.id,
      title: p.title,
      description: p.description,
      categoryId: p.categoryId,
      priceCDF: p.priceCDF,
      discountPriceCDF: p.discountPriceCDF,
      quantity: p.quantity,
      condition: p.condition,
      status: status,
      images: p.images,
      specifications: p.specifications,
      createdAt: p.createdAt,
    );

SellerProductModel _product(ProductStatus status,
        {int images = 2, String? reason, String? discount}) =>
    SellerProductModel(
      id: 'p1',
      title: 'Robe Wax Africaine - Taille M',
      description: 'Tissu wax, coupe droite.',
      categoryId: 'c1',
      priceCDF: '4500000',
      discountPriceCDF: discount,
      quantity: 3,
      condition: ProductCondition.newItem,
      status: status,
      rejectionReason: reason,
      images: [
        for (var i = 0; i < images; i++)
          ProductImageModel(
              id: 'i$i', url: 'https://example.test/$i.jpg', displayOrder: i),
      ],
      specifications: const [
        ProductSpecificationModel(
            attributeId: 'a', attributeName: 'Taille', value: 'M'),
      ],
      category: const CategoryModel(id: 'c1', name: 'Robes'),
      cityName: 'Lubumbashi',
      createdAt: DateTime(2026, 9, 8),
    );

Future<(_Repo, GoRouter)> _pump(WidgetTester tester, SellerProductModel product,
    {double width = 390, double scale = 1, bool hold = false}) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final repo = _Repo(product)..holdDetail = hold;
  final router = GoRouter(initialLocation: '/products/p1', routes: [
    GoRoute(
        path: '/products',
        builder: (_, __) => const Scaffold(body: Text('Liste des produits'))),
    GoRoute(
        path: '/products/:id',
        builder: (_, s) =>
            ProductDetailScreen(productId: s.pathParameters['id']!)),
    GoRoute(
        path: '/products/:id/edit',
        builder: (_, __) => const Scaffold(body: Text('Formulaire'))),
    GoRoute(
        path: '/products/:id/images',
        builder: (_, __) => const Scaffold(body: Text('Gestion des photos'))),
  ]);
  addTearDown(router.dispose);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      authProvider.overrideWith((_) => FixtureAuthNotifier()),
      productsRepositoryProvider.overrideWithValue(repo),
    ],
    child: MaterialApp.router(
      theme: AppTheme.lightTheme,
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      routerConfig: router,
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!),
    ),
  ));
  await tester.pump();
  await tester.pump();
  return (repo, router);
}

Future<void> _scrollTo(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(f, 300,
      scrollable: find.byType(Scrollable).first);
  await tester.ensureVisible(f);
  await tester.pump();
}

void main() {
  testWidgets('first paint is a skeleton, not a spinner', (tester) async {
    final (repo, _) = await _pump(tester, _product(ProductStatus.draft),
        hold: true);
    expect(find.byType(ProductDetailSkeleton), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    repo.detailFetches.single.complete(repo.product);
    await tester.pump();
    await tester.pump();
    expect(find.byType(ProductDetailSkeleton), findsNothing);
    expect(find.text('Robe Wax Africaine - Taille M'), findsOneWidget);
  });

  testWidgets('rejected: strip explains, shows Teka’s reason and the one CTA '
      'opens the form', (tester) async {
    await _pump(
        tester,
        _product(ProductStatus.rejected,
            reason: 'Photos floues, ajoutez une vue de face.'));
    expect(find.text('Correction requise'), findsOneWidget);
    expect(find.text('Motif indiqué par Teka'), findsOneWidget);
    expect(find.text('Photos floues, ajoutez une vue de face.'), findsOneWidget);
    await _scrollTo(tester, find.text('Corriger et resoumettre'));
    expect(find.text('Soumettre pour révision'), findsNothing);
    await tester.tap(find.text('Corriger et resoumettre'));
    await tester.pumpAndSettle();
    expect(find.text('Formulaire'), findsOneWidget,
        reason: 'the edit form is pushed');
  });

  testWidgets('promo and stock read on the detail; the cover is labelled',
      (tester) async {
    await _pump(tester, _product(ProductStatus.active, discount: '4050000'));
    expect(find.text('40.500 FC'), findsOneWidget);
    expect(find.text('−10 %'), findsOneWidget);
    expect(find.text('Stock : 3'), findsOneWidget);
    expect(find.text('Couverture'), findsOneWidget);
    expect(find.text('Photos · 2 / 8'), findsOneWidget);
    expect(find.text('Gérer'), findsOneWidget,
        reason: 'an online product can manage its photos too');
    expect(find.text('Neuf'), findsNothing, reason: 'condition is not shown');
  });

  group('actions by status', () {
    for (final (status, labels) in [
      (ProductStatus.draft, ['Soumettre pour révision', 'Modifier le produit']),
      (ProductStatus.pendingReview, ['Retirer de la révision', 'Dupliquer']),
      (ProductStatus.active, ['Modifier le produit', 'Archiver', 'Dupliquer']),
      (ProductStatus.archived, ['Restaurer', 'Dupliquer']),
      (ProductStatus.suspended, ['Dupliquer']),
    ]) {
      testWidgets('${status.name}: ${labels.join(' / ')}', (tester) async {
        await _pump(tester, _product(status));
        await tester.scrollUntilVisible(find.text(labels.last), 300,
            scrollable: find.byType(Scrollable).first);
        for (final l in labels) {
          expect(find.text(l), findsOneWidget, reason: l);
        }
        expect(find.byType(ElevatedButton).evaluate().length +
            find.byType(OutlinedButton).evaluate().length,
            labels.length);
      });
    }
  });

  testWidgets('draft without photos: submit is refused client-side with a '
      'pointer to the photos', (tester) async {
    final (repo, _) = await _pump(tester, _product(ProductStatus.draft, images: 0));
    expect(find.text('Ajouter des photos'), findsOneWidget);
    await _scrollTo(tester, find.text('Soumettre pour révision'));
    await tester.tap(find.text('Soumettre pour révision'));
    await tester.pumpAndSettle();
    expect(find.text('Ajoutez au moins une photo avant de soumettre le produit.'),
        findsOneWidget);
    expect(repo.submits, 0);
  });

  testWidgets('submit: specific dialog, busy guard, then the status moves to '
      'review', (tester) async {
    final (repo, _) = await _pump(tester, _product(ProductStatus.draft));
    await _scrollTo(tester, find.text('Soumettre pour révision'));
    await tester.tap(find.text('Soumettre pour révision'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Teka examinera la fiche'), findsOneWidget);
    final button = find.descendant(
        of: find.byType(AlertDialog),
        matching: find.widgetWithText(ElevatedButton, 'Soumettre'));
    await tester.tap(button);
    await tester.tap(button, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(repo.submits, 1);
    expect(find.text('En cours de révision'), findsOneWidget);
    expect(find.text('Retirer de la révision'), findsOneWidget);
  });

  testWidgets('submit failure shows the API’s French reason and keeps the '
      'draft actions', (tester) async {
    final (repo, _) = await _pump(tester, _product(ProductStatus.draft));
    repo.failWith = DioException(
      requestOptions: RequestOptions(path: '/x'),
      response: Response(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: 400,
          data: {
            'success': false,
            'error': {'status': 400, 'message': 'Le prix doit être supérieur à 0.'}
          }),
      type: DioExceptionType.badResponse,
    );
    await _scrollTo(tester, find.text('Soumettre pour révision'));
    await tester.tap(find.text('Soumettre pour révision'));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(
        of: find.byType(AlertDialog),
        matching: find.widgetWithText(ElevatedButton, 'Soumettre')));
    await tester.pumpAndSettle();
    expect(find.text('Le prix doit être supérieur à 0.'), findsOneWidget);
    expect(find.text('Soumettre pour révision'), findsOneWidget);
  });

  testWidgets('archive: explains reversibility, then returns to the list',
      (tester) async {
    final (repo, router) = await _pump(tester, _product(ProductStatus.active));
    await _scrollTo(tester, find.text('Archiver'));
    await tester.tap(find.text('Archiver'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Vous pourrez le restaurer'), findsOneWidget);
    await tester.tap(find.descendant(
        of: find.byType(AlertDialog),
        matching: find.widgetWithText(ElevatedButton, 'Archiver')));
    await tester.pumpAndSettle();
    expect(repo.archives, 1);
    expect(router.routerDelegate.currentConfiguration.uri.toString(),
        '/products');
  });

  for (final (width, scale) in [(320.0, 1.5), (412.0, 1.3), (834.0, 1.0), (1280.0, 1.0)]) {
    testWidgets('detail fits $width at $scale×', (tester) async {
      await _pump(
          tester, _product(ProductStatus.rejected, reason: 'Motif de test', discount: '4050000'),
          width: width, scale: scale);
      final title = tester.getRect(find.text('Robe Wax Africaine - Taille M'));
      expect(title.width, lessThanOrEqualTo(720));
      await _scrollTo(tester, find.text('Corriger et resoumettre'));
      expect(tester.takeException(), isNull);
    });
  }
}
