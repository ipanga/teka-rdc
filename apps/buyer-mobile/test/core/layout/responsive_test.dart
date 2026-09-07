import 'package:buyer_mobile/core/layout/responsive.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Width classes and grid arithmetic (tablet phase, 2026-09-07).
///
/// Every number here is a width the app is actually expected to be laid out
/// at — phones, a split-screen window, 7" and 10" tablets, both iPad sizes —
/// never a device name. The point of the suite is that a change to the
/// breakpoints or the column formula cannot silently regress a phone.
void main() {
  group('widthClassFor', () {
    test('phones and narrow split windows stay compact', () {
      for (final width in <double>[320, 360, 390, 412, 430, 599.9]) {
        expect(widthClassFor(width), LayoutWidthClass.compact,
            reason: '$width should be compact');
      }
    });

    test('small tablets and large phones in landscape are medium', () {
      for (final width in <double>[600, 640, 768, 834, 839.9]) {
        expect(widthClassFor(width), LayoutWidthClass.medium,
            reason: '$width should be medium');
      }
    });

    test('tablet landscape and large tablets are expanded', () {
      for (final width in <double>[840, 1024, 1112, 1366]) {
        expect(widthClassFor(width), LayoutWidthClass.expanded,
            reason: '$width should be expanded');
      }
    });

    test('the class helpers agree with the enum', () {
      expect(LayoutWidthClass.compact.isCompact, isTrue);
      expect(LayoutWidthClass.compact.isAtLeastMedium, isFalse);
      expect(LayoutWidthClass.medium.isAtLeastMedium, isTrue);
      expect(LayoutWidthClass.medium.isExpanded, isFalse);
      expect(LayoutWidthClass.expanded.isExpanded, isTrue);
    });
  });

  group('gridColumnsFor', () {
    test('a phone keeps exactly two columns', () {
      for (final width in <double>[320, 360, 390, 412]) {
        expect(gridColumnsFor(width - 32), 2, reason: '$width phone');
      }
    });

    test('columns grow with the width, and are never more than five', () {
      expect(gridColumnsFor(600 - 32), 3);
      expect(gridColumnsFor(768 - 48), 4);
      expect(gridColumnsFor(834 - 48), 4);
      expect(gridColumnsFor(1024 - 48), 5);
      expect(gridColumnsFor(1366 - 48), 5);
    });

    test('a degenerate width still yields a usable grid', () {
      expect(gridColumnsFor(0), 2);
      expect(gridColumnsFor(-100), 2);
    });

    test('every column is at least the minimum readable card width', () {
      for (final width in <double>[360, 600, 768, 834, 1024, 1366]) {
        final available = width - 48;
        final columns = gridColumnsFor(available);
        final cell = gridCellWidth(available, columns: columns);
        // The phone case is the one exception: two columns are forced even
        // when the screen is narrower than 2 x 168.
        if (columns > 2) {
          expect(cell, greaterThanOrEqualTo(168),
              reason: 'cards at $width would be too narrow to read');
        }
        expect(cell, greaterThan(0));
      }
    });
  });

  group('gridCellWidth', () {
    test('cells plus spacing fill the available width exactly', () {
      const available = 1000.0;
      const spacing = 12.0;
      for (final columns in <int>[2, 3, 4, 5]) {
        final cell =
            gridCellWidth(available, columns: columns, spacing: spacing);
        expect(cell * columns + spacing * (columns - 1),
            closeTo(available, 0.0001));
      }
    });

    test('zero columns degrade to the full width instead of dividing by zero',
        () {
      expect(gridCellWidth(500, columns: 0), 500);
    });
  });

  group('readableMaxWidth / pagePadding', () {
    test('a phone is unconstrained and keeps its 16 pt padding', () {
      expect(readableMaxWidth(LayoutWidthClass.compact), double.infinity);
      expect(pagePadding(LayoutWidthClass.compact), 16);
    });

    test('tablets cap the text column and breathe a little wider', () {
      expect(readableMaxWidth(LayoutWidthClass.medium), 640);
      expect(readableMaxWidth(LayoutWidthClass.expanded), 720);
      expect(pagePadding(LayoutWidthClass.medium), 24);
      expect(pagePadding(LayoutWidthClass.expanded), 24);
    });
  });

  group('heroImageHeight', () {
    test('stays square on a phone', () {
      expect(heroImageHeight(390), 390);
    });

    test('is capped well below the width on tablets', () {
      expect(heroImageHeight(768), lessThan(768));
      expect(heroImageHeight(1024), lessThan(1024));
      expect(heroImageHeight(1024), greaterThan(heroImageHeight(768)));
    });
  });

  group('ReadableColumn', () {
    Future<double> widthOf(WidgetTester tester, double windowWidth) async {
      tester.view.physicalSize = Size(windowWidth, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ReadableColumn(
              child: SizedBox(key: Key('probe'), height: 10, width: 10000),
            ),
          ),
        ),
      );
      return tester.getSize(find.byKey(const Key('probe'))).width;
    }

    testWidgets('spans the phone width minus its padding', (tester) async {
      expect(await widthOf(tester, 390), 390 - 32);
    });

    testWidgets('is capped on a tablet instead of stretching', (tester) async {
      expect(await widthOf(tester, 1024), lessThanOrEqualTo(720 - 48));
    });
  });
}
