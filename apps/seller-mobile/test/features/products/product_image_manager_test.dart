import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import 'package:seller_mobile/features/products/presentation/widgets/image_upload_tile.dart';
import 'package:seller_mobile/features/products/presentation/widgets/product_image_manager.dart';

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

Future<void> _pump(WidgetTester tester, SellerProductModel product) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        productDetailProvider('p1').overrideWith((ref) async => product),
      ],
      child: const MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ProductImageManager(productId: 'p1'),
          ),
        ),
      ),
    ),
  );
  // Resolve the FutureProvider (avoid pumpAndSettle — network-image loaders
  // never settle in tests).
  await tester.pump();
}

void main() {
  testWidgets('shows the count and an add tile when under the max', (t) async {
    await _pump(t, _productWith(2));

    expect(find.text('2/8 images'), findsOneWidget);
    // 2 existing tiles + 1 add tile.
    expect(find.byType(ImageUploadTile), findsNWidgets(3));
    expect(find.text('Maximum atteint'), findsNothing);
  });

  testWidgets('hides the add tile and flags the max at 8 images', (t) async {
    await _pump(t, _productWith(8));

    expect(find.text('8/8 images'), findsOneWidget);
    // 8 tiles, no add tile.
    expect(find.byType(ImageUploadTile), findsNWidgets(8));
    expect(find.text('Maximum atteint'), findsOneWidget);
  });

  testWidgets('tapping the add tile opens the camera/gallery source chooser',
      (t) async {
    await _pump(t, _productWith(1));

    // The last ImageUploadTile is the add tile.
    await t.tap(find.byType(ImageUploadTile).last);
    await t.pump(); // open the bottom sheet
    await t.pump(const Duration(milliseconds: 300));

    // French chooser with both sources (P2).
    expect(find.text('Prendre une photo'), findsOneWidget);
    expect(find.text('Choisir dans la galerie'), findsOneWidget);
  });

  testWidgets('image controls expose accessible add and delete labels',
      (t) async {
    await _pump(t, _productWith(1));

    expect(find.bySemanticsLabel('Image du produit'), findsOneWidget);
    expect(find.byTooltip("Supprimer l'image"), findsOneWidget);
    expect(find.bySemanticsLabel('Ajouter une image'), findsOneWidget);
  });
}
