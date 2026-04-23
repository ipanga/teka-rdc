import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../../core/storage/secure_storage.dart';
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

      state = state.copyWith(cities: activeCities, isLoading: false);

      // Resolve stored city ID against the fetched list
      final storedId = await _storage.read(key: _cityIdKey);
      if (storedId != null) {
        final match =
            activeCities.where((c) => c.id == storedId).toList();
        if (match.isNotEmpty) {
          state = state.copyWith(selectedCity: match.first);
        }
      }
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Impossible de charger les villes. Veuillez reessayer.',
      );
    }
  }

  Future<void> selectCity(CityModel city) async {
    state = state.copyWith(selectedCity: city);
    await _storage.write(key: _cityIdKey, value: city.id);
  }

  Future<void> clearCity() async {
    state = state.copyWith(clearSelectedCity: true);
    await _storage.delete(key: _cityIdKey);
  }

  /// Check if a city ID is stored (without needing cities to be loaded)
  Future<bool> hasCityStored() async {
    final storedId = await _storage.read(key: _cityIdKey);
    return storedId != null && storedId.isNotEmpty;
  }
}

final cityProvider = StateNotifierProvider<CityNotifier, CityState>((ref) {
  return CityNotifier(
    ref.read(cityRepositoryProvider),
    ref.read(secureStorageProvider),
  );
});
