import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/features/catalog/data/models/product_model.dart';
import 'package:buyer_mobile/features/catalog/presentation/providers/catalog_provider.dart';
import 'package:buyer_mobile/features/city/data/models/city_model.dart';

// Inputs are built via jsonDecode to mirror Dio's decoded response.data
// (Map<String, dynamic> at every level) — matching production exactly.
Map<String, dynamic> decode(String s) => jsonDecode(s) as Map<String, dynamic>;

void main() {
  group('city-first API fields (parity sweep P1)', () {
    test('BrowseProductModel parses slug/shortCode/city* from the list shape', () {
      final p = BrowseProductModel.fromJson(decode('''
        {
          "id": "31000000-0000-0000-0000-000000000186",
          "title": "Kit fournitures",
          "priceCDF": "3200000",
          "condition": "NEW",
          "quantity": 25,
          "seller": {"businessName": "Teka RDC Officiel"},
          "categoryId": "cat1",
          "slug": "kit-fournitures",
          "shortCode": "8580a5",
          "cityId": "c1",
          "citySlug": "lubumbashi",
          "cityName": "Lubumbashi"
        }'''));
      expect(p.slug, 'kit-fournitures');
      expect(p.shortCode, '8580a5');
      expect(p.cityId, 'c1');
      expect(p.citySlug, 'lubumbashi');
      expect(p.cityName, 'Lubumbashi');
    });

    test('BrowseProductModel tolerates missing city fields (legacy payload)', () {
      final p = BrowseProductModel.fromJson(decode('''
        {"id": "x", "title": "T", "priceCDF": "100", "condition": "NEW",
         "quantity": 1, "seller": {}}'''));
      expect(p.slug, isNull);
      expect(p.citySlug, isNull);
    });

    test('ProductDetailModel reads citySlug/cityName from the nested city object', () {
      final p = ProductDetailModel.fromJson(decode('''
        {
          "id": "x", "title": "T", "priceCDF": "100", "condition": "NEW",
          "quantity": 1, "seller": {},
          "slug": "iphone-15", "shortCode": "a1b2c3", "cityId": "c1",
          "city": {"id": "c1", "slug": "kolwezi", "name": "Kolwezi", "province": "Lualaba"}
        }'''));
      expect(p.slug, 'iphone-15');
      expect(p.shortCode, 'a1b2c3');
      expect(p.cityId, 'c1');
      expect(p.citySlug, 'kolwezi');
      expect(p.cityName, 'Kolwezi');
    });

    test('CityModel parses slug', () {
      final c = CityModel.fromJson(decode('''
        {"id": "c1", "name": "Lubumbashi", "slug": "lubumbashi",
         "province": "Haut-Katanga", "isActive": true, "sortOrder": 1}'''));
      expect(c.slug, 'lubumbashi');
    });
  });

  group('BrowseProductsParams cityId (parity sweep P1)', () {
    test('cityId participates in equality + hashCode (drives the family refetch)', () {
      const a = BrowseProductsParams(categoryId: 'cat1', cityId: 'lubumbashi');
      const b = BrowseProductsParams(categoryId: 'cat1', cityId: 'kolwezi');
      const c = BrowseProductsParams(categoryId: 'cat1', cityId: 'lubumbashi');
      expect(a == c, isTrue);
      expect(a == b, isFalse);
      expect(a.hashCode == c.hashCode, isTrue);
    });
  });
}
