import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/features/city/data/city_hero_images.dart';

void main() {
  group('cityHeroImageAsset (bundled city hero images)', () {
    test('maps the launch towns to a bundled hero asset', () {
      expect(cityHeroImageAsset('lubumbashi'), 'assets/hero/lubumbashi.jpg');
      expect(cityHeroImageAsset('kolwezi'), 'assets/hero/kolwezi.jpg');
    });

    test('returns null for towns without a bundled hero (→ accent gradient)', () {
      // A future town with no bundled image falls back to the accent gradient.
      expect(cityHeroImageAsset('likasi'), isNull);
      expect(cityHeroImageAsset(null), isNull);
    });
  });
}
