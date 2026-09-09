import 'package:buyer_mobile/core/widgets/product_skeletons.dart';
import 'package:buyer_mobile/features/catalog/presentation/widgets/product_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// The product grids are the screens tablets got most wrong: every one of them
/// used to hardcode two columns and derive the row height from the WINDOW
/// width divided by two. These tests pin the adaptation at the widths the app
/// is laid out at, and — just as important — pin the phone case so the tablet
/// work cannot change what a phone renders.
SliverGridDelegateWithFixedCrossAxisCount _delegateOf(WidgetTester tester) {
  final grid = tester.widget<GridView>(find.byType(GridView));
  return grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount;
}

Future<SliverGridDelegateWithFixedCrossAxisCount> _pumpGrid(
  WidgetTester tester,
  double width, {
  ProductCardVariant variant = ProductCardVariant.catalog,
}) async {
  tester.view.physicalSize = Size(width, 1200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ProductGrid(
          itemCount: 8,
          variant: variant,
          itemBuilder: (_, index) => ColoredBox(
            color: Colors.grey,
            child: Text('item $index'),
          ),
        ),
      ),
    ),
  );
  return _delegateOf(tester);
}

void main() {
  group('ProductGrid columns', () {
    testWidgets('a phone still renders two columns', (tester) async {
      for (final width in <double>[360, 390, 412]) {
        final delegate = await _pumpGrid(tester, width);
        expect(delegate.crossAxisCount, 2, reason: 'phone $width');
      }
    });

    testWidgets('a 7" tablet portrait / phone landscape gets three',
        (tester) async {
      expect((await _pumpGrid(tester, 600)).crossAxisCount, 3);
    });

    testWidgets('a 10" tablet portrait and an iPad portrait get four',
        (tester) async {
      expect((await _pumpGrid(tester, 768)).crossAxisCount, 4);
      expect((await _pumpGrid(tester, 834)).crossAxisCount, 4);
    });

    testWidgets('a tablet in landscape gets five and stops there',
        (tester) async {
      expect((await _pumpGrid(tester, 1024)).crossAxisCount, 5);
      expect((await _pumpGrid(tester, 1366)).crossAxisCount, 5);
    });
  });

  group('ProductGrid cell height', () {
    testWidgets('row height follows the CELL width, not the window width',
        (tester) async {
      // The footer allowance is a constant for a given variant and text
      // scale, so `extent - cellWidth` must be identical at every width. The
      // old code derived the extent from the window width over two, which made
      // that difference drift with the screen.
      double? footer;
      for (final width in <double>[360, 390, 600, 768, 834, 1024, 1366]) {
        final delegate = await _pumpGrid(tester, width);
        final available = width - 32;
        final cell = (available - 12 * (delegate.crossAxisCount - 1)) /
            delegate.crossAxisCount;
        final measured = delegate.mainAxisExtent! - cell;
        footer ??= measured;
        expect(measured, closeTo(footer, 0.5),
            reason: 'footer allowance drifted at $width');
      }
    });

    testWidgets('the row always leaves room for the card footer',
        (tester) async {
      for (final width in <double>[360, 600, 768, 1024]) {
        final delegate = await _pumpGrid(tester, width);
        final available = width - 32;
        final cell = (available - 12 * (delegate.crossAxisCount - 1)) /
            delegate.crossAxisCount;
        // Square image + footer: the extent is strictly taller than the image.
        expect(delegate.mainAxisExtent!, greaterThan(cell),
            reason: 'no footer room at $width');
      }
    });

    testWidgets('the discovery variant reserves less footer than catalog',
        (tester) async {
      final discovery = await _pumpGrid(tester, 390,
          variant: ProductCardVariant.discovery);
      final catalog =
          await _pumpGrid(tester, 390, variant: ProductCardVariant.catalog);
      expect(discovery.mainAxisExtent!, lessThan(catalog.mainAxisExtent!));
    });
  });

  group('ProductGridSkeleton', () {
    testWidgets('matches the real grid it is replaced by', (tester) async {
      for (final width in <double>[390, 600, 768, 1024]) {
        final real = await _pumpGrid(tester, width);

        tester.view.physicalSize = Size(width, 1200);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: ProductGridSkeleton(
                  count: 6,
                  padding: const EdgeInsets.all(16),
                  mainAxisExtentFor: (cellWidth) => productCardGridExtent(
                    tester.element(find.byType(ProductGridSkeleton)),
                    variant: ProductCardVariant.catalog,
                    cellWidth: cellWidth,
                  ),
                ),
              ),
            ),
          ),
        );
        final skeleton = _delegateOf(tester);
        expect(skeleton.crossAxisCount, real.crossAxisCount,
            reason: 'skeleton would jump on resolve at $width');
        expect(skeleton.mainAxisExtent, closeTo(real.mainAxisExtent!, 0.5),
            reason: 'skeleton height differs from the grid at $width');
      }
    });
  });
}
