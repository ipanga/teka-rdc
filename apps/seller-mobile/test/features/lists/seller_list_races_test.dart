import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/orders/data/models/order_model.dart';
import 'package:seller_mobile/features/orders/data/orders_repository.dart';
import 'package:seller_mobile/features/orders/presentation/providers/orders_provider.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';
import '../../support/seller_list_fixtures.dart';

void main() {
  test('late first-page success cannot replace a newer order filter', () async {
    final repo = _Orders();
    final notifier = SellerOrdersNotifier(repo);
    addTearDown(notifier.dispose);
    final first = notifier.loadOrders();
    notifier.openActionFilter(OrderStatus.processing);
    repo.requests[1].complete(_ordersPage(OrderStatus.processing));
    await Future<void>.delayed(Duration.zero);
    repo.requests[0].complete(_ordersPage(OrderStatus.pending));
    await first;
    expect(notifier.state.selectedStatus, OrderStatus.processing);
    expect(notifier.state.orders.single.status, OrderStatus.processing);
  });
  test('late order pagination error cannot poison a refreshed queue', () async {
    final repo = _Orders();
    final notifier = FixtureOrdersNotifier(
        repo, SellerOrdersState(orders: [fixtureOrders.first], total: 40));
    addTearDown(notifier.dispose);
    final more = notifier.loadMore();
    notifier.openActionFilter(OrderStatus.confirmed);
    repo.requests[1].complete(_ordersPage(OrderStatus.confirmed));
    await Future<void>.delayed(Duration.zero);
    repo.requests[0].completeError(StateError('late error'));
    await more;
    expect(notifier.state.error, isNull);
    expect(notifier.state.isLoadingMore, isFalse);
    expect(notifier.state.orders.single.status, OrderStatus.confirmed);
  });
  test(
      'late product search response and pagination cannot enter the rejected queue',
      () async {
    final repo = _Products();
    final notifier = FixtureProductsNotifier(
        repo, ProductsListState(products: [fixtureProducts.first], total: 40));
    addTearDown(notifier.dispose);
    final more = notifier.loadMore();
    notifier.setSearch('voyage');
    notifier.openActionFilter(ProductStatus.rejected);
    repo.requests[2].complete(_productsPage(ProductStatus.rejected));
    await Future<void>.delayed(Duration.zero);
    repo.requests[1].complete(_productsPage(ProductStatus.active));
    repo.requests[0].complete(_productsPage(ProductStatus.draft));
    await more;
    expect(notifier.state.search, isEmpty);
    expect(notifier.state.products.single.status, ProductStatus.rejected);
    expect(notifier.state.page, 1);
    expect(notifier.state.isLoadingMore, isFalse);
  });
  test('disposed list notifiers ignore success and error completions',
      () async {
    final orders = _Orders();
    final products = _Products();
    final on = SellerOrdersNotifier(orders);
    final pn = ProductsListNotifier(products);
    final of = on.loadOrders();
    final pf = pn.loadProducts();
    on.dispose();
    pn.dispose();
    orders.requests.single.complete(_ordersPage(OrderStatus.pending));
    products.requests.single.completeError(StateError('old session'));
    await Future.wait([of, pf]);
  });
  test('unknown query statuses never default to pending or draft', () {
    expect(orderStatusFromQuery('UNKNOWN'), isNull);
    expect(productStatusFromQuery('UNKNOWN'), isNull);
    expect(orderStatusFromQuery('PROCESSING'), OrderStatus.processing);
    expect(productStatusFromQuery('REJECTED'), ProductStatus.rejected);
  });
}

PaginatedOrdersResponse _ordersPage(OrderStatus status) =>
    PaginatedOrdersResponse(
        items: [fixtureOrders.firstWhere((o) => o.status == status)],
        total: 1,
        page: 1,
        limit: 20);
PaginatedResponse<SellerProductModel> _productsPage(ProductStatus status) =>
    PaginatedResponse(
        items: [fixtureProducts.firstWhere((o) => o.status == status)],
        total: 1,
        page: 1,
        limit: 20);

class _Orders extends FixtureOrdersRepository {
  final requests = <Completer<PaginatedOrdersResponse>>[];
  @override
  Future<PaginatedOrdersResponse> getOrders(
      {int page = 1, int limit = 20, String? status}) {
    final c = Completer<PaginatedOrdersResponse>();
    requests.add(c);
    return c.future;
  }
}

class _Products extends FixtureProductsRepository {
  final requests = <Completer<PaginatedResponse<SellerProductModel>>>[];
  @override
  Future<PaginatedResponse<SellerProductModel>> getProducts(
      {int page = 1, int limit = 20, String? status, String? search}) {
    final c = Completer<PaginatedResponse<SellerProductModel>>();
    requests.add(c);
    return c.future;
  }
}
