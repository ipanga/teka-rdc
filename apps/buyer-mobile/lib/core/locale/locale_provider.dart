import 'dart:ui' show Locale;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// User-facing locale choice for the buyer app.
///
/// * Default is French — matches the prisma User.locale default and the
///   next-intl default across the web apps.
/// * Persisted to flutter_secure_storage under the key below, so a choice
///   survives a restart or reinstall-with-restore.
/// * Only two locales are supported today; anything else resolves to `fr`.
///
/// Wire the active locale into MaterialApp via:
///   `locale: ref.watch(localeProvider)`
/// and change it with:
///   `ref.read(localeProvider.notifier).setLocale(const Locale('en'))`
class LocaleNotifier extends StateNotifier<Locale> {
  static const _storageKey = 'teka_locale';
  static const _fallback = Locale('fr');
  static const supportedLocales = <Locale>[Locale('fr'), Locale('en')];

  final FlutterSecureStorage _storage;

  LocaleNotifier(this._storage) : super(_fallback) {
    _loadSaved();
  }

  Future<void> _loadSaved() async {
    try {
      final saved = await _storage.read(key: _storageKey);
      if (saved != null) {
        final match = supportedLocales.firstWhere(
          (l) => l.languageCode == saved,
          orElse: () => _fallback,
        );
        if (match != state) state = match;
      }
    } catch (_) {
      // Storage failures are non-fatal — stay on the French fallback.
    }
  }

  Future<void> setLocale(Locale locale) async {
    final match = supportedLocales.firstWhere(
      (l) => l.languageCode == locale.languageCode,
      orElse: () => _fallback,
    );
    state = match;
    try {
      await _storage.write(key: _storageKey, value: match.languageCode);
    } catch (_) {
      // Ignore persistence failure; the in-memory state is still applied.
    }
  }
}

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale>((ref) {
  return LocaleNotifier(const FlutterSecureStorage());
});
