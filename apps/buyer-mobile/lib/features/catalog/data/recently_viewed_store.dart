import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/providers/core_providers.dart';
import 'models/product_model.dart';

const _kRecentlyViewedKey = 'teka_recently_viewed';
const _kMaxRecentlyViewed = 12;

/// Client-local "recently viewed" history backed by SharedPreferences (Phase D
/// / D-3). Per-device, most-recent-first, deduped, capped. Persisted (server-
/// side) view-tracking is deliberately out of scope for Initiative #2.
class RecentlyViewedStore {
  final SharedPreferences _prefs;

  RecentlyViewedStore(this._prefs);

  List<BrowseProductModel> getAll() {
    final raw = _prefs.getString(_kRecentlyViewedKey);
    if (raw == null) return const [];
    try {
      final list = jsonDecode(raw) as List;
      return list
          .map((e) => BrowseProductModel.fromJson(e as Map<String, dynamic>))
          .toList(growable: false);
    } catch (_) {
      return const [];
    }
  }

  Future<void> add(BrowseProductModel product) async {
    final current = getAll().where((p) => p.id != product.id).toList();
    final next = [product, ...current].take(_kMaxRecentlyViewed).toList();
    try {
      await _prefs.setString(
        _kRecentlyViewedKey,
        jsonEncode(next.map((p) => p.toJson()).toList()),
      );
    } catch (_) {
      // Best-effort: ignore serialization / storage failures.
    }
  }
}

final recentlyViewedStoreProvider = Provider<RecentlyViewedStore>((ref) {
  return RecentlyViewedStore(ref.watch(sharedPreferencesProvider));
});
