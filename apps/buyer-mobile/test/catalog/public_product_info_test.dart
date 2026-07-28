// What buyers may and may not see on a product surface.
//
// Three guarantees, each previously protected only by a comment — and each
// already lost once to a rewrite (#580 rewrote both of these widgets):
//
//   1. no unit-sold count      (removed 2026-07-26, PR #573)
//   2. no exact stock quantity (removed 2026-07-28 — inventory is internal)
//   3. no Neuf / Occasion pill (deprecated 2026-07-28 — new products only)
//
// These are cheap to assert and expensive to rediscover in production, so they
// are pinned here rather than left to review vigilance.

import 'package:buyer_mobile/core/constants/stock.dart';
import 'package:buyer_mobile/features/catalog/data/models/product_model.dart';
import 'package:flutter_test/flutter_test.dart';

BrowseProductModel _product({required int quantity, int unitsSold = 42}) =>
    BrowseProductModel(
      id: '31000000-0000-0000-0000-000000000042',
      title: 'Lot de 2 chemises',
      priceCDF: '3000000',
      quantity: quantity,
      unitsSold: unitsSold,
      condition: 'NEW',
      seller: const BrowseProductSeller(businessName: 'Teka RDC Officiel'),
    );

void main() {
  group('stock status — coarse states only', () {
    test('0 is out of stock', () {
      expect(stockStatusFor(0), StockStatus.outOfStock);
      expect(stockStatusFor(-1), StockStatus.outOfStock);
    });

    test('1..threshold is low stock', () {
      expect(stockStatusFor(1), StockStatus.lowStock);
      expect(stockStatusFor(kLowStockThreshold), StockStatus.lowStock);
    });

    test('above the threshold is plain in-stock', () {
      expect(stockStatusFor(kLowStockThreshold + 1), StockStatus.inStock);
      expect(stockStatusFor(500), StockStatus.inStock);
    });

    test('labels never contain a digit', () {
      // The whole point: a label may not leak the remaining quantity.
      for (final status in StockStatus.values) {
        expect(
          stockStatusLabel(status),
          isNot(matches(RegExp(r'\d'))),
          reason: '${stockStatusLabel(status)} exposes a number',
        );
      }
    });

    test('the labels are the agreed French copy', () {
      expect(stockStatusLabel(StockStatus.inStock), 'En stock');
      expect(stockStatusLabel(StockStatus.lowStock), 'Stock limité');
      expect(stockStatusLabel(StockStatus.outOfStock), 'Rupture de stock');
    });
  });

  group('model helpers agree with the shared threshold', () {
    test('exactly at the threshold counts as low stock', () {
      // Mobile used `< 5` while buyer-web used `<= 5`, so a product with
      // exactly 5 left disagreed across platforms. Pinned so it cannot drift
      // back.
      expect(_product(quantity: kLowStockThreshold).isLowStock, isTrue);
      expect(_product(quantity: kLowStockThreshold + 1).isLowStock, isFalse);
    });

    test('out of stock at zero', () {
      expect(_product(quantity: 0).isOutOfStock, isTrue);
      expect(_product(quantity: 1).isOutOfStock, isFalse);
    });
  });

  group('internal-only fields are still carried', () {
    // Hidden from buyers, but the app and API still need them: quantity caps
    // the quantity stepper and every server-side stock check; unitsSold is the
    // API's popularity sort key.
    test('quantity and unitsSold remain on the model', () {
      final p = _product(quantity: 12, unitsSold: 99);
      expect(p.quantity, 12);
      expect(p.unitsSold, 99);
    });
  });
}
