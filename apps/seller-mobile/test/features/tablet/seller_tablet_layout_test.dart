import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/layout/responsive.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import 'package:seller_mobile/features/products/presentation/widgets/image_upload_tile.dart';
import 'package:seller_mobile/features/products/presentation/widgets/product_image_manager.dart';

/// Seller Mobile tablet layout (Tablet PR 2, 2026-09-07).
///
/// Seller screens are forms, data-dense lists and financial summaries, so they
/// are centred in a readable column rather than turned into multi-column
/// grids. These tests pin that at the widths the app is laid out at, and pin
/// the phone case so the tablet work cannot change what a seller sees on a
/// phone.
const _phoneWidths = <double>[320, 360, 390, 412];
const _tabletWidths = <double>[768, 834, 1024, 1280, 1366];

SellerProductModel _productWith(int imageCount) {
  return SellerProductModel.fromJson({
    'id': 'p1',
    'title': 'MacBook Pro',
    'images': [
      for (var i = 0; i < imageCount; i++)
        {
          'id': 'img$i',
          'url': 'https://example.test/img$i.jpg',
          'thumbnailUrl': 'https://example.test/img${i}_t.jpg',
          'cloudinaryId': 'cloud$i',
          'displayOrder': i,
        },
    ],
  });
}

Future<double> _probeWidth(WidgetTester tester, double windowWidth) async {
  tester.view.physicalSize = Size(windowWidth, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.lightTheme,
      home: const Scaffold(
        body: ReadableColumn(
          padding: EdgeInsets.zero,
          child: SizedBox(key: Key('content'), height: 40, width: 10000),
        ),
      ),
    ),
  );
  return tester.getSize(find.byKey(const Key('content'))).width;
}

Future<int> _imageGridColumns(WidgetTester tester, double windowWidth) async {
  tester.view.physicalSize = Size(windowWidth, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        productDetailProvider('p1').overrideWith((ref) async => _productWith(2)),
      ],
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        home: const Scaffold(
          body: SingleChildScrollView(
            child: ProductImageManager(productId: 'p1'),
          ),
        ),
      ),
    ),
  );
  // Network-image loaders never settle in tests, so pump once.
  await tester.pump();
  final grid = tester.widget<GridView>(find.byType(GridView));
  return (grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount)
      .crossAxisCount;
}

void main() {
  group('readable content column', () {
    testWidgets('spans a phone edge to edge, as before', (tester) async {
      for (final width in _phoneWidths) {
        expect(await _probeWidth(tester, width), width, reason: 'phone $width');
      }
    });

    testWidgets('is capped on a tablet instead of stretching', (tester) async {
      for (final width in _tabletWidths) {
        final measured = await _probeWidth(tester, width);
        expect(measured, lessThanOrEqualTo(720), reason: 'tablet $width');
        expect(measured, greaterThanOrEqualTo(600), reason: 'tablet $width');
      }
    });

    testWidgets('a phone in landscape is capped too, not stretched',
        (tester) async {
      // 800 pt is a large phone on its side: medium class, so the 640 cap.
      expect(await _probeWidth(tester, 800), 640);
    });
  });

  group('product image grid', () {
    testWidgets('a phone keeps exactly three tiles', (tester) async {
      for (final width in _phoneWidths) {
        expect(await _imageGridColumns(tester, width), 3,
            reason: 'phone $width');
      }
    });

    testWidgets('a wider form gets more tiles of the same size, not bigger ones',
        (tester) async {
      // The manager lives inside the product form's readable column, so it is
      // never handed the whole tablet width; even so it must grow by tile
      // count rather than tile size.
      final wide = await _imageGridColumns(tester, 1024);
      expect(wide, greaterThan(3));
      expect(wide, lessThanOrEqualTo(6));
    });

    testWidgets('the add tile is still reachable at tablet width',
        (tester) async {
      await _imageGridColumns(tester, 1024);
      expect(find.byType(ImageUploadTile), findsWidgets);
    });
  });

  group('wallet summary columns', () {
    // The Revenus header lays its three cards out from the width it is given.
    // Pinning the arithmetic keeps a phone at two per row and gives a tablet
    // all three side by side.
    test('a phone shows two cards per row', () {
      for (final width in _phoneWidths) {
        expect(
          gridColumnsFor(width - 32,
              minCellWidth: 200, spacing: 12, minColumns: 2, maxColumns: 3),
          2,
          reason: 'phone $width',
        );
      }
    });

    test('a readable column on a tablet fits all three', () {
      expect(
        gridColumnsFor(720 - 32,
            minCellWidth: 200, spacing: 12, minColumns: 2, maxColumns: 3),
        3,
      );
    });
  });

  group('sheets and dialogs', () {
    test('the theme carries the shared constraints', () {
      final theme = AppTheme.lightTheme;
      expect(theme.bottomSheetTheme.constraints, kSheetConstraints);
      expect(theme.dialogTheme.constraints, kSheetConstraints);
    });

    Future<double> sheetWidth(WidgetTester tester, double windowWidth) async {
      tester.view.physicalSize = Size(windowWidth, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.lightTheme,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => const SizedBox(
                      key: Key('sheet-body'),
                      height: 200,
                      width: double.infinity,
                    ),
                  ),
                  child: const Text('ouvrir'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('ouvrir'));
      await tester.pumpAndSettle();
      return tester.getSize(find.byKey(const Key('sheet-body'))).width;
    }

    testWidgets('a sheet still fills a phone', (tester) async {
      expect(await sheetWidth(tester, 390), 390);
    });

    testWidgets('a sheet becomes a centred panel on a tablet', (tester) async {
      expect(await sheetWidth(tester, 1024), kSheetConstraints.maxWidth);
    });

    testWidgets('a dialog is a panel, not a full-width bar', (tester) async {
      tester.view.physicalSize = const Size(1280, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.lightTheme,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (_) => const AlertDialog(
                      title: Text('Remplacer ce document ?'),
                      content: Text('Votre boutique repassera en vérification.'),
                    ),
                  ),
                  child: const Text('ouvrir'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('ouvrir'));
      await tester.pumpAndSettle();
      final panel = find
          .descendant(
            of: find.byType(AlertDialog),
            matching: find.byType(Material),
          )
          .first;
      expect(tester.getSize(panel).width,
          lessThanOrEqualTo(kSheetConstraints.maxWidth));
    });
  });
}
