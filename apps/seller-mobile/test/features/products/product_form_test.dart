import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/products/data/models/attribute_model.dart';
import 'package:seller_mobile/features/products/data/models/brand_option_model.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import 'package:seller_mobile/features/products/presentation/screens/product_form_screen.dart';
import 'package:seller_mobile/features/products/presentation/widgets/brand_selector.dart';
import 'package:seller_mobile/features/products/presentation/widgets/category_selector.dart';
import '../../support/seller_dashboard_fixtures.dart';

/// Taxonomy fixture: Mode › Homme › Chemises (leaf) and a second leaf.
/// « Homme » is an intermediate node — a legacy product may still sit on it.
const _tree = [
  CategoryModel(id: 'mode', name: 'Mode', subcategories: [
    CategoryModel(id: 'homme', name: 'Homme', subcategories: [
      CategoryModel(id: 'chemises', name: 'Chemises'),
      CategoryModel(id: 'pantalons', name: 'Pantalons'),
    ]),
  ]),
];

class _Repo extends ProductsRepository {
  _Repo() : super(Dio());
  final attributeCalls = <String>[];
  final brandCalls = <String>[];
  final created = <Map<String, dynamic>>[];
  final updated = <Map<String, dynamic>>[];
  Object? failSaveWith;
  bool holdSave = false;

  @override
  Future<List<AttributeModel>> getCategoryAttributes(String categoryId) async {
    attributeCalls.add(categoryId);
    return switch (categoryId) {
      'chemises' => const [
          AttributeModel(
              id: 'taille',
              categoryId: 'chemises',
              name: 'Taille',
              type: 'SELECT',
              options: ['S', 'M', 'L'],
              isRequired: true),
          AttributeModel(
              id: 'matiere', categoryId: 'chemises', name: 'Matière', type: 'TEXT'),
        ],
      'pantalons' => const [
          AttributeModel(
              id: 'longueur', categoryId: 'pantalons', name: 'Longueur', type: 'NUMERIC'),
        ],
      _ => const [],
    };
  }

  @override
  Future<List<BrandOption>> getBrands(String categoryId) async {
    brandCalls.add(categoryId);
    return [
      for (var i = 0; i < 9; i++) BrandOption(id: 'b$i', name: 'Marque $i'),
      const BrandOption(id: 'autre', name: 'Autre'),
    ];
  }

  @override
  Future<PaginatedResponse<SellerProductModel>> getProducts(
          {int page = 1, int limit = 20, String? status, String? search}) async =>
      PaginatedResponse(items: const [], total: 0, page: page, limit: limit);

  @override
  Future<SellerProductModel> createProduct(Map<String, dynamic> data) async {
    if (holdSave) await Future<void>.delayed(const Duration(seconds: 5));
    if (failSaveWith != null) throw failSaveWith!;
    created.add(data);
    return _saved('new-1', data, ProductStatus.draft);
  }

  @override
  Future<SellerProductModel> updateProduct(
      String id, Map<String, dynamic> data) async {
    if (failSaveWith != null) throw failSaveWith!;
    updated.add(data);
    return _saved(id, data, ProductStatus.draft);
  }
}

SellerProductModel _saved(
        String id, Map<String, dynamic> data, ProductStatus status) =>
    SellerProductModel(
      id: id,
      title: data['title'] as String,
      description: data['description'] as String,
      categoryId: data['categoryId'] as String,
      brandId: data['brandId'] as String?,
      priceCDF: data['priceCDF'] as String,
      discountPriceCDF: data['discountPriceCDF'] as String?,
      quantity: data['quantity'] as int,
      condition: ProductCondition.newItem,
      status: status,
      createdAt: DateTime(2026, 9, 8),
    );

SellerProductModel _existing({String categoryId = 'chemises'}) =>
    SellerProductModel(
      id: 'p1',
      title: 'Chemise homme en lin',
      description: 'Lin léger.',
      categoryId: categoryId,
      brandId: 'b2',
      priceCDF: '4500000',
      discountPriceCDF: '4050000',
      quantity: 5,
      condition: ProductCondition.newItem,
      status: ProductStatus.draft,
      specifications: const [
        ProductSpecificationModel(attributeId: 'taille', value: 'M'),
      ],
      createdAt: DateTime(2026, 9, 8),
    );

Future<(_Repo, GoRouter)> _pump(WidgetTester tester,
    {SellerProductModel? product,
    double width = 390,
    double height = 844,
    double scale = 1}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final repo = _Repo();
  final router = GoRouter(initialLocation: '/form', routes: [
    GoRoute(path: '/form', builder: (_, __) => ProductFormScreen(product: product)),
    GoRoute(
        path: '/products/:id',
        builder: (_, s) =>
            Scaffold(body: Text('Détail ${s.pathParameters['id']}'))),
  ]);
  addTearDown(router.dispose);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      authProvider.overrideWith((_) => FixtureAuthNotifier()),
      categoriesProvider.overrideWith((ref) async => _tree),
      productsRepositoryProvider.overrideWithValue(repo),
      if (product != null)
        productDetailProvider(product.id).overrideWith((ref) async => product),
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

/// The form is a lazy ListView: a field above the viewport is not built, so
/// look upwards first, then downwards, then bring it fully into view.
Future<void> _scrollTo(WidgetTester tester, Finder f) async {
  final scrollable = find.byType(Scrollable).first;
  if (f.evaluate().isEmpty) {
    try {
      await tester.scrollUntilVisible(f, -200,
          scrollable: scrollable, maxScrolls: 30);
    } catch (_) {}
  }
  if (f.evaluate().isEmpty) {
    await tester.scrollUntilVisible(f, 200, scrollable: scrollable);
  }
  await tester.ensureVisible(f);
  await tester.pump();
  // ensureVisible aligns the top; a widget near the end of the list can
  // still hang below the viewport, and the lazy list's max extent is only
  // exact after another layout pass — so nudge, re-measure, repeat.
  final viewport = tester.view.physicalSize.height / tester.view.devicePixelRatio;
  for (var i = 0; i < 4; i++) {
    final rect = tester.getRect(f);
    if (rect.bottom <= viewport - 8) break;
    await tester.drag(scrollable, Offset(0, -(rect.bottom - viewport + 40)));
    await tester.pump();
    await tester.pump();
  }
}

/// Taps the save button after letting any previous snackbar leave (a
/// floating snackbar covers the button at the bottom of a phone).
Future<void> _save(WidgetTester tester, String label) async {
  await tester.pump(const Duration(seconds: 5));
  await tester.pumpAndSettle();
  await _scrollTo(tester, find.text(label));
  await tester.tap(find.text(label));
  await tester.pumpAndSettle();
}

Future<void> _pickCategory(WidgetTester tester, String leaf) async {
  await _scrollTo(tester, find.byType(CategorySelector));
  await tester.tap(find.byType(CategorySelector));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Mode'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Homme'));
  await tester.pumpAndSettle();
  await tester.tap(find.text(leaf));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('create: category is required inline, not as a snackbar, and '
      'the form scrolls to it', (tester) async {
    final (repo, _) = await _pump(tester);
    expect(find.textContaining('Les photos s’ajoutent à l’étape suivante'),
        findsOneWidget);
    await _save(tester, 'Enregistrer et ajouter des photos');
    expect(find.text('Choisissez un type de produit.'), findsOneWidget);
    expect(repo.created, isEmpty);
  });

  testWidgets('leaf category only: choosing a product type loads its '
      'characteristics and brands; changing it clears both', (tester) async {
    final (repo, _) = await _pump(tester);
    await _pickCategory(tester, 'Chemises');
    expect(find.text('Mode > Homme > Chemises'), findsOneWidget);
    expect(repo.attributeCalls, ['chemises']);
    expect(repo.brandCalls, ['chemises']);
    await _scrollTo(tester, find.text('Taille *'));
    expect(find.text('Matière'), findsOneWidget);
    expect(find.text('Type de peau'), findsNothing);
    // Pick a brand, then switch category: brand and specs must reset.
    await _scrollTo(tester, find.text('Sans marque'));
    await tester.tap(find.byType(BrandSelector));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Marque 3'));
    await tester.pumpAndSettle();
    expect(find.text('Marque 3'), findsOneWidget);
    await _pickCategory(tester, 'Pantalons');
    expect(repo.attributeCalls, ['chemises', 'pantalons']);
    expect(find.text('Marque 3'), findsNothing);
    await _scrollTo(tester, find.text('Longueur'));
    expect(find.text('Taille *'), findsNothing);
  });

  testWidgets('brand sheet: searchable, « Sans marque » first, « Autre » '
      'from the API, no global list', (tester) async {
    await _pump(tester);
    await _pickCategory(tester, 'Chemises');
    await _scrollTo(tester, find.text('Sans marque'));
    await tester.tap(find.byType(BrandSelector));
    await tester.pumpAndSettle();
    expect(find.text('Choisir une marque'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'autre');
    await tester.pumpAndSettle();
    expect(find.text('Autre'), findsOneWidget, reason: 'from the API');
    await tester.enterText(find.byType(TextField).last, 'marque 7');
    await tester.pumpAndSettle();
    expect(find.text('Marque 7'), findsOneWidget);
    expect(find.text('Marque 1'), findsNothing);
    await tester.enterText(find.byType(TextField).last, 'zzz');
    await tester.pumpAndSettle();
    expect(find.textContaining('Aucune marque pour « zzz »'), findsOneWidget);
  });

  testWidgets('legacy product on an intermediate category: warned, not '
      'blocked, and no foreign characteristics', (tester) async {
    final (repo, _) = await _pump(tester, product: _existing(categoryId: 'homme'));
    await _scrollTo(tester, find.text('Mode > Homme'));
    expect(find.textContaining('« Homme » est une catégorie générale'),
        findsOneWidget);
    await _scrollTo(tester, find.text('Aucune caractéristique pour cette catégorie'));
    expect(find.text('Type de peau'), findsNothing);
    await _save(tester, 'Enregistrer les modifications');
    expect(repo.updated.single['categoryId'], 'homme',
        reason: 'the API decides; the form never guesses a child');
  });

  testWidgets('edit is prefilled from the same fields create writes',
      (tester) async {
    final (repo, _) = await _pump(tester, product: _existing());
    expect(find.text('Chemise homme en lin'), findsOneWidget);
    await _scrollTo(tester, find.text('Marque 2'));
    await _scrollTo(tester, find.text('−10 % · Vous économisez 4.500 FC'));
    expect(find.text('45.000 FC'), findsOneWidget, reason: 'FC preview');
    await _save(tester, 'Enregistrer les modifications');
    final data = repo.updated.single;
    expect(data['priceCDF'], '4500000');
    expect(data['discountPriceCDF'], '4050000');
    expect(data['brandId'], 'b2');
    expect(data['quantity'], 5);
    expect(data['condition'], 'NEW');
    expect(data['specifications'], [
      {'attributeId': 'taille', 'value': 'M'}
    ]);
  });

  testWidgets('promo must stay below the price; clearing it sends null on edit',
      (tester) async {
    final (repo, _) = await _pump(tester, product: _existing());
    await _scrollTo(tester, find.text('Prix promotionnel FC'));
    final promo = find.widgetWithText(TextFormField, 'Prix promotionnel FC');
    await tester.enterText(promo, '45000');
    await _save(tester, 'Enregistrer les modifications');
    expect(find.text('Corrigez les champs signalés en rouge.'), findsOneWidget);
    await _scrollTo(tester, find.text('Doit être inférieur au prix normal'));
    expect(repo.updated, isEmpty);
    await _scrollTo(tester, find.text('Prix promotionnel FC'));
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Prix promotionnel FC'), '');
    await _save(tester, 'Enregistrer les modifications');
    expect(repo.updated.single.containsKey('discountPriceCDF'), isTrue);
    expect(repo.updated.single['discountPriceCDF'], isNull);
  });

  testWidgets('quantity: required, non-negative, zero allowed', (tester) async {
    final (repo, _) = await _pump(tester, product: _existing());
    await _scrollTo(tester, find.text('Quantité disponible'));
    final qty = find.widgetWithText(TextFormField, 'Quantité disponible');
    await tester.enterText(qty, '');
    await _save(tester, 'Enregistrer les modifications');
    await _scrollTo(tester, find.text('Quantité requise'));
    expect(find.text('Quantité requise'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Quantité disponible'), '0');
    await _save(tester, 'Enregistrer les modifications');
    expect(repo.updated.single['quantity'], 0);
  });

  testWidgets('create: busy guard, then the new product opens for photos',
      (tester) async {
    final (repo, router) = await _pump(tester);
    await _pickCategory(tester, 'Pantalons');
    await _scrollTo(tester, find.text('Titre'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Titre'), 'Pantalon');
    // The API requires a description: the form says so before the round-trip.
    await _save(tester, 'Enregistrer et ajouter des photos');
    await _scrollTo(tester, find.text('Description requise'));
    expect(repo.created, isEmpty);
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Description'), 'Coton léger.');
    await _scrollTo(tester, find.text('Longueur'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Longueur'), '100');
    await _scrollTo(tester, find.text('Prix FC'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Prix FC'), '45000');
    await _scrollTo(tester, find.text('Quantité disponible'));
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Quantité disponible'), '4');
    repo.holdSave = true;
    // Let the earlier validation snackbar leave before tapping the button.
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await _scrollTo(tester, find.text('Enregistrer et ajouter des photos'));
    await tester.tap(find.text('Enregistrer et ajouter des photos'));
    await tester.pump();
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(
        tester
            .widget<ElevatedButton>(find.byType(ElevatedButton).last)
            .onPressed,
        isNull,
        reason: 'no second submission while saving');
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    expect(repo.created.length, 1);
    expect(repo.created.single['categoryId'], 'pantalons');
    expect(repo.created.single['specifications'], [
      {'attributeId': 'longueur', 'value': '100'}
    ]);
    expect(router.routerDelegate.currentConfiguration.uri.toString(),
        '/products/new-1');
  });

  testWidgets('save failure keeps the form and shows the API’s reason',
      (tester) async {
    final (repo, router) = await _pump(tester, product: _existing());
    repo.failSaveWith = DioException(
      requestOptions: RequestOptions(path: '/x'),
      response: Response(
          requestOptions: RequestOptions(path: '/x'),
          statusCode: 400,
          data: {
            'success': false,
            'error': {
              'status': 400,
              'message':
                  '« Homme » est une catégorie intermédiaire. Choisissez une sous-catégorie plus précise.'
            }
          }),
      type: DioExceptionType.badResponse,
    );
    await _save(tester, 'Enregistrer les modifications');
    expect(find.textContaining('catégorie intermédiaire'), findsOneWidget);
    await _scrollTo(tester, find.text('Chemise homme en lin'));
    expect(find.text('Chemise homme en lin'), findsOneWidget,
        reason: 'the form keeps its values');
    expect(router.routerDelegate.currentConfiguration.uri.toString(), '/form');
  });

  for (final (width, scale) in [(320.0, 1.5), (360.0, 1.3), (600.0, 1.0), (1024.0, 1.0), (1280.0, 1.5)]) {
    testWidgets('edit form fits $width at $scale× in a readable column',
        (tester) async {
      await _pump(tester, product: _existing(), width: width, scale: scale);
      await _scrollTo(tester, find.text('Enregistrer les modifications'));
      final field = tester.getRect(find.byType(TextFormField).first);
      expect(field.width, lessThanOrEqualTo(720));
      expect(tester.takeException(), isNull);
    });
  }
}
