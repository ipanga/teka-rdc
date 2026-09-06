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
        '/commandes/abc',
        '/commandes/abc/def',
        '/favoris',
        '/notifications/123',
        '/api/v1/whatever',
      ]) {
        expect(parse('https://teka.cd$p'), isNull, reason: p);
      }
    });

    // PR D (2026-09-06): the account pages the app HAS are deep-linkable. They
    // are protected routes — a guest is sent to login and returned there, and
    // the API alone decides whether the order belongs to the caller.
    test('orders list / order detail (uuid only) / notifications open in-app', () {
      expect(parse('https://teka.cd/commandes'), const DeepLinkTarget('/orders'));
      expect(
        parse('https://teka.cd/commandes/0CFD024B-0b0b-4d97-a2d7-65e7a071d3be'),
        const DeepLinkTarget('/orders/0cfd024b-0b0b-4d97-a2d7-65e7a071d3be'),
      );
      expect(parse('https://teka.cd/notifications'),
          const DeepLinkTarget('/notifications'));
    });

    test('static pages open the in-app CMS page', () {
      expect(parse('https://teka.cd/pages/faq'), const DeepLinkTarget('/pages/faq'));
      expect(parse('https://teka.cd/pages/../x'), isNull);
    });

    test('dev / staging App-Link hosts are accepted (only those builds receive them)', () {
      expect(parse('https://dev.teka.cd/lubumbashi/whisky-rb7t4r'),
          const DeepLinkTarget('/products/rb7t4r', citySlug: 'lubumbashi'));
      expect(parse('https://staging.teka.cd/promotions'),
          const DeepLinkTarget('/promotions'));
      expect(parse('https://prod.teka.cd/promotions'), isNull);
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
