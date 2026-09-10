import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/push/notification_router.dart';

void main() {
  group('NotificationRouter — screen payloads', () {
    // MS2: ids must be UUIDs. This test previously used 'abc' / 'o1' and
    // asserted they routed, which is exactly the behaviour being closed.
    const productId = '31000000-0000-0000-0000-000000000001';
    const orderId = '70000000-0000-0000-0000-000000000001';

    test('product-details / order-details / reviews / notifications', () {
      expect(
        NotificationRouter.routeForData(
            {'screen': 'product-details', 'productId': productId}),
        '/products/$productId',
      );
      expect(
        NotificationRouter.routeForData(
            {'screen': 'order-details', 'orderId': orderId}),
        '/orders/$orderId',
      );
      expect(
        NotificationRouter.routeForData(
            {'screen': 'product-reviews', 'productId': productId}),
        '/products/$productId/reviews',
      );
      expect(NotificationRouter.routeForData({'screen': 'notifications'}),
          '/notifications');
    });

    // MS2 — anyone able to deliver a push could otherwise steer in-app
    // navigation by putting a path fragment where an id belongs.
    test('a non-UUID id is refused rather than interpolated into a route', () {
      for (final bad in <String>[
        'abc',
        '../../compte',
        'x/../../profil',
        '$productId/../../commandes',
        '$productId?redirect=evil',
        '',
      ]) {
        expect(
          NotificationRouter.routeForData(
              {'screen': 'product-details', 'productId': bad}),
          isNull,
          reason: 'productId "$bad" must not build a route',
        );
        expect(
          NotificationRouter.routeForData(
              {'screen': 'order-details', 'orderId': bad}),
          isNull,
          reason: 'orderId "$bad" must not build a route',
        );
      }
    });

    test('a UUID is normalised to lower case', () {
      expect(
        NotificationRouter.routeForData(
            {'screen': 'product-details', 'productId': productId.toUpperCase()}),
        '/products/$productId',
      );
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
