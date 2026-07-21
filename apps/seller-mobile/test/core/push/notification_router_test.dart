import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/push/notification_router.dart';

void main() {
  group('NotificationRouter — screen payloads', () {
    test('order / product / reviews / broadcast route correctly', () {
      expect(
        NotificationRouter.routeForData(
            {'screen': 'order-details', 'orderId': 'o1'}),
        '/orders/o1',
      );
      expect(
        NotificationRouter.routeForData(
            {'screen': 'product-details', 'productId': 'p1'}),
        '/products/p1',
      );
      // Seller has a flat reviews surface.
      expect(
        NotificationRouter.routeForData(
            {'screen': 'product-reviews', 'productId': 'p1'}),
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
