import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';
import 'package:buyer_mobile/core/theme/app_theme.dart';
import 'package:buyer_mobile/features/catalog/data/models/product_model.dart';
import 'package:buyer_mobile/features/catalog/presentation/widgets/product_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _GuestTokenStorage extends TokenStorage {
  _GuestTokenStorage() : super(const FlutterSecureStorage());

  @override
  Future<bool> hasTokens() async => false;
}

const _stressProduct = BrowseProductModel(
  id: '31000000-0000-0000-0000-000000000186',
  title:
      'Téléphone intelligent avec un très long nom français et plusieurs caractéristiques',
  priceCDF: '129999900',
  discountPriceCDF: '99999900',
  condition: 'NEW',
  quantity: 0,
  seller: BrowseProductSeller(
    id: 'seller-1',
    businessName: 'Teka RDC Officiel',
  ),
  avgRating: 4.6,
  totalReviews: 12345,
  brandName: 'Une marque particulièrement longue',
);

Widget _harness({
  required ProductCardVariant variant,
  required double textScale,
}) {
  return ProviderScope(
    overrides: [
      tokenStorageProvider.overrideWithValue(_GuestTokenStorage()),
    ],
    child: MaterialApp(
      theme: AppTheme.lightTheme,
      home: MediaQuery(
        data: MediaQueryData(
          size: const Size(320, 800),
          textScaler: TextScaler.linear(textScale),
        ),
        child: Scaffold(
          body: Builder(
            builder: (context) {
              const cardWidth = 138.0;
              return Align(
                alignment: Alignment.topLeft,
                child: SizedBox(
                  width: cardWidth,
                  height: productCardRowExtent(
                    context,
                    variant: variant,
                    itemWidth: cardWidth,
                  ),
                  child: ProductCard(
                    product: _stressProduct,
                    variant: variant,
                  ),
                ),
              );
            },
          ),
        ),
      ),
    ),
  );
}

void main() {
  setUpAll(FlavorConfig.initialize);

  group('ProductCard responsive hierarchy', () {
    testWidgets(
        'catalog variant fits long French metadata, discount, stock, and rating on a narrow screen',
        (tester) async {
      await tester.pumpWidget(
        _harness(
          variant: ProductCardVariant.catalog,
          textScale: 1,
        ),
      );
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.text('Officiel'), findsOneWidget);
      expect(find.text('Rupture de stock'), findsOneWidget);
      expect(find.text('4,6'), findsOneWidget);
      expect(find.text('(12345 avis)'), findsOneWidget);
    });

    testWidgets('catalog variant has no overlap at 200% text scaling',
        (tester) async {
      await tester.pumpWidget(
        _harness(
          variant: ProductCardVariant.catalog,
          textScale: 2,
        ),
      );
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.text('4,6'), findsOneWidget);
      expect(find.byTooltip('Ajouter aux favoris'), findsOneWidget);
    });

    testWidgets('discovery variant keeps rating but removes catalog metadata',
        (tester) async {
      await tester.pumpWidget(
        _harness(
          variant: ProductCardVariant.discovery,
          textScale: 1,
        ),
      );
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.text('Officiel'), findsNothing);
      expect(find.text('4,6'), findsOneWidget);
      expect(find.text('(12345 avis)'), findsOneWidget);
    });
  });
}
