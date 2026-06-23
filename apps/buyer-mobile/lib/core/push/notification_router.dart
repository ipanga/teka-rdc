import '../deep_link/deep_link_parser.dart';

/// Maps FCM `data` payloads to buyer-mobile go_router paths.
///
/// Backend payload shapes (set in `apps/api/src/notifications/*.ts`):
///   - `{ screen: 'order-details',   orderId:   <uuid> }`
///   - `{ screen: 'product-details', productId: <uuid> }`
///   - `{ screen: 'product-reviews', productId: <uuid> }`
///   - `{ screen: 'notifications' }`
///   - `{ url: 'https://teka.cd/...' }` (deep link → resolved by DeepLinkParser)
///
/// Unknown `screen` values resolve to null — the caller treats null as
/// "don't navigate, just show the notification."
class NotificationRouter {
  NotificationRouter._();

  /// Returns a go_router path for the data payload, or null when the
  /// payload doesn't carry a recognisable `screen`/`url` + required IDs.
  ///
  /// A full `url`/`link` field (a Teka deep link — future-proof for broadcasts
  /// that carry a canonical URL instead of a `screen`) takes precedence and is
  /// resolved through the shared [DeepLinkParser], so notification taps and
  /// App/Universal Links route identically.
  static String? routeForData(Map<String, dynamic> data) {
    final url = _stringOrNull(data['url']) ?? _stringOrNull(data['link']);
    if (url != null) {
      final uri = Uri.tryParse(url);
      if (uri != null) {
        final target = DeepLinkParser.parse(uri);
        if (target != null) return target.route;
      }
    }

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
