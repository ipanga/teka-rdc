/// Maps FCM `data` payloads to buyer-mobile go_router paths.
///
/// Backend payload shapes (set in `apps/api/src/notifications/*.ts`):
///   - `{ screen: 'order-details',   orderId:   <uuid> }`
///   - `{ screen: 'product-details', productId: <uuid> }`
///   - `{ screen: 'product-reviews', productId: <uuid> }`
///
/// Unknown `screen` values resolve to null — the caller treats null as
/// "don't navigate, just show the notification." Logging unknown values
/// in debug mode would help catch backend/client drift; today we stay
/// silent to keep this file zero-dependency.
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
        final id = _stringOrNull(data['productId']);
        return id == null ? null : '/products/$id/reviews';
      case 'notifications':
        // Generic admin broadcast → open the Notification Center.
        return '/notifications';
      default:
        return null;
    }
  }

  // FCM serialises all `data` values as strings. Defensive coerce —
  // strip empties and accept numeric IDs (future-proofing).
  static String? _stringOrNull(Object? v) {
    if (v == null) return null;
    final s = v.toString();
    return s.isEmpty ? null : s;
  }
}
