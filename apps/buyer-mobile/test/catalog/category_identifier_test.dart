// A7 (2026-09-06) — a category reached from a web URL / banner / deep link
// carries its public slug; the browse APIs need the id.
import 'package:buyer_mobile/features/catalog/data/models/category_model.dart';
import 'package:buyer_mobile/features/catalog/domain/category_identifier.dart';
import 'package:flutter_test/flutter_test.dart';

const _tree = [
  CategoryModel(
    id: '13000000-0000-0000-0000-000000000001',
    name: 'Téléphones & Électronique',
    slug: 'telephones-et-electronique',
    subcategories: [
      CategoryModel(
        id: '13000000-0000-0000-0000-000000000011',
        name: 'Smartphones',
        slug: 'smartphones',
        subcategories: [
          CategoryModel(
            id: '16000000-0000-0000-0000-000000000111',
            name: 'Android',
            slug: 'android',
          ),
        ],
      ),
    ],
  ),
];

void main() {
  test('isCategoryUuid tells ids from slugs', () {
    expect(isCategoryUuid('13000000-0000-0000-0000-000000000001'), isTrue);
    expect(isCategoryUuid('13000000-0000-0000-0000-00000000000A'), isTrue);
    expect(isCategoryUuid('smartphones'), isFalse);
    expect(isCategoryUuid(''), isFalse);
  });

  test('finds a node by id at any depth', () {
    expect(findCategoryNode(_tree, '16000000-0000-0000-0000-000000000111')?.name,
        'Android');
  });

  test('finds a node by slug at any depth, case-insensitively', () {
    expect(findCategoryNode(_tree, 'smartphones')?.id,
        '13000000-0000-0000-0000-000000000011');
    expect(findCategoryNode(_tree, 'ANDROID')?.name, 'Android');
    expect(findCategoryNode(_tree, 'telephones-et-electronique')?.name,
        'Téléphones & Électronique');
  });

  test('unknown identifiers resolve to nothing', () {
    expect(findCategoryNode(_tree, 'nope'), isNull);
    expect(findCategoryNode(_tree, ''), isNull);
  });
}
