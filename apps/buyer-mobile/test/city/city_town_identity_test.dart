import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/theme/teka_colors.dart';
import 'package:buyer_mobile/features/city/data/models/city_model.dart';

void main() {
  group('CityModel data-driven town identity (Town Architecture Refactor)', () {
    test('parses accentColor + heroImageUrl from the API payload', () {
      final city = CityModel.fromJson(const {
        'id': '01000000-0000-0000-0000-000000000001',
        'name': 'Lubumbashi',
        'slug': 'lubumbashi',
        'province': 'Haut-Katanga',
        'isActive': true,
        'sortOrder': 1,
        'accentColor': 'copper',
        'heroImageUrl': '/hero/lubumbashi.webp',
      });

      expect(city.accentColor, 'copper');
      expect(city.heroImageUrl, '/hero/lubumbashi.webp');
    });

    test('tolerates a payload with no accent/hero (future/legacy towns)', () {
      final city = CityModel.fromJson(const {
        'id': 'x',
        'name': 'Likasi',
        'province': 'Haut-Katanga',
        'isActive': true,
        'sortOrder': 4,
      });

      expect(city.accentColor, isNull);
      expect(city.heroImageUrl, isNull);
    });
  });

  group('TekaColors.cityAccent reads the data-driven accent key', () {
    test('copper / cobalt map to their accents; anything else → brand red', () {
      expect(TekaColors.cityAccent('copper').$1, TekaColors.accentCopper);
      expect(TekaColors.cityAccent('cobalt').$1, TekaColors.accentCobalt);
      expect(TekaColors.cityAccent(null).$1, TekaColors.tekaRed);
      // A slug accidentally passed in place of an accent key falls back to the
      // brand default — proving the switch is keyed on accentColor, not slug.
      expect(TekaColors.cityAccent('lubumbashi').$1, TekaColors.tekaRed);
    });
  });
}
