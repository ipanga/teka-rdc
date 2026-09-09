import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/layout/responsive.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/products/data/models/attribute_model.dart';
import 'package:seller_mobile/features/products/data/models/brand_option_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import 'package:seller_mobile/features/products/presentation/screens/product_form_screen.dart';

/// The product form is the surface a seller spends the most time in and the
/// one the tablet audit called out first. It stays a SINGLE readable column on
/// a tablet: a desktop-style two-column form would separate a field from its
/// validation message and scatter the dynamic category characteristics, which
/// is worse than a little whitespace.
class _FormRepository extends ProductsRepository {
  _FormRepository() : super(Dio());

  @override
  Future<List<AttributeModel>> getCategoryAttributes(String categoryId) async =>
      const [];

  @override
  Future<List<BrandOption>> getBrands(String categoryId) async => const [];
}

Future<void> _pumpForm(WidgetTester tester, double width,
    {double textScale = 1, double height = 1400}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        categoriesProvider.overrideWith((ref) async => const []),
        productsRepositoryProvider.overrideWith((ref) => _FormRepository()),
      ],
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: const ProductFormScreen(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

double _fieldWidth(WidgetTester tester) =>
    tester.getSize(find.byType(TextFormField).first).width;

void main() {
  testWidgets('a phone form spans the screen, as before', (tester) async {
    for (final width in <double>[320, 360, 390, 412]) {
      await _pumpForm(tester, width);
      // 16 pt list padding on each side, unchanged.
      expect(_fieldWidth(tester), width - 32, reason: 'phone $width');
    }
  });

  testWidgets('a tablet form is a readable column, not a 1280 pt bar',
      (tester) async {
    for (final width in <double>[768, 834, 1024, 1280, 1366]) {
      await _pumpForm(tester, width);
      final measured = _fieldWidth(tester);
      expect(measured,
          lessThanOrEqualTo(readableMaxWidth(widthClassFor(width))),
          reason: 'tablet $width');
      expect(measured, greaterThan(500), reason: 'tablet $width');
    }
  });

  testWidgets('the form stays a single column on the widest surface',
      (tester) async {
    await _pumpForm(tester, 1366);
    // Title and description are stacked, not placed side by side: their left
    // edges line up.
    final fields = find.byType(TextFormField);
    final first = tester.getTopLeft(fields.at(0));
    final second = tester.getTopLeft(fields.at(1));
    expect(second.dx, first.dx);
    expect(second.dy, greaterThan(first.dy));
  });

  testWidgets('price fields stay side by side inside the readable column',
      (tester) async {
    await _pumpForm(tester, 1024);
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -450));
    await tester.pump();
    expect(find.text('Prix FC'), findsOneWidget);
    expect(find.text('Prix USD'), findsOneWidget);
    final cdf = tester.getTopLeft(find.text('Prix FC'));
    final usd = tester.getTopLeft(find.text('Prix USD'));
    // Same row: the readable cap keeps the pair above the 420 pt stack
    // threshold the form already used.
    expect(usd.dy, cdf.dy);
    expect(usd.dx, greaterThan(cdf.dx));
    expect(tester.takeException(), isNull);
  });

  testWidgets('large text on a tablet does not overflow', (tester) async {
    for (final scale in <double>[1.3, 1.5]) {
      await _pumpForm(tester, 1024, textScale: scale);
      expect(tester.takeException(), isNull);
      await tester.drag(find.byType(Scrollable).first, const Offset(0, -500));
      await tester.pump();
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('tablet landscape renders without overflow', (tester) async {
    await _pumpForm(tester, 1280, height: 800);
    expect(tester.takeException(), isNull);
  });
}
