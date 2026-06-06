import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/features/wishlist/data/wishlist_repository.dart';
import 'package:buyer_mobile/features/wishlist/presentation/providers/wishlist_provider.dart';

/// Fake repo — overrides every method the notifier touches, so the dummy Dio
/// is never used. Lets us drive count + failure behaviour deterministically.
class _FakeRepo extends WishlistRepository {
  _FakeRepo() : super(Dio());

  int count = 0;
  bool failAdd = false;

  @override
  Future<PaginatedWishlistResponse> getWishlist({int page = 1, int limit = 20}) async =>
      const PaginatedWishlistResponse(data: [], page: 1, limit: 20, total: 0, totalPages: 1);

  @override
  Future<int> getCount() async => count;

  @override
  Future<void> addToWishlist(String productId) async {
    if (failAdd) {
      throw DioException(
        requestOptions: RequestOptions(path: '/v1/wishlist/$productId'),
        response: Response(
          requestOptions: RequestOptions(path: '/v1/wishlist/$productId'),
          statusCode: 404,
        ),
      );
    }
    count += 1;
  }

  @override
  Future<void> removeFromWishlist(String productId) async {
    count -= 1;
  }

  @override
  Future<Set<String>> checkWishlistIds(List<String> productIds) async => {};
}

Future<void> _settle() => Future.delayed(Duration.zero);

void main() {
  // No POSTHOG_API_KEY in tests → analytics `capture()` is a no-op (it reads
  // FlavorConfig.instance, which must be initialized first).
  setUpAll(FlavorConfig.initialize);

  group('WishlistNotifier count (parity sweep P2)', () {
    test('loadCount reflects the authoritative server count', () async {
      final repo = _FakeRepo()..count = 7;
      final n = WishlistNotifier(repo);
      await n.loadCount();
      expect(n.state.count, 7);
    });

    test('addToWishlist optimistically increments count + adds id', () async {
      final repo = _FakeRepo()..count = 2;
      final n = WishlistNotifier(repo);
      await _settle(); // let constructor loadCount() finish (count=2)
      await n.addToWishlist('p1');
      expect(n.state.wishlistedIds.contains('p1'), isTrue);
      expect(n.state.count, 3);
    });

    test('double-add is a no-op (count stays honest)', () async {
      final repo = _FakeRepo()..count = 0;
      final n = WishlistNotifier(repo);
      await _settle();
      await n.addToWishlist('p1');
      await n.addToWishlist('p1');
      expect(n.state.count, 1);
    });

    test('removeFromWishlist decrements (floored at 0)', () async {
      final repo = _FakeRepo()..count = 1;
      final n = WishlistNotifier(repo);
      await _settle();
      n.state = n.state.copyWith(wishlistedIds: {'p1'});
      await n.removeFromWishlist('p1');
      expect(n.state.wishlistedIds.contains('p1'), isFalse);
      expect(n.state.count, 0);
    });

    test('failed add (inactive/deleted product) rolls back id + count and rethrows', () async {
      final repo = _FakeRepo()
        ..count = 5
        ..failAdd = true;
      final n = WishlistNotifier(repo);
      await _settle();
      await expectLater(n.addToWishlist('dead'), throwsA(isA<DioException>()));
      expect(n.state.wishlistedIds.contains('dead'), isFalse);
      expect(n.state.count, 5); // unchanged
    });
  });
}
