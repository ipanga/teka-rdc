import 'package:flutter_test/flutter_test.dart';
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
}
