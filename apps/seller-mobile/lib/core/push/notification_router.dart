/// Maps FCM `data` payloads and feed items to seller-mobile go_router paths.
///
/// Backend payload shapes (set in `apps/api/src/notifications/*.ts`):
///   - `{ screen: 'order-details',   orderId:   <uuid> }`   — new-order push
///   - `{ screen: 'product-details', productId: <uuid> }`   — approval / rejection
///   - `{ screen: 'product-reviews', productId: <uuid> }`   — new review
///   - `{ screen: 'notifications' }`                        — generic admin broadcast
///   - `{ screen: 'earnings', event: 'payout-*', payoutId: <uuid> }`
///                                                          — payout approved / paid /
///                                                            rejected / failed
///
/// A payout id in a payload is a HINT, never an authorization: the detail
/// route loads `/v1/sellers/payouts/:id`, which answers 404 for anything the
/// signed-in seller does not own (deleted, foreign or garbage ids alike).
///
/// Differences from buyer-mobile:
///   - There is no `/products/:id/reviews` route — sellers see a
///     flat `/reviews` list. We route `product-reviews` events
///     there; the page itself can scroll to / filter by the
///     productId if the UI wants to.
class NotificationRouter {
  NotificationRouter._();

  static final RegExp _uuid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  /// The payouts tab of the Revenus screen (a bottom-navigation branch root).
  static const String payoutsTab = '/earnings?tab=payouts';

  /// Detail of one of the seller's own payouts.
  static String payoutDetail(String payoutId) => '/earnings/payouts/$payoutId';

  /// Returns a go_router path for the data payload, or null when the
  /// payload doesn't carry a recognisable `screen` + required IDs.
  static String? routeForData(Map<String, dynamic> data) {
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
        // Seller has a flat reviews surface, not per-product. Drop
        // the productId — the page can filter from query params or
        // the user can scroll to it. Route still encodes the intent.
        return '/reviews';
      case 'notifications':
        // Generic admin broadcast (no linked product) → open the
        // Notification Center. Backend sends this for a plain broadcast;
        // without this case the tap did nothing. Parity with buyer-mobile.
        return '/notifications';
      case 'earnings':
        // Payout lifecycle. With a well-formed payoutId → the payout detail;
        // an old / malformed payload still lands on the payouts tab.
        final id = _uuidOrNull(data['payoutId']);
        return id == null ? payoutsTab : payoutDetail(id);
      default:
        return null;
    }
  }

  /// Where a tap on an in-app feed item goes (mirrors seller-web
  /// `hrefForNotification`). Null = stay on the feed.
  static String? routeForFeedItem({
    required String type,
    String? entityType,
    String? entityId,
  }) {
    final id = _uuidOrNull(entityId);
    if (entityType == 'product' && id != null) return '/products/$id';
    if (entityType == 'order' && id != null) return '/orders/$id';
    if (entityType == 'payout' || type == 'PAYOUT') {
      return id == null ? payoutsTab : payoutDetail(id);
    }
    return null;
  }

  /// Bottom-navigation branch roots must be reached with `go` (switch tab),
  /// not `push` (which would stack a second copy of the tab screen).
  static bool isTabRoot(String route) {
    final path = route.split('?').first;
    return const {'/', '/orders', '/products', '/earnings', '/profile'}
        .contains(path);
  }

  static String? _uuidOrNull(Object? v) {
    if (v == null) return null;
    final s = v.toString();
    return _uuid.hasMatch(s) ? s.toLowerCase() : null;
  }
}
