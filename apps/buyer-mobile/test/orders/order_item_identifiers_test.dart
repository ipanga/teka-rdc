// OrderItemModel exposes two identifiers on purpose, and mixing them up is the
// bug this suite guards:
//
//   productLinkId  — display only. Prefers the shortCode so the in-app route
//                    matches the canonical public URL.
//   productReviewId — the product uuid, for API-bound routes. The reviews and
//                    wishlist endpoints are ParseUUIDPipe and answer a
//                    shortCode with 400 "Validation failed (uuid is expected)",
//                    which is what the rating screen used to show.

import 'package:buyer_mobile/features/orders/data/models/order_model.dart';
import 'package:flutter_test/flutter_test.dart';

const _productUuid = '31000000-0000-0000-0000-000000000042';

Map<String, dynamic> _itemJson({
  String? shortCode,
  String status = 'ACTIVE',
  String productId = _productUuid,
}) {
  return {
    'id': '80000000-0000-0000-0000-000000000001', // ORDER ITEM id, not product
    'productId': productId,
    'productTitle': 'Lot de 2 chemises',
    'quantity': 1,
    'unitPriceCDF': '3000000',
    'totalCDF': '3000000',
    'product': {
      'id': productId,
      'slug': 'lot-de-2-chemises',
      if (shortCode != null) 'shortCode': shortCode,
      'status': status,
    },
  };
}

void main() {
  group('OrderItemModel identifiers', () {
    test('parses the order-item id and the product uuid separately', () {
      final item = OrderItemModel.fromJson(_itemJson(shortCode: 'ab12cd'));

      expect(item.id, '80000000-0000-0000-0000-000000000001');
      expect(item.productId, _productUuid);
    });

    test('productLinkId prefers the shortCode for the public-looking route', () {
      final item = OrderItemModel.fromJson(_itemJson(shortCode: 'ab12cd'));
      expect(item.productLinkId, 'ab12cd');
    });

    test('productReviewId is always the uuid, never the shortCode', () {
      final item = OrderItemModel.fromJson(_itemJson(shortCode: 'ab12cd'));

      expect(item.productReviewId, _productUuid);
      expect(item.productReviewId, isNot(item.productLinkId));
    });

    test('productLinkId falls back to the uuid when no shortCode is sent', () {
      final item = OrderItemModel.fromJson(_itemJson());

      expect(item.productLinkId, _productUuid);
      expect(item.productReviewId, _productUuid);
    });

    test('both are null for a product that is no longer active', () {
      final item = OrderItemModel.fromJson(
        _itemJson(shortCode: 'ab12cd', status: 'SUSPENDED'),
      );

      expect(item.productLinkId, isNull);
      expect(item.productReviewId, isNull);
    });

    test('productReviewId is null when the payload carries no productId', () {
      final item = OrderItemModel.fromJson(
        _itemJson(shortCode: 'ab12cd', productId: ''),
      );

      // The PDP link still works off the shortCode; rating is correctly hidden
      // rather than opening a screen that would 400.
      expect(item.productLinkId, 'ab12cd');
      expect(item.productReviewId, isNull);
    });
  });
}
