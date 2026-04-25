import 'dart:ui' show Locale;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Locale provider for the seller app — monolingual (FR-only) since
/// 2026-04-25. See buyer-mobile's locale_provider for the same pattern.
class LocaleNotifier extends StateNotifier<Locale> {
  static const Locale _fr = Locale('fr');
  static const supportedLocales = <Locale>[_fr];

  LocaleNotifier() : super(_fr);

  /// No-op kept for backwards compat — the app is FR-only now.
  Future<void> setLocale(Locale _) async {}
}

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale>((ref) {
  return LocaleNotifier();
});
