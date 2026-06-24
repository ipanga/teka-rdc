import 'package:shared_preferences/shared_preferences.dart';

/// Persists the buyer's recent search terms (most-recent first) in
/// shared_preferences. Client-local only — no backend. Capped at [_max].
class RecentSearchesStore {
  static const _key = 'teka_recent_searches';
  static const _max = 8;

  /// Recent terms, most-recent first.
  Future<List<String>> get() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(_key) ?? const [];
  }

  /// Adds [term] to the front (dedup, case-insensitive), trimming to [_max].
  Future<void> add(String term) async {
    final t = term.trim();
    if (t.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    final current = prefs.getStringList(_key) ?? <String>[];
    current.removeWhere((e) => e.toLowerCase() == t.toLowerCase());
    current.insert(0, t);
    final trimmed = current.take(_max).toList();
    await prefs.setStringList(_key, trimmed);
  }

  /// Removes a single term.
  Future<void> remove(String term) async {
    final prefs = await SharedPreferences.getInstance();
    final current = prefs.getStringList(_key) ?? <String>[];
    current.removeWhere((e) => e.toLowerCase() == term.toLowerCase());
    await prefs.setStringList(_key, current);
  }

  /// Clears all recent searches.
  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
