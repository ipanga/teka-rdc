import 'package:buyer_mobile/features/catalog/presentation/providers/catalog_provider.dart';
import 'package:flutter_test/flutter_test.dart';

/// The analytics tag on [BrowseProductsParams] is passive: it must never change
/// which products are fetched, and — critically — it must never change the
/// provider FAMILY KEY.
///
/// `browseProductsProvider` is a `StateNotifierProvider.family` keyed on this
/// object, and `BrowseProductsNotifier`'s constructor fetches. If `searchIntent`
/// took part in `==`/`hashCode`, then tapping a suggestion chip for a term the
/// buyer had already typed would mint a NEW notifier and a NEW network request
/// (and leak the old one) — an extra request caused purely by telemetry.
void main() {
  group('BrowseProductsParams — searchIntent is not part of the cache key', () {
    test('two params differing only by searchIntent are equal', () {
      const typed = BrowseProductsParams(search: 'robe', searchIntent: 'SUBMIT');
      const chipped =
          BrowseProductsParams(search: 'robe', searchIntent: 'SUGGESTION');

      expect(typed, equals(chipped));
      expect(typed.hashCode, equals(chipped.hashCode));
    });

    test('a null and a set searchIntent are still equal', () {
      const untagged = BrowseProductsParams(search: 'robe');
      const tagged = BrowseProductsParams(search: 'robe', searchIntent: 'SUBMIT');

      expect(untagged, equals(tagged));
      expect(untagged.hashCode, equals(tagged.hashCode));
    });

    test('the real search fields still separate params', () {
      const a = BrowseProductsParams(search: 'robe', searchIntent: 'SUBMIT');
      const b = BrowseProductsParams(search: 'wax', searchIntent: 'SUBMIT');
      const c = BrowseProductsParams(
        search: 'robe',
        cityId: '01000000-0000-0000-0000-000000000001',
        searchIntent: 'SUBMIT',
      );

      expect(a, isNot(equals(b)));
      expect(a, isNot(equals(c)));
    });

    test('the tag is still readable off the params', () {
      const p = BrowseProductsParams(search: 'nike', searchIntent: 'SUGGESTION');
      expect(p.searchIntent, 'SUGGESTION');
    });
  });

  group('BrowseProductsParams.copyWith', () {
    test('carries searchIntent through when not overridden', () {
      const p = BrowseProductsParams(search: 'robe', searchIntent: 'SUGGESTION');
      expect(p.copyWith(cityId: 'c1').searchIntent, 'SUGGESTION');
    });

    test('overrides searchIntent when given', () {
      const p = BrowseProductsParams(search: 'robe', searchIntent: 'SUGGESTION');
      expect(p.copyWith(searchIntent: 'SUBMIT').searchIntent, 'SUBMIT');
    });

    test('does not disturb the other fields', () {
      const p = BrowseProductsParams(
        search: 'robe',
        cityId: 'c1',
        sortBy: 'popularity',
        onPromotion: true,
        searchIntent: 'SUBMIT',
      );
      final copy = p.copyWith(searchIntent: 'SUGGESTION');
      expect(copy.search, 'robe');
      expect(copy.cityId, 'c1');
      expect(copy.sortBy, 'popularity');
      expect(copy.onPromotion, isTrue);
    });
  });
}
