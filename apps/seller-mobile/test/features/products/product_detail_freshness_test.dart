// A product's status changes WITHOUT the seller touching the app.
//
// Reported 2026-08-05: a product approved by an admin still read "En attente"
// on the seller's product-detail screen — while the products list, which has
// pull-to-refresh, showed it correctly. `productDetailProvider` was a
// keep-alive `FutureProvider.family`, and every `ref.invalidate` in the app is
// tied to a seller action (submit, withdraw, edit, images). An admin decision
// fires none of those, so the status captured on first view was served for the
// rest of the app's life — only a restart cleared it.
//
// These pin the two properties that make the screen self-correcting:
//   1. the provider is autoDispose, so re-entering the screen refetches
//   2. the fetch actually re-runs and the NEW status is what renders
//
// Test 1 is the load-bearing one: it fails against a keep-alive provider.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:seller_mobile/features/products/data/models/product_model.dart';
import 'package:seller_mobile/features/products/data/products_repository.dart';
import 'package:seller_mobile/features/products/presentation/providers/products_provider.dart';

SellerProductModel _product(String status) => SellerProductModel.fromJson({
      'id': 'p1',
      'title': 'MacBook Pro M2 16 pouces',
      'status': status,
      'images': <Map<String, dynamic>>[],
    });

void main() {
  group('productDetailProvider — status must not go stale', () {
    test('refetches after the last listener leaves (autoDispose)', () async {
      // The admin approves between the two views. A keep-alive provider would
      // never issue the second fetch and would replay PENDING_REVIEW forever.
      var fetches = 0;
      final statuses = ['PENDING_REVIEW', 'ACTIVE'];

      final container = ProviderContainer(
        overrides: [
          productsRepositoryProvider.overrideWith(
            (ref) => _FakeRepository(() => _product(statuses[fetches++])),
          ),
        ],
      );
      addTearDown(container.dispose);

      // First view — seller opens the detail screen.
      var sub = container.listen(
        productDetailProvider('p1'),
        (_, __) {},
        fireImmediately: true,
      );
      expect(await container.read(productDetailProvider('p1').future),
          isA<SellerProductModel>().having((p) => p.status, 'status',
              ProductStatus.pendingReview));

      // Seller leaves the screen: the last listener goes, the cache drops.
      sub.close();
      await Future<void>.delayed(Duration.zero);

      // Seller comes back — this must hit the network again.
      sub = container.listen(
        productDetailProvider('p1'),
        (_, __) {},
        fireImmediately: true,
      );
      final second = await container.read(productDetailProvider('p1').future);
      sub.close();

      expect(fetches, 2, reason: 'the provider must refetch on re-entry');
      expect(second.status, ProductStatus.active,
          reason: 'the approved status must reach the screen');
    });

    test('explicit invalidation refetches too (pull-to-refresh path)', () async {
      // Covers the seller who is already ON the screen when the decision
      // lands, and pulls down instead of navigating away.
      var fetches = 0;
      final statuses = ['PENDING_REVIEW', 'ACTIVE'];

      final container = ProviderContainer(
        overrides: [
          productsRepositoryProvider.overrideWith(
            (ref) => _FakeRepository(() => _product(statuses[fetches++])),
          ),
        ],
      );
      addTearDown(container.dispose);

      final sub = container.listen(
        productDetailProvider('p1'),
        (_, __) {},
        fireImmediately: true,
      );
      await container.read(productDetailProvider('p1').future);

      container.invalidate(productDetailProvider('p1'));
      final refreshed = await container.read(productDetailProvider('p1').future);
      sub.close();

      expect(fetches, 2);
      expect(refreshed.status, ProductStatus.active);
    });
  });

  group('status parsing', () {
    test('maps the API statuses the badge relies on', () {
      // "En attente" is PENDING_REVIEW; approval makes it ACTIVE. If these two
      // ever drifted, the screen would mislabel a correctly-fetched product.
      expect(parseProductStatus('PENDING_REVIEW'), ProductStatus.pendingReview);
      expect(parseProductStatus('ACTIVE'), ProductStatus.active);
    });
  });
}

/// Returns a fresh product per call so the test can model an out-of-band
/// status change between two fetches.
class _FakeRepository extends ProductsRepository {
  _FakeRepository(this._next) : super(Dio());

  final SellerProductModel Function() _next;

  @override
  Future<SellerProductModel> getProduct(String id) async => _next();
}
