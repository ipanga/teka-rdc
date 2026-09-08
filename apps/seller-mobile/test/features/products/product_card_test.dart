import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/core/theme/teka_colors.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/presentation/widgets/product_card.dart';

SellerProductModel _product({
  ProductStatus status = ProductStatus.active,
  String priceCDF = '4500000',
  String? discountPriceCDF,
  int quantity = 8,
}) =>
    SellerProductModel(
      id: 'p1',
      title: 'Chemise Homme en Lin - Blanche, coupe droite, coton léger',
      description: '',
      categoryId: 'c',
      priceCDF: priceCDF,
      discountPriceCDF: discountPriceCDF,
      quantity: quantity,
      condition: ProductCondition.newItem,
      status: status,
      cityName: 'Lubumbashi',
      createdAt: DateTime(2026, 9, 8),
    );

Future<GoRouter> _pump(WidgetTester tester, SellerProductModel product,
    {double width = 390, double scale = 1}) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(routes: [
    GoRoute(
        path: '/',
        builder: (_, __) => Scaffold(
            body: ListView(children: [ProductCard(product: product)]))),
    GoRoute(
        path: '/products/:id',
        builder: (_, s) =>
            Scaffold(body: Text('Produit ${s.pathParameters['id']}'))),
  ]);
  addTearDown(router.dispose);
  await tester.pumpWidget(MaterialApp.router(
    theme: AppTheme.lightTheme,
    routerConfig: router,
    builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(scale)),
        child: child!),
  ));
  await tester.pump();
  return router;
}

void main() {
  testWidgets('shows the buyer price, stock and status; no promo, no pill',
      (tester) async {
    await _pump(tester, _product());
    expect(find.text('45.000 FC'), findsOneWidget);
    expect(find.text('Stock : 8'), findsOneWidget);
    expect(find.text('En ligne'), findsOneWidget);
    expect(find.text('À corriger'), findsNothing);
    expect(find.textContaining('%'), findsNothing);
    expect(find.textContaining('CDF'), findsNothing);
  });

  testWidgets('on promotion: effective price first, original struck, −X %',
      (tester) async {
    await _pump(tester, _product(discountPriceCDF: '4050000'));
    expect(find.text('40.500 FC'), findsOneWidget);
    final original = tester.widget<Text>(find.text('45.000 FC'));
    expect(original.style?.decoration, TextDecoration.lineThrough);
    expect(find.text('−10 %'), findsOneWidget);
    final effective = tester.widget<Text>(find.text('40.500 FC'));
    expect(effective.style?.color, isNot(TekaColors.tekaRed));
  });

  testWidgets('rejected product carries the « À corriger » pill; zero stock '
      'reads « Rupture de stock »', (tester) async {
    await _pump(tester, _product(status: ProductStatus.rejected, quantity: 0));
    expect(find.text('Refusé'), findsOneWidget);
    expect(find.text('À corriger'), findsOneWidget);
    expect(find.text('Rupture de stock'), findsOneWidget);
    expect(find.text('Stock : 0'), findsNothing);
  });

  testWidgets('one semantics label per card, and the card opens the product',
      (tester) async {
    await _pump(tester, _product(discountPriceCDF: '4050000'));
    expect(
        find.bySemanticsLabel(RegExp(
            r'Chemise Homme.*En ligne.*40\.500 FC.*promotion moins 10.*stock 8')),
        findsOneWidget);
    await tester.tap(find.byType(ProductCard));
    await tester.pumpAndSettle();
    expect(find.text('Produit p1'), findsOneWidget);
  });

  for (final width in [320.0, 360.0, 412.0]) {
    testWidgets('card fits $width at 1.5× with a promo and a long title',
        (tester) async {
      await _pump(tester, _product(discountPriceCDF: '4050000', quantity: 0),
          width: width, scale: 1.5);
      expect(find.text('40.500 FC'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
