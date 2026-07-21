import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';

/// Records calls and returns an empty page — no real network.
class _FakeProductsRepository extends ProductsRepository {
  _FakeProductsRepository() : super(Dio());

  int getProductsCalls = 0;

  @override
  Future<PaginatedResponse<SellerProductModel>> getProducts({
    int page = 1,
    int limit = 20,
    String? status,
    String? search,
  }) async {
    getProductsCalls++;
    return PaginatedResponse(items: const [], total: 0, page: page, limit: limit);
  }
}

void main() {
  // Regression for the cold-start first-load race: the notifier must NOT fetch
  // in its constructor (that races token restoration → 401 → cached error until
  // "Réessayer"). The first load is driven off auth status by the provider.
  test('ProductsListNotifier does not fetch in its constructor and starts loading',
      () {
    final repo = _FakeProductsRepository();
    final notifier = ProductsListNotifier(repo);

    expect(repo.getProductsCalls, 0,
        reason: 'must not auto-load before auth resolves');
    expect(notifier.state.isLoading, isTrue,
        reason: 'shows a skeleton, not an empty/error flash, until first load');
    expect(notifier.state.error, isNull);
  });

  test('loadProducts fetches once and clears the loading flag', () async {
    final repo = _FakeProductsRepository();
    final notifier = ProductsListNotifier(repo);

    await notifier.loadProducts();

    expect(repo.getProductsCalls, 1);
    expect(notifier.state.isLoading, isFalse);
    expect(notifier.state.error, isNull);
  });
}
