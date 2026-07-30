import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/city_repository.dart';
import '../../data/models/city_model.dart';

class CityState {
  final CityModel? selectedCity;
  final List<CityModel> cities;
  final bool isLoading;
  final String? error;

  const CityState({
    this.selectedCity,
    this.cities = const [],
    this.isLoading = false,
    this.error,
  });

  CityState copyWith({
    CityModel? selectedCity,
    List<CityModel>? cities,
    bool? isLoading,
    String? error,
    bool clearSelectedCity = false,
    bool clearError = false,
  }) {
    return CityState(
      selectedCity:
          clearSelectedCity ? null : (selectedCity ?? this.selectedCity),
      cities: cities ?? this.cities,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }

  bool get hasCity => selectedCity != null;
}

class CityNotifier extends StateNotifier<CityState> {
  final CityRepository _repository;
  final FlutterSecureStorage _storage;

  static const _cityIdKey = 'teka_selected_city_id';

  // Whether the user is signed in — drives whether we sync the town to the
  // profile. Set by the provider's auth listener (Guest Browsing, 2026-06-22):
  // guests select towns locally and must NOT call the auth-only preferred-city
  // endpoint (which would 401 on every selection).
  bool _isAuthenticated = false;
  // ignore: avoid_setters_without_getters
  set isAuthenticated(bool value) => _isAuthenticated = value;

  CityNotifier(this._repository, this._storage) : super(const CityState()) {
    _init();
  }

  Future<void> _init() async {
    await fetchCities();
  }

  Future<void> fetchCities() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final cities = await _repository.getCities();
      // Filter to only active cities and sort by sortOrder
      final activeCities = cities.where((c) => c.isActive).toList()
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

      // Resolve the stored town BEFORE publishing `isLoading: false`.
      //
      // The router's town gate (app_router.dart) redirects on
      // `!hasCity && !isLoading`, and `refreshListenable` re-evaluates it on
      // every state change. Emitting `isLoading: false` here while
      // `selectedCity` was still null opened that gate for the duration of the
      // storage read below, so EVERY cold start bounced the buyer to
      // /city-selection — with their town already highlighted, because it
      // resolved a few milliseconds later. The choice was never lost or
      // overwritten, only published too late.
      //
      // Everything the gate reads is therefore committed in a single terminal
      // state update.
      final storedId = await _storage.read(key: _cityIdKey);
      CityModel? restored;
      if (storedId != null && storedId.isNotEmpty) {
        final match = activeCities.where((c) => c.id == storedId).toList();
        if (match.isNotEmpty) {
          restored = match.first;
        } else {
          // The stored town is gone or was deactivated — drop the dangling id
          // so it can't be re-resolved on every launch, and let the gate ask
          // for a new choice.
          await _storage.delete(key: _cityIdKey);
        }
      }

      state = state.copyWith(
        cities: activeCities,
        // copyWith keeps the existing value when null, so an unresolvable
        // stored id leaves any in-session choice untouched.
        selectedCity: restored,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Impossible de charger les villes. Veuillez réessayer.',
      );
    }
  }

  Future<void> selectCity(CityModel city) async {
    state = state.copyWith(selectedCity: city);
    await _storage.write(key: _cityIdKey, value: city.id);
    // Tag the active town on the Sentry scope so captured errors are
    // location-aware (enterprise error handling, 2026-06-22).
    Sentry.configureScope(
      (scope) => scope.setTag('city', city.slug ?? city.id),
    );
    // Persist to the profile so the town follows the buyer across devices.
    // Fire-and-forget: a sync failure must never block town selection (the
    // secure-storage write above already holds the choice locally).
    _syncPreferredCity(city.id);
  }

  Future<void> clearCity() async {
    state = state.copyWith(clearSelectedCity: true);
    await _storage.delete(key: _cityIdKey);
    _syncPreferredCity(null);
  }

  /// Adopt the town saved on the user's profile (preferredCityId) after login,
  /// but only when the buyer has no local selection — the on-device choice wins.
  /// Lets the town set on the web (or another device) carry over. Does NOT
  /// re-sync to the profile (the value already came from there).
  Future<void> hydrateFromProfile(String? preferredCityId) async {
    if (preferredCityId == null || preferredCityId.isEmpty) return;
    if (state.hasCity) return;
    if (state.cities.isEmpty) await fetchCities();
    if (state.hasCity) return; // fetchCities may have resolved a local choice
    final match = state.cities.where((c) => c.id == preferredCityId).toList();
    if (match.isNotEmpty) {
      state = state.copyWith(selectedCity: match.first);
      await _storage.write(key: _cityIdKey, value: match.first.id);
    }
  }

  void _syncPreferredCity(String? cityId) {
    // Guests have no account to sync to — skip the auth-only endpoint entirely.
    if (!_isAuthenticated) return;
    // ignore: avoid-ignoring-return-values — fire-and-forget profile sync
    _repository.setPreferredCity(cityId).catchError((_) {});
  }

  /// Check if a city ID is stored (without needing cities to be loaded)
  Future<bool> hasCityStored() async {
    final storedId = await _storage.read(key: _cityIdKey);
    return storedId != null && storedId.isNotEmpty;
  }
}

final cityProvider = StateNotifierProvider<CityNotifier, CityState>((ref) {
  final notifier = CityNotifier(
    ref.read(cityRepositoryProvider),
    ref.read(secureStorageProvider),
  );
  // When the session resolves to authenticated, adopt the town saved on the
  // profile (preferredCityId from /v1/auth/me) if the buyer has no local
  // choice — so the town follows the user across devices (and the post-login
  // city gate is skipped when a profile town exists).
  ref.listen<AuthState>(authProvider, (_, next) {
    // Gate the profile-sync so guests never call the auth-only preferred-city
    // endpoint.
    notifier.isAuthenticated = next.status == AuthStatus.authenticated;
    if (next.status == AuthStatus.authenticated) {
      final preferredCityId = next.user?['preferredCityId'] as String?;
      if (preferredCityId != null) {
        notifier.hydrateFromProfile(preferredCityId);
      }
    }
  }, fireImmediately: true);
  return notifier;
});
