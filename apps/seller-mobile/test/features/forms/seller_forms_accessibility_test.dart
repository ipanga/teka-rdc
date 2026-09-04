import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/orders/data/models/order_model.dart';
import 'package:seller_mobile/features/orders/presentation/widgets/order_action_buttons.dart';
import 'package:seller_mobile/features/products/data/models/attribute_model.dart';
import 'package:seller_mobile/features/products/data/models/brand_option_model.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import 'package:seller_mobile/features/products/presentation/screens/product_form_screen.dart';

SellerProductModel _product({String categoryId = ''}) => SellerProductModel(
      id: 'p1',
      title: 'Produit avec un titre long pour la vérification',
      description: 'Description',
      categoryId: categoryId,
      priceCDF: '500000',
      quantity: 3,
      condition: ProductCondition.newItem,
      status: ProductStatus.draft,
      createdAt: DateTime(2026, 9, 3),
    );

class _FormRepository extends ProductsRepository {
  _FormRepository({this.failOptions = false}) : super(Dio());

  final bool failOptions;

  @override
  Future<List<AttributeModel>> getCategoryAttributes(String categoryId) async {
    if (failOptions) throw StateError('attributes unavailable');
    return const [
      AttributeModel(
        id: 'size',
        categoryId: 'category',
        name: 'Dimension particulièrement longue',
        type: 'SELECT',
        options: ['Très grande dimension avec une longue description'],
      ),
    ];
  }

  @override
  Future<List<BrandOption>> getBrands(String categoryId) async {
    if (failOptions) throw StateError('brands unavailable');
    return const [
      BrandOption(id: 'brand', name: 'Une marque au nom particulièrement long'),
    ];
  }
}

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  ProductsRepository? repository,
  SellerProductModel? product,
  double textScale = 1,
}) async {
  tester.view.physicalSize = const Size(320, 700);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        categoriesProvider.overrideWith((ref) async => const []),
        if (repository != null)
          productsRepositoryProvider.overrideWith((ref) => repository),
        if (product != null)
          productDetailProvider(product.id)
              .overrideWith((ref) async => product),
      ],
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        builder: (context, appChild) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(textScale),
          ),
          child: appChild!,
        ),
        home: child,
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('order actions remain readable at 320 px with 2x text',
      (tester) async {
    await _pump(
      tester,
      const Scaffold(body: OrderActionButtons(status: OrderStatus.pending)),
      textScale: 2,
    );

    expect(find.text('Confirmer'), findsOneWidget);
    expect(find.text('Rejeter'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('non-actionable order status renders no action controls',
      (tester) async {
    await _pump(
      tester,
      const Scaffold(
        body: OrderActionButtons(status: OrderStatus.readyForTekaPickup),
      ),
    );

    expect(find.byType(ElevatedButton), findsNothing);
    expect(find.byType(OutlinedButton), findsNothing);
  });

  testWidgets('product form stacks price fields on narrow enlarged layouts',
      (tester) async {
    await _pump(
      tester,
      const ProductFormScreen(),
      repository: _FormRepository(),
      textScale: 2,
    );

    await tester.drag(find.byType(ListView).first, const Offset(0, -450));
    await tester.pump();
    expect(find.text('Prix FC'), findsOneWidget);
    expect(find.text('Prix USD'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('option failures are explicit and independently retryable',
      (tester) async {
    final product = _product(categoryId: 'category');
    await _pump(
      tester,
      ProductFormScreen(product: product),
      repository: _FormRepository(failOptions: true),
      product: product,
    );

    expect(find.text('Impossible de charger les marques.'), findsOneWidget);
    await tester.drag(find.byType(ListView).first, const Offset(0, -500));
    await tester.pump();
    expect(
      find.text('Impossible de charger les caractéristiques.'),
      findsOneWidget,
    );
    expect(find.text('Réessayer'), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('cold edit route resolves the product without GoRouter extra',
      (tester) async {
    final product = _product();
    await _pump(
      tester,
      const ProductEditScreen(productId: 'p1'),
      repository: _FormRepository(),
      product: product,
    );

    expect(find.text('Modifier le produit'), findsOneWidget);
    expect(find.text(product.title), findsOneWidget);
  });
}
