import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/push/notification_router.dart';

void main() {
  group('NotificationRouter — screen payloads', () {
    test('product-details / order-details / reviews / notifications', () {
      expect(
        NotificationRouter.routeForData(
            {'screen': 'product-details', 'productId': 'abc'}),
        '/products/abc',
      );
      expect(
        NotificationRouter.routeForData(
            {'screen': 'order-details', 'orderId': 'o1'}),
        '/orders/o1',
      );
      expect(
        NotificationRouter.routeForData(
            {'screen': 'product-reviews', 'productId': 'abc'}),
        '/products/abc/reviews',
      );
      expect(NotificationRouter.routeForData({'screen': 'notifications'}),
          '/notifications');
    });

    test('unknown / missing → null', () {
      expect(NotificationRouter.routeForData({'screen': 'mystery'}), isNull);
      expect(NotificationRouter.routeForData({'screen': 'product-details'}),
          isNull);
      expect(NotificationRouter.routeForData(const {}), isNull);
    });
  });

  group('NotificationRouter — url payloads (deep link via DeepLinkParser)', () {
    test('a Teka product URL resolves to the product route', () {
      expect(
        NotificationRouter.routeForData(
            {'url': 'https://teka.cd/kolwezi/samsung-galaxy-a14-foyug0'}),
        '/products/foyug0',
      );
    });

    test('url takes precedence over screen', () {
      expect(
        NotificationRouter.routeForData({
          'url': 'https://teka.cd/promotions',
          'screen': 'notifications',
        }),
        '/promotions',
      );
    });

    test('a non-teka / unmappable url falls through to screen', () {
      expect(
        NotificationRouter.routeForData({
          'url': 'https://evil.com/x',
          'screen': 'notifications',
        }),
        '/notifications',
      );
    });

    test('`link` alias is also honoured', () {
      expect(
        NotificationRouter.routeForData({'link': 'https://teka.cd/recherche?q=tv'}),
        '/search?q=tv',
      );
    });
  });
}
