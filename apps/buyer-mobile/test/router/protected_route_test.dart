import 'package:flutter_test/flutter_test.dart';
import 'dart:io';

import 'package:buyer_mobile/core/router/app_router.dart';

void main() {
  group('isProtectedRoute (Guest Browsing) — login required', () {
    test('protects cart / checkout / orders / wishlist / profile + sub-paths', () {
      for (final p in [
        '/cart',
        '/checkout',
        '/checkout/success',
        '/checkout/payment-pending',
        '/orders',
        '/orders/abc123',
        '/wishlist',
        '/profile',
      ]) {
        expect(isProtectedRoute(p), isTrue, reason: '$p must require auth');
      }
    });

    test('leaves browsing routes public for guests', () {
      for (final p in [
        '/',
        '/city-selection',
        '/categories/13000000-0000-0000-0000-000000000001',
        '/search',
        '/products/abc',
        '/products/abc/reviews',
        '/pages/a-propos',
        '/auth/connexion',
      ]) {
        expect(isProtectedRoute(p), isFalse, reason: '$p must stay public');
      }
    });

    test('does not match a prefix that is only a substring', () {
      // '/cartographie' must NOT be treated as the protected '/cart'.
      expect(isProtectedRoute('/cartographie'), isFalse);
    });
  });

  // ─── PR D3 (2026-09-07): dead-route cleanup ─────────────────────────────
  group('routes removed / kept', () {
    final router = File('lib/core/router/app_router.dart').readAsStringSync();

    test('the COD-dead payment-pending route and screen are gone', () {
      expect(router.contains("path: '/checkout/payment-pending'"), isFalse);
      expect(router.contains('PaymentPendingScreen'), isFalse);
      expect(
        File('lib/features/checkout/presentation/screens/payment_pending_screen.dart')
            .existsSync(),
        isFalse,
      );
      // It was protected while it existed; the prefix rule still covers the
      // rest of /checkout.
      expect(isProtectedRoute('/checkout/success'), isTrue);
    });

    test('the claim compatibility route is kept (magic links must resolve)', () {
      expect(router.contains("path: '/auth/reclamer-compte/confirmer'"), isTrue);
      expect(isProtectedRoute('/auth/reclamer-compte/confirmer'), isFalse);
    });

    test('the routes the app links to still exist', () {
      for (final path in [
        "path: '/orders'",
        "path: '/orders/:id'",
        "path: '/notifications'",
        "path: '/products/:id'",
        "path: '/products/:id/reviews'",
        "path: '/categories/:id'",
        "path: '/pages/:slug'",
        "path: '/checkout'",
        "path: '/checkout/success'",
        "path: '/profile/addresses'",
      ]) {
        expect(router.contains(path), isTrue, reason: path);
      }
    });
  });
}
