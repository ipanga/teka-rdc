import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../providers/core_providers.dart';

/// Generic typed key/value cache backed by [SharedPreferences] with
/// stale-while-reconnecting semantics.
///
/// **Why this exists:** the DRC's 2G/3G networks make every GET round-
/// trip painful. Caching read-heavy GETs (products list, categories
/// tree, user profile, seller orders) means:
///   * Lists appear instantly on screen entry (cached path) while the
///     refresh request is in flight.
///   * When offline, the user still sees their last view instead of a
///     blank "Pas de connexion internet" screen.
///
/// **Storage shape on disk** (one entry per key):
/// ```json
/// {
///   "v":       1,
///   "savedAt": "2026-05-27T18:00:00.000Z",
///   "ttlMs":   300000,
///   "value":   <whatever toJson() produced>
/// }
/// ```
///
/// **Stale-while-reconnecting:** `read()` returns the cached value even
/// past TTL **when the device is offline**. Callers that care about the
/// distinction can check [CacheEntry.isFresh]. Online callers should
/// drop stale entries and re-fetch.
///
/// **No eviction logic.** SharedPreferences is small + per-key access;
/// stale orphan entries don't hurt anything until the user does a
/// `clearAll()` (e.g. on logout / app reset). If we ever want LRU, swap
/// to Hive or sqflite — out of scope for the connectivity initiative.
class TypedCache {
  TypedCache(this._prefs);

  static const int _currentVersion = 1;

  final SharedPreferences _prefs;

  /// Write [value] to [key] with the given [ttl]. [toJson] is called
  /// inline to serialize. Failures (disk full, etc.) are silent — the
  /// cache is best-effort.
  Future<void> write<T>(
    String key,
    T value, {
    required Map<String, Object?> Function(T value) toJson,
    required Duration ttl,
  }) async {
    try {
      final envelope = {
        'v': _currentVersion,
        'savedAt': DateTime.now().toUtc().toIso8601String(),
        'ttlMs': ttl.inMilliseconds,
        'value': toJson(value),
      };
      await _prefs.setString(key, jsonEncode(envelope));
    } catch (_) {
      // Best-effort. Cache failures should never break the app.
    }
  }

  /// Read the entry at [key], deserializing via [fromJson]. Returns
  /// `null` when the key doesn't exist OR the envelope is corrupt OR the
  /// version doesn't match.
  ///
  /// **Always returns the stored value when it exists**, even if past
  /// TTL — TTL is a hint, not a hard expiry. Callers use
  /// [CacheEntry.isFresh] to decide whether to use it or re-fetch.
  CacheEntry<T>? read<T>(
    String key, {
    required T Function(Map<String, Object?> json) fromJson,
  }) {
    final raw = _prefs.getString(key);
    if (raw == null) return null;
    try {
      final envelope = jsonDecode(raw) as Map<String, Object?>;
      final version = envelope['v'] as int?;
      if (version != _currentVersion) return null;

      final savedAtIso = envelope['savedAt'] as String?;
      final ttlMs = envelope['ttlMs'] as int?;
      final valueJson = envelope['value'];
      if (savedAtIso == null || ttlMs == null || valueJson == null) {
        return null;
      }

      final savedAt = DateTime.parse(savedAtIso);
      final value = fromJson(valueJson as Map<String, Object?>);
      return CacheEntry<T>(
        value: value,
        savedAt: savedAt,
        ttl: Duration(milliseconds: ttlMs),
      );
    } catch (_) {
      // Corrupt entry. Pretend it's not there.
      return null;
    }
  }

  /// Drop a single key.
  Future<void> evict(String key) async {
    try {
      await _prefs.remove(key);
    } catch (_) {
      // Silent — same rationale as write().
    }
  }

  /// Drop every entry whose key starts with [prefix]. Useful for
  /// scope-based clears (e.g. `evictPrefix(CacheKeys.productsList)` to
  /// invalidate all per-city product caches).
  Future<void> evictPrefix(String prefix) async {
    try {
      final keys = _prefs.getKeys().where((k) => k.startsWith(prefix));
      for (final k in keys) {
        await _prefs.remove(k);
      }
    } catch (_) {
      // Silent.
    }
  }
}

/// A value pulled from the cache plus the metadata needed to decide
/// whether it's fresh enough to use without a refresh.
class CacheEntry<T> {
  CacheEntry({
    required this.value,
    required this.savedAt,
    required this.ttl,
  });

  final T value;
  final DateTime savedAt;
  final Duration ttl;

  /// True when the entry is within its TTL window. Always returns true
  /// for non-negative TTL Durations; false when [savedAt] is in the
  /// future (clock skew) — defensive.
  bool get isFresh {
    final age = DateTime.now().difference(savedAt);
    if (age.isNegative) return false;
    return age < ttl;
  }

  /// Age of this entry. Negative when [savedAt] is in the future
  /// (clock skew); callers usually want [isFresh] instead.
  Duration get age => DateTime.now().difference(savedAt);
}

/// Singleton TypedCache backed by the global SharedPreferences
/// instance. Created lazily on first access; lives for the app
/// lifetime.
final typedCacheProvider = Provider<TypedCache>((ref) {
  final prefs = ref.watch(sharedPreferencesProvider);
  return TypedCache(prefs);
});
