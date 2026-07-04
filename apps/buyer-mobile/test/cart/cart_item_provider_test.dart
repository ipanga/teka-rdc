import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/features/cart/data/models/cart_model.dart';

// Mirrors the pure lookup `cartItemProvider` performs over CartState.items —
// the product-detail bar uses it to decide add-button vs quantity-stepper.
CartItemModel? findCartItem(List<CartItemModel> items, String productId) {
  for (final item in items) {
    if (item.productId == productId) return item;
  }
  return null;
}

CartItemModel _item(String productId, int qty) => CartItemModel(
      id: 'ci-$productId',
      productId: productId,
      quantity: qty,
      product: const CartItemProduct(title: 'T', priceCDF: '1000', quantity: 9),
    );

void main() {
  group('cartItemProvider lookup', () {
    test('returns the matching line with its cart quantity', () {
      final items = [_item('p1', 2), _item('p2', 5)];
      final hit = findCartItem(items, 'p2');
      expect(hit, isNotNull);
      expect(hit!.quantity, 5);
    });

    test('returns null when the product is not in the cart', () {
      final items = [_item('p1', 1)];
      expect(findCartItem(items, 'absent'), isNull);
    });

    test('returns null for an empty cart', () {
      expect(findCartItem(const [], 'p1'), isNull);
    });
  });

  group('CartItemProduct stock cap', () {
    test('exposes stock (product.quantity) distinct from the cart quantity', () {
      final line = _item('p1', 3); // 3 in cart, stock is 9
      expect(line.quantity, 3);
      expect(line.product.quantity, 9);
      expect(line.quantity < line.product.quantity, isTrue); // + allowed
    });
  });
}
