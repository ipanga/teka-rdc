// PR D3 (2026-09-07) — Teka sells new products only: the « Neuf / Occasion »
// chips are gone from the category screen and `FilterOptions` no longer
// carries a condition at all, so no stale value can be sent.
import 'dart:io';

import 'package:buyer_mobile/features/catalog/presentation/providers/catalog_provider.dart';
import 'package:buyer_mobile/features/catalog/presentation/widgets/filter_bottom_sheet.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('FilterOptions has no product-condition facet', () {
    const f = FilterOptions();
    expect(f.toString(), isNot(contains('condition')));
    expect(f.activeCount, 0);
    // A sort/price filter still counts — the counter did not lose meaning.
    expect(const FilterOptions(sortBy: 'price_asc').activeCount, 1);
  });

  test('BrowseProductsParams carries no condition (nothing to send)', () {
    const p = BrowseProductsParams(categoryId: 'c1');
    expect(p.toString(), isNot(contains('condition')));
    // Identity still works for the provider family key.
    expect(p, const BrowseProductsParams(categoryId: 'c1'));
    expect(p.hashCode, const BrowseProductsParams(categoryId: 'c1').hashCode);
  });

  test('the category screen no longer references the obsolete filter', () {
    // Guards against the chips being reintroduced by a copy/paste.
    final source = File(
      'lib/features/catalog/presentation/screens/category_screen.dart',
    ).readAsStringSync();
    expect(source.contains("'USED'"), isFalse);
    expect(source.contains('Occasion'), isFalse);
    expect(source.contains('conditionBar'), isFalse);
  });
}
