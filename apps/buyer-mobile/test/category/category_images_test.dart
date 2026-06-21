import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/features/catalog/data/category_images.dart';
import 'package:buyer_mobile/features/catalog/data/models/category_model.dart';

void main() {
  group('categoryImageAsset (bundled top-category icons)', () {
    test('maps each of the 7 top-category slugs to a bundled asset', () {
      const slugs = [
        'supermarche',
        'telephones-et-accessoires',
        'electromenager',
        'mode',
        'beaute-et-sante',
        'construction-et-bricolage',
        'automobile-et-moto',
      ];
      for (final slug in slugs) {
        final asset = categoryImageAsset(slug);
        expect(asset, isNotNull, reason: 'missing icon for $slug');
        expect(asset, 'assets/categories/$slug.png');
      }
    });

    test('returns null for subcategories / unknown / null (emoji fallback)', () {
      expect(categoryImageAsset('smartphones'), isNull);
      expect(categoryImageAsset(null), isNull);
    });
  });

  test('CategoryModel parses slug from the API payload', () {
    final cat = CategoryModel.fromJson(const {
      'id': '13000000-0000-0000-0000-000000000001',
      'name': 'Supermarché',
      'slug': 'supermarche',
      'emoji': '🛒',
      'productCount': 12,
    });
    expect(cat.slug, 'supermarche');
    expect(categoryImageAsset(cat.slug), 'assets/categories/supermarche.png');
  });
}
