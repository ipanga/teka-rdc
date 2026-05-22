/// Maps FCM `data` payloads to seller-mobile go_router paths.
///
/// Backend payload shapes (set in `apps/api/src/notifications/*.ts`):
///   - `{ screen: 'order-details',   orderId:   <uuid> }`   — new-order push
///   - `{ screen: 'product-details', productId: <uuid> }`   — approval / rejection
///   - `{ screen: 'product-reviews', productId: <uuid> }`   — new review
///
/// Differences from buyer-mobile:
///   - There is no `/products/:id/reviews` route — sellers see a
///     flat `/reviews` list. We route `product-reviews` events
///     there; the page itself can scroll to / filter by the
///     productId if the UI wants to.
class NotificationRouter {
  NotificationRouter._();

  /// Returns a go_router path for the data payload, or null when the
  /// payload doesn't carry a recognisable `screen` + required IDs.
  static String? routeForData(Map<String, dynamic> data) {
    final screen = data['screen'];
    if (screen is! String) return null;

    switch (screen) {
      case 'order-details':
        final id = _stringOrNull(data['orderId']);
        return id == null ? null : '/orders/$id';
      case 'product-details':
        final id = _stringOrNull(data['productId']);
        return id == null ? null : '/products/$id';
      case 'product-reviews':
        // Seller has a flat reviews surface, not per-product. Drop
        // the productId — the page can filter from query params or
        // the user can scroll to it. Route still encodes the intent.
        return '/reviews';
      default:
        return null;
    }
  }

  static String? _stringOrNull(Object? v) {
    if (v == null) return null;
    final s = v.toString();
    return s.isEmpty ? null : s;
  }
}
