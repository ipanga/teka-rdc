/// Central registry of SharedPreferences keys used by the offline cache
/// layer. Putting them in one place prevents typo collisions and makes
/// it easy to grep for what's persisted on disk.
///
/// **Naming convention:** `teka_cache_<scope>_<topic>_v<n>`. Versioning
/// matters — if the shape of a cached value changes incompatibly,
/// bump the suffix instead of trying to migrate (it's a CACHE, missing
/// values are always safe). The old entries become orphans and get
/// garbage-collected on next clear.
class CacheKeys {
  CacheKeys._();

  /// Latest fetched cart (buyer-mobile). Persists the items list +
  /// fetched-at timestamp so the user sees their cart immediately on
  /// next app launch, even when offline. Cleared on logout (not on
  /// connectivity loss).
  ///
  /// Shape: `{ "v": 1, "savedAt": "<iso-ms>", "items": [<CartItemModel.toJson()>] }`
  static const String buyerCart = 'teka_cache_buyer_cart_v1';

  // ─── Reserved for future cache wires (PR5 follow-up) ───────────────────
  // These keys are reserved + documented now so contributors don't
  // accidentally re-use them for unrelated state.

  /// Products list cache (5min TTL). Per-city — full key is
  /// `${productsList}_<cityId>`.
  static const String productsList = 'teka_cache_products_list_v1';

  /// Categories tree cache (1h TTL). Global, no city scope.
  static const String categoriesTree = 'teka_cache_categories_tree_v1';

  /// Current user profile cache (5min TTL). From GET /v1/auth/me.
  static const String userProfile = 'teka_cache_user_profile_v1';

  /// Seller-mobile only: orders list cache (1min TTL).
  static const String sellerOrdersList = 'teka_cache_seller_orders_list_v1';
}
