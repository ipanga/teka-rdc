// Isolated fixtures shared by widget tests and the debug-only simulator preview.
// No real API, credentials, analytics or storage are used.
import 'package:dio/dio.dart';
import 'package:seller_mobile/features/orders/data/models/order_model.dart';
import 'package:seller_mobile/features/orders/data/orders_repository.dart';
import 'package:seller_mobile/features/orders/presentation/providers/orders_provider.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';

final fixtureOrders = [
  for (final status in OrderStatus.values)
    SellerOrderModel(
      id: 'order-${status.name}',
      orderNumber: 'TK-20260903-000125',
      status: status,
      totalCDF: '12345678900',
      subtotalCDF: '12345670000',
      deliveryFeeCDF: '8900',
      createdAt: DateTime(2026, 9, 3, 10, 35),
      buyer: const OrderBuyerModel(
        id: 'buyer-fixture',
        firstName: 'Marie-Claire',
        lastName: 'Nom de démonstration particulièrement long',
        phone: '',
      ),
      itemCount: 24,
    ),
];

final fixtureProducts = [
  for (final status in ProductStatus.values)
    SellerProductModel(
      id: 'product-${status.name}',
      title:
          'Réfrigérateur familial à double porte avec congélateur et garantie constructeur',
      description: 'Produit de démonstration pour vérification locale.',
      categoryId: 'category-fixture',
      priceCDF: '12345678900',
      quantity: 0,
      condition: ProductCondition.newItem,
      status: status,
      rejectionReason: status == ProductStatus.rejected
          ? 'Ajoutez une description complète.'
          : null,
      cityName: 'Ville de démonstration au nom particulièrement long',
      createdAt: DateTime(2026, 9, 3),
    ),
];

class FixtureOrdersRepository extends SellerOrdersRepository {
  FixtureOrdersRepository() : super(Dio());
  int calls = 0;
  String? lastStatus;

  @override
  Future<PaginatedOrdersResponse> getOrders(
      {int page = 1, int limit = 20, String? status}) async {
    calls++;
    lastStatus = status;
    final items = fixtureOrders
        .where((o) => status == null || orderStatusToApi(o.status) == status)
        .toList();
    return PaginatedOrdersResponse(
        items: items, total: items.length, page: page, limit: limit);
  }
}

class FixtureProductsRepository extends ProductsRepository {
  FixtureProductsRepository() : super(Dio());
  final searches = <String?>[];
  int calls = 0;

  @override
  Future<PaginatedResponse<SellerProductModel>> getProducts(
      {int page = 1, int limit = 20, String? status, String? search}) async {
    calls++;
    searches.add(search);
    final items = fixtureProducts
        .where((p) =>
            (status == null || productStatusToApi(p.status) == status) &&
            (search == null ||
                p.title.toLowerCase().contains(search.toLowerCase())))
        .toList();
    return PaginatedResponse(
        items: items, total: items.length, page: page, limit: limit);
  }
}

class FixtureOrdersNotifier extends SellerOrdersNotifier {
  FixtureOrdersNotifier(super.repository, SellerOrdersState initial) {
    state = initial;
  }
}

class FixtureProductsNotifier extends ProductsListNotifier {
  FixtureProductsNotifier(super.repository, ProductsListState initial) {
    state = initial;
  }
}
