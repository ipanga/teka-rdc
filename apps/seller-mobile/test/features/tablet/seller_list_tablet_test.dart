import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/layout/responsive.dart';

import '../lists/seller_lists_test.dart' show pumpScreen;

/// Orders and Products are the two screens a seller lives in. On a tablet they
/// are centred in a readable column rather than turned into a multi-column
/// grid: the cards are variable-height (a title wraps to three lines, the meta
/// row wraps, an order carries a different number of lines), so a fixed-extent
/// grid would clip or stretch them, and a masonry layout would break the lazy
/// pagination both lists rely on.
///
/// These tests pin the width of a rendered card at phone and tablet widths.
double _cardWidth(WidgetTester tester) {
  return tester.getSize(find.byType(Card).first).width;
}

void main() {
  for (final products in [false, true]) {
    final label = products ? 'products' : 'orders';

    testWidgets('$label: a card spans a phone edge to edge, as before',
        (tester) async {
      for (final width in <double>[320, 360, 390, 412]) {
        await pumpScreen(tester, products: products, width: width);
        // 16 pt list padding on each side, unchanged from before.
        expect(_cardWidth(tester), width - 32, reason: '$label at $width');
      }
    });

    testWidgets('$label: cards are capped on a tablet instead of stretching',
        (tester) async {
      for (final width in <double>[768, 834, 1024, 1280, 1366]) {
        await pumpScreen(tester, products: products, width: width);
        final measured = _cardWidth(tester);
        expect(measured, lessThanOrEqualTo(readableMaxWidth(widthClassFor(width))),
            reason: '$label at $width');
        // Still wide enough to hold the row layout comfortably.
        expect(measured, greaterThan(500), reason: '$label at $width');
      }
    });

    testWidgets('$label: the filter chips stay reachable at tablet width',
        (tester) async {
      await pumpScreen(tester, products: products, width: 1024);
      expect(tester.takeException(), isNull);
      expect(find.byType(ChoiceChip), findsWidgets);
    });

    testWidgets('$label: no overflow at tablet width with 1.5x text',
        (tester) async {
      await pumpScreen(tester, products: products, width: 1024, scale: 1.5);
      expect(tester.takeException(), isNull);
      final list = find.byType(ListView).last;
      await tester.drag(list, const Offset(0, -400));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('$label: no overflow in tablet landscape', (tester) async {
      await pumpScreen(tester, products: products, width: 1280, height: 800);
      expect(tester.takeException(), isNull);
    });
  }
}
