import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/deep_link/deep_link_parser.dart';

void main() {
  DeepLinkTarget? parse(String url) => DeepLinkParser.parse(Uri.parse(url));

  group('DeepLinkParser — storefront routes', () {
    test('home', () {
      expect(parse('https://teka.cd/'), const DeepLinkTarget('/'));
      expect(parse('https://teka.cd'), const DeepLinkTarget('/'));
    });

    test('product canonical → shortCode + town context', () {
      expect(
        parse('https://teka.cd/kolwezi/samsung-galaxy-a14-foyug0'),
        const DeepLinkTarget('/products/foyug0', citySlug: 'kolwezi'),
      );
    });

    test('product with a multi-dash slug still extracts the trailing shortCode',
        () {
      expect(
        parse('https://teka.cd/lubumbashi/iphone-15-pro-max-a1b2c3'),
        const DeepLinkTarget('/products/a1b2c3', citySlug: 'lubumbashi'),
      );
    });

    test('product without a shortCode falls back to the whole token', () {
      expect(
        parse('https://teka.cd/kolwezi/some-legacy-slug'),
        // "slug" (4 chars) is not a 6-char shortCode → whole token passes through
        const DeepLinkTarget('/products/some-legacy-slug', citySlug: 'kolwezi'),
      );
    });

    test('city-scoped category', () {
      expect(
        parse('https://teka.cd/kolwezi/categorie/electronique'),
        const DeepLinkTarget('/categories/electronique', citySlug: 'kolwezi'),
      );
    });

    test('legacy global category + legacy by id', () {
      expect(parse('https://teka.cd/categorie/mode'),
          const DeepLinkTarget('/categories/mode'));
      expect(parse('https://teka.cd/categories/abc123'),
          const DeepLinkTarget('/categories/abc123'));
    });

    test('search with and without query', () {
      expect(parse('https://teka.cd/recherche?q=samsung'),
          const DeepLinkTarget('/search?q=samsung'));
      expect(parse('https://teka.cd/recherche'),
          const DeepLinkTarget('/search'));
    });

    test('search query is re-encoded (space → +, round-trips via queryParameters)',
        () {
      // Uri.queryParameters decodes %20 → ' '; encodeQueryComponent re-encodes
      // ' ' → '+', which Uri.queryParameters decodes back to a space.
      expect(parse('https://teka.cd/recherche?q=robe%20rouge')?.route,
          '/search?q=robe+rouge');
    });

    test('promotions', () {
      expect(parse('https://teka.cd/promotions'),
          const DeepLinkTarget('/promotions'));
    });

    test('www host is allowed', () {
      expect(parse('https://www.teka.cd/promotions'),
          const DeepLinkTarget('/promotions'));
    });

    test('teka:// custom scheme', () {
      expect(parse('teka://teka.cd/promotions')?.route, '/promotions');
    });
  });

  group('DeepLinkParser — security / browser fallback (returns null)', () {
    test('foreign host', () {
      expect(parse('https://evil.com/kolwezi/x-foyug0'), isNull);
      expect(parse('https://teka.cd.evil.com/promotions'), isNull);
    });

    test('private / auth / account / checkout paths are never deep-linked', () {
      for (final p in [
        '/connexion',
        '/reclamer-compte',
        '/reclamer-compte/confirmer',
        '/paiement',
        '/paiement/success',
        '/panier',
        '/profil',
        '/commandes',
        '/commandes/abc',
        '/favoris',
        '/notifications',
        '/api/v1/whatever',
      ]) {
        expect(parse('https://teka.cd$p'), isNull, reason: p);
      }
    });

    test('single bare segment is left to the website (browser)', () {
      expect(parse('https://teka.cd/foyug0'), isNull);
      expect(parse('https://teka.cd/a-propos'), isNull);
    });

    test('route-injection / malformed tokens are rejected', () {
      // Spaces, slashes-in-token, control chars → not a valid identifier.
      expect(parse('https://teka.cd/kolwezi/' '%20%20'), isNull);
      expect(parse('https://teka.cd/kolwezi/categorie/' '..%2f..'), isNull);
    });

    test('non-teka schemes', () {
      expect(parse('mailto:foo@bar.com'), isNull);
      expect(parse('javascript:alert(1)'), isNull);
    });
  });
}
