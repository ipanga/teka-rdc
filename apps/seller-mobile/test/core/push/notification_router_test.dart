import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/push/notification_router.dart';

void main() {
  _payoutTests();
  group('NotificationRouter — screen payloads', () {
    test('order / product / reviews / broadcast route correctly', () {
      expect(
        NotificationRouter.routeForData(
            {'screen': 'order-details', 'orderId': _pay}),
        '/orders/$_pay',
      );
      expect(
        NotificationRouter.routeForData(
            {'screen': 'product-details', 'productId': _pay}),
        '/products/$_pay',
      );
      // Seller has a flat reviews surface.
      expect(
        NotificationRouter.routeForData(
            {'screen': 'product-reviews', 'productId': _pay}),
        '/reviews',
      );
      // Regression: a plain admin broadcast must open the Notification Center
      // (backend sends {screen: 'notifications'}); previously routed nowhere.
      expect(
        NotificationRouter.routeForData(
            {'screen': 'notifications', 'kind': 'broadcast'}),
        '/notifications',
      );
    });

    test('unknown / missing → null', () {
      expect(NotificationRouter.routeForData({'screen': 'mystery'}), isNull);
      expect(NotificationRouter.routeForData({'screen': 'order-details'}), isNull);
      expect(NotificationRouter.routeForData(const {}), isNull);
    });
  });
}

const _pay = '0f1e2d3c-4b5a-4c6d-8e7f-90a1b2c3d4e5';

void _payoutTests() {
  group('NotificationRouter — payout payloads (PR 6)', () {
    test('earnings + payoutId → the owner-checked payout detail', () {
      expect(
        NotificationRouter.routeForData(
            {'screen': 'earnings', 'event': 'payout-paid', 'payoutId': _pay}),
        '/earnings/payouts/$_pay',
      );
    });

    test('earnings without / with a malformed payoutId → the payouts tab (old or stale payload)', () {
      expect(
        NotificationRouter.routeForData({'screen': 'earnings'}),
        '/earnings?tab=payouts',
      );
      expect(
        NotificationRouter.routeForData(
            {'screen': 'earnings', 'payoutId': '../admin'}),
        '/earnings?tab=payouts',
      );
      expect(
        NotificationRouter.routeForData(
            {'screen': 'earnings', 'payoutId': 'not-a-uuid'}),
        '/earnings?tab=payouts',
      );
    });

    test('non-uuid ids never become a path segment for orders / products either', () {
      expect(
        NotificationRouter.routeForData(
            {'screen': 'order-details', 'orderId': '../x'}),
        isNull,
      );
    });

    test('feed items: payout → detail, PAYOUT type without entity → tab, unknown → null', () {
      expect(
        NotificationRouter.routeForFeedItem(
            type: 'PAYOUT', entityType: 'payout', entityId: _pay),
        '/earnings/payouts/$_pay',
      );
      expect(
        NotificationRouter.routeForFeedItem(type: 'PAYOUT'),
        '/earnings?tab=payouts',
      );
      expect(
        NotificationRouter.routeForFeedItem(
            type: 'ORDER', entityType: 'order', entityId: _pay),
        '/orders/$_pay',
      );
      expect(
        NotificationRouter.routeForFeedItem(type: 'BROADCAST'),
        isNull,
      );
    });

    test('tab roots are reached with go, detail routes with push', () {
      expect(NotificationRouter.isTabRoot('/earnings?tab=payouts'), isTrue);
      expect(NotificationRouter.isTabRoot('/'), isTrue);
      expect(NotificationRouter.isTabRoot('/earnings/payouts/$_pay'), isFalse);
      expect(NotificationRouter.isTabRoot('/orders/$_pay'), isFalse);
      expect(NotificationRouter.isTabRoot('/notifications'), isFalse);
    });
  });
}
