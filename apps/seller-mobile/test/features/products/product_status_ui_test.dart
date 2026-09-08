import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/theme/teka_colors.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/presentation/product_status_ui.dart';

void main() {
  test('only REJECTED asks the seller to act; every status reads in French',
      () {
    for (final s in ProductStatus.values) {
      final ui = ProductStatusUi.of(s);
      expect(ui.sellerActionRequired, s == ProductStatus.rejected,
          reason: s.name);
      for (final text in [ui.label, ui.filterLabel, ui.heading, ui.step]) {
        expect(text, isNotEmpty, reason: s.name);
        expect(text, isNot(contains('_')), reason: s.name);
        expect(text, isNot(equals(productStatusToApi(s))), reason: s.name);
      }
      expect(ui.color, isNot(TekaColors.tekaRed), reason: s.name);
    }
    expect(ProductStatusUi.of(ProductStatus.rejected).actionLabel,
        'À corriger');
  });

  test('tones: neutral drafts, warning review, success live, destructive '
      'rejected and suspended', () {
    expect(ProductStatusUi.of(ProductStatus.draft).color,
        TekaColors.neutralForeground);
    expect(ProductStatusUi.of(ProductStatus.pendingReview).color,
        TekaColors.warningForeground);
    expect(ProductStatusUi.of(ProductStatus.active).color,
        TekaColors.successForeground);
    expect(ProductStatusUi.of(ProductStatus.rejected).color,
        TekaColors.destructiveForeground);
    expect(ProductStatusUi.of(ProductStatus.suspended).color,
        TekaColors.destructiveForeground);
  });

  test('the filter bar covers every status once, « À corriger » first', () {
    expect(productFilterOrder.toSet(), ProductStatus.values.toSet());
    expect(productFilterOrder.length, ProductStatus.values.length);
    expect(productFilterOrder.first, ProductStatus.rejected);
  });

  test('empty copy names the bucket', () {
    expect(productEmptyCopy(null).title, 'Votre catalogue commence ici');
    expect(productEmptyCopy(ProductStatus.rejected).title,
        'Aucun produit à corriger');
    expect(productEmptyCopy(ProductStatus.active).title,
        'Aucun produit en ligne');
  });

  test('discount percentage is derived, never stored, and only when valid', () {
    expect(discountPercent(45000, 40500), 10);
    expect(discountPercent(45000, null), isNull);
    expect(discountPercent(45000, 45000), isNull, reason: 'equal is no promo');
    expect(discountPercent(45000, 50000), isNull);
    expect(discountPercent(0, 10), isNull);
    expect(discountPercent(30000, 20000), 33);
  });
}
