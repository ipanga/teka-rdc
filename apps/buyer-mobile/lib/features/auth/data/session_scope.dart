import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/cache/cache_keys.dart';
import '../../../core/cache/typed_cache.dart';
import '../../../core/providers/core_providers.dart';
import '../../catalog/data/recent_searches_store.dart';
import '../../catalog/data/recently_viewed_store.dart';

/// Everything on this device that belongs to ONE signed-in account, and the
/// two operations the session lifecycle needs on it (A4, 2026-09-06):
///
///  * [cacheProfile] / [readCachedProfile] — the last `/v1/auth/me` answer,
///    so an offline cold start (A2) still knows who is signed in;
///  * [clearPrivateState] — called on logout and before another account
///    signs in, so Buyer B on a shared phone never sees Buyer A's cart,
///    profile, browsing history or searches. Public catalogue caches
///    (categories, product lists) are deliberately NOT touched: they are the
///    same for everyone and expensive on 2G.
///
/// In-memory notifier state (cart, orders, notifications, wishlist) is reset
/// by each provider's own `authProvider` listener; this class owns the disk.
class SessionScope {
  SessionScope(this._cache, this._recentlyViewed, this._recentSearches);

  final TypedCache _cache;
  final RecentlyViewedStore? _recentlyViewed;
  final RecentSearchesStore? _recentSearches;

  /// The profile is small and changes rarely; keep it long enough to cover
  /// any plausible offline stretch.
  static const Duration profileTtl = Duration(days: 30);

  Future<void> cacheProfile(Map<String, dynamic> user) => _cache.write<Map<String, dynamic>>(
        CacheKeys.userProfile,
        user,
        toJson: (u) => u,
        ttl: profileTtl,
      );

  Map<String, dynamic>? readCachedProfile() => _cache
      .read<Map<String, dynamic>>(
        CacheKeys.userProfile,
        fromJson: (json) => Map<String, dynamic>.from(json),
      )
      ?.value;

  Future<void> clearPrivateState() async {
    await _cache.evict(CacheKeys.userProfile);
    await _cache.evict(CacheKeys.buyerCart);
    await _recentlyViewed?.clear();
    await _recentSearches?.clear();
  }
}

final sessionScopeProvider = Provider<SessionScope>((ref) {
  final SharedPreferences prefs = ref.read(sharedPreferencesProvider);
  return SessionScope(
    ref.read(typedCacheProvider),
    RecentlyViewedStore(prefs),
    RecentSearchesStore(),
  );
});
