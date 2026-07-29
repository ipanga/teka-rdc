// The current price renders in the SAME colour whether or not the product is
// discounted (Priority 6, 2026-07-29).
//
// A discount is already signalled three other ways — the struck-through
// original, the -X% badge and the savings line — so recolouring the price adds
// no information and made discounted products read as a different kind of
// object across the grid.
//
// Asserted on the rendered colour of the two cards, not on the source, so the
// rule survives refactors that move where the colour is decided.

import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';
import 'package:buyer_mobile/core/theme/app_theme.dart';
import 'package:buyer_mobile/core/utils/price_formatter.dart';
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

BrowseProductModel _product({String? discountPriceCDF}) => BrowseProductModel(
      id: '31000000-0000-0000-0000-000000000042',
      title: 'Lot de 2 chemises',
      priceCDF: '3500000',
      discountPriceCDF: discountPriceCDF,
      condition: 'NEW',
      quantity: 20,
      seller: const BrowseProductSeller(businessName: 'Teka RDC Officiel'),
    );

Future<Color?> _priceColour(
  WidgetTester tester,
  BrowseProductModel product,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [tokenStorageProvider.overrideWithValue(_GuestTokenStorage())],
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: SizedBox(
              width: 180,
              height: 320,
              child: ProductCard(product: product),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();

  // The effective (charged) price — the discounted one when there is a
  // discount, the list price otherwise.
  final text = tester.widget<Text>(
    find.text(formatCDF(product.effectivePriceCDF)).first,
  );
  return text.style?.color;
}

void main() {
  setUpAll(FlavorConfig.initialize);

  testWidgets('a discount does not change the current price colour',
      (tester) async {
    final plain = await _priceColour(tester, _product());
    final discounted =
        await _priceColour(tester, _product(discountPriceCDF: '3000000'));

    expect(plain, isNotNull);
    expect(
      discounted,
      plain,
      reason: 'the current price was recoloured because a discount exists',
    );
  });

  testWidgets('the discounted card still signals the promotion',
      (tester) async {
    await _priceColour(tester, _product(discountPriceCDF: '3000000'));

    // Colour is no longer the signal, so these must be.
    expect(find.text(formatCDF('3500000')), findsOneWidget); // struck-through
    expect(find.textContaining('%'), findsWidgets); // -X% badge
  });
}
