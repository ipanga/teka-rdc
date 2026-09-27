import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/products/data/models/category_search_hit.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import 'package:seller_mobile/features/products/presentation/widgets/category_selector.dart';

/// Seller Catalogue Speed-up — category search in the product form.

const _tree = [
  CategoryModel(id: 'super', name: 'Supermarché', subcategories: [
    CategoryModel(id: 'entretien', name: 'Entretien Maison', subcategories: [
      CategoryModel(id: 'lessive', name: 'Lessive'),
      CategoryModel(id: 'javel', name: 'Javel'),
    ]),
    CategoryModel(id: 'bebe', name: 'Bébé', subcategories: [
      CategoryModel(id: 'alim-bebe', name: 'Alimentation bébé'),
    ]),
  ]),
];

class _Repo extends ProductsRepository {
  _Repo() : super(Dio());
  final queries = <String>[];
  bool offline = false;

  @override
  Future<List<CategorySearchHit>> searchCategories(String query) async {
    queries.add(query);
    if (offline) {
      throw DioException(
          requestOptions: RequestOptions(path: '/x'),
          type: DioExceptionType.connectionError);
    }
    if (query.toLowerCase() == 'omo') {
      return const [
        CategorySearchHit(
            id: 'lessive',
            name: 'Lessive',
            path: ['Supermarché', 'Entretien Maison', 'Lessive']),
      ];
    }
    return const [];
  }
}

Future<(_Repo, List<CategoryModel>)> _open(WidgetTester t,
    {bool offline = false}) async {
  final repo = _Repo()..offline = offline;
  final picked = <CategoryModel>[];
  await t.pumpWidget(ProviderScope(
    overrides: [
      categoriesProvider.overrideWith((ref) async => _tree),
      productsRepositoryProvider.overrideWithValue(repo),
    ],
    child: MaterialApp(
      home: Scaffold(
        body: CategorySelector(onCategorySelected: picked.add),
      ),
    ),
  ));
  await t.pump();
  await t.tap(find.byType(CategorySelector));
  await t.pumpAndSettle();
  return (repo, picked);
}

Future<void> _type(WidgetTester t, String q) async {
  await t.enterText(find.byType(TextField), q);
  await t.pump(const Duration(milliseconds: 350)); // debounce
  await t.pumpAndSettle();
}

void main() {
  testWidgets('a brand typed by the seller finds the leaf via the server',
      (t) async {
    final (repo, picked) = await _open(t);
    await _type(t, 'omo');

    expect(repo.queries, ['omo']);
    expect(find.text('Lessive'), findsOneWidget);
    expect(find.text('Supermarché › Entretien Maison'), findsOneWidget);

    await t.tap(find.text('Lessive'));
    await t.pumpAndSettle();
    expect(picked.single.id, 'lessive');
  });

  testWidgets('offline: falls back to a local, accent-insensitive leaf match',
      (t) async {
    final (repo, picked) = await _open(t, offline: true);
    await _type(t, 'bebe');

    expect(repo.queries, ['bebe']);
    // The leaf is offered; the intermediate « Bébé » never is.
    expect(find.text('Alimentation bébé'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Bébé'), findsNothing);

    await t.tap(find.text('Alimentation bébé'));
    await t.pumpAndSettle();
    expect(picked.single.id, 'alim-bebe');
  });

  testWidgets('a one-letter query does not call the server', (t) async {
    final (repo, _) = await _open(t);
    await _type(t, 'l');
    expect(repo.queries, isEmpty);
  });

  test('localCategorySearch matches every word against name + path, leaves only',
      () {
    expect(localCategorySearch(_tree, 'entretien').map((h) => h.id),
        ['lessive', 'javel']);
    expect(localCategorySearch(_tree, 'maison JAVEL').map((h) => h.id), ['javel']);
    expect(localCategorySearch(_tree, 'supermarche').map((h) => h.id),
        ['lessive', 'javel', 'alim-bebe']);
    expect(localCategorySearch(_tree, 'x'), isEmpty);
    expect(normalizeCategoryQuery('  Hygiène & Œufs '), 'hygiene oeufs');
  });
}
