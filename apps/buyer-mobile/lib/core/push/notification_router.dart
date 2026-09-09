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
        final id = _uuidOrNull(data['orderId']);
        return id == null ? null : '/orders/$id';
      case 'product-details':
        final id = _uuidOrNull(data['productId']);
        return id == null ? null : '/products/$id';
      case 'product-reviews':
        final id = _uuidOrNull(data['productId']);
        return id == null ? null : '/products/$id/reviews';
      case 'notifications':
        // Generic admin broadcast → open the Notification Center.
        return '/notifications';
      default:
        return null;
    }
  }

  // FCM serialises all `data` values as strings. Defensive coerce —
  // strip empties. Used for `url`/`link`, which DeepLinkParser validates.
  static String? _stringOrNull(Object? v) {
    if (v == null) return null;
    final s = v.toString();
    return s.isEmpty ? null : s;
  }

  static final _uuid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  /// MS2 — every entity id in a push payload must be a UUID before it is
  /// interpolated into a route.
  ///
  /// This previously accepted any string, so a payload could push an arbitrary
  /// path segment into `GoRouter` — `../`, a query string, or a route the
  /// notification was never meant to reach. Anyone able to deliver a push to
  /// the device could steer in-app navigation. seller-mobile already validated
  /// this way; this is the port.
  ///
  /// Server authorization remains the real boundary: the order screen still
  /// fetches through the API, which answers 403/404 for someone else's order.
  /// This is defence in depth on the client.
  static String? _uuidOrNull(Object? v) {
    if (v == null) return null;
    final s = v.toString();
    return _uuid.hasMatch(s) ? s.toLowerCase() : null;
  }
}
