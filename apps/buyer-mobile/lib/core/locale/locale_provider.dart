import 'dart:ui' show Locale;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Locale provider for the buyer app — monolingual (FR-only) since
/// 2026-04-25.
///
/// Kept as a StateNotifier so the existing `MaterialApp.locale:
/// ref.watch(localeProvider)` wiring still compiles. The state is fixed at
/// `Locale('fr')` and `setLocale` is a no-op; the public surface stays
/// stable for any caller that imports it.
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
