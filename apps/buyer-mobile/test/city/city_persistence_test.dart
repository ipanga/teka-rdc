// Town persistence across cold starts.
//
// The router's town gate (app_router.dart) redirects to /city-selection on
// `!cityState.hasCity && !cityState.isLoading`, and re-evaluates on every
// state change via refreshListenable. So CityNotifier must never publish
// `isLoading: false` while a stored town is still unresolved — that opens the
// gate for the duration of the storage read and bounces the buyer to the town
// picker on every launch (with their own town already highlighted, because it
// lands milliseconds later).
//
// These tests assert the invariant the gate depends on, not the internals.

import 'package:buyer_mobile/features/city/data/city_repository.dart';
import 'package:buyer_mobile/features/city/data/models/city_model.dart';
import 'package:buyer_mobile/features/city/presentation/providers/city_provider.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

const _lubumbashiId = '01000000-0000-0000-0000-000000000001';
const _kolweziId = '01000000-0000-0000-0000-000000000002';
const _cityIdKey = 'teka_selected_city_id';

CityModel _city(String id, String name, {bool isActive = true, int sort = 0}) =>
    CityModel(
      id: id,
      name: name,
      slug: name.toLowerCase(),
      province: 'Haut-Katanga',
      isActive: isActive,
      sortOrder: sort,
    );

class _FakeRepository implements CityRepository {
  _FakeRepository(this._cities);
  final List<CityModel> _cities;
  int getCitiesCalls = 0;

  @override
  Future<List<CityModel>> getCities() async {
    getCitiesCalls++;
    // Yield, so any state published before the storage read is observable.
    await Future<void>.delayed(Duration.zero);
    return _cities;
  }

  /// MS5: the session-boundary clear must NOT push a null preference to the
  /// server, so the test needs to see whether this was called.
  int setPreferredCityCalls = 0;

  @override
  Future<void> setPreferredCity(String? cityId) async {
    setPreferredCityCalls++;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

/// Secure storage double whose reads are deliberately slow, so a premature
/// `isLoading: false` would be observable rather than a flake.
class _FakeStorage extends FlutterSecureStorage {
  _FakeStorage([this._store = const {}]) : super();
  Map<String, String> _store;
  final List<String> deleted = [];

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 20));
    return _store[key];
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    _store = {..._store, if (value != null) key: value};
  }

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    deleted.add(key);
    _store = {..._store}..remove(key);
  }
}

/// The notifier kicks off its own load in the constructor, so tests wait for
/// that to settle rather than calling fetchCities() again (a second call races
/// the in-flight one).
Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 80));

void main() {
  final cities = [
    _city(_lubumbashiId, 'Lubumbashi', sort: 0),
    _city(_kolweziId, 'Kolwezi', sort: 1),
  ];

  group('CityNotifier — cold start with a stored town', () {
    test('never reports "not loading, no city" — the gate must not open',
        () async {
      final notifier = CityNotifier(
        _FakeRepository(cities),
        _FakeStorage({_cityIdKey: _lubumbashiId}),
      );

      // Every state the router could observe while the town resolves.
      final gateWouldOpen = <bool>[];
      notifier.addListener(
        (s) => gateWouldOpen.add(!s.hasCity && !s.isLoading),
        fireImmediately: true,
      );

      await _settle();

      // The very first (constructor) state is the only legitimate
      // "no city, not loading" moment, before loading starts.
      expect(
        gateWouldOpen.skip(1).contains(true),
        isFalse,
        reason: 'published a state that would redirect to /city-selection '
            'while a stored town was still resolving',
      );
      expect(notifier.state.selectedCity?.id, _lubumbashiId);
      notifier.dispose();
    });

    test('restores the stored town', () async {
      final notifier = CityNotifier(
        _FakeRepository(cities),
        _FakeStorage({_cityIdKey: _kolweziId}),
      );
      await _settle();

      expect(notifier.state.selectedCity?.id, _kolweziId);
      expect(notifier.state.isLoading, isFalse);
      notifier.dispose();
    });
  });

  group('CityNotifier — no or unusable stored town', () {
    test('fresh install leaves no town so the gate can ask', () async {
      final notifier = CityNotifier(_FakeRepository(cities), _FakeStorage());
      await _settle();

      expect(notifier.state.selectedCity, isNull);
      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.cities, hasLength(2));
      notifier.dispose();
    });

    test('a deactivated town is not restored and its id is dropped', () async {
      final storage = _FakeStorage({_cityIdKey: _kolweziId});
      final notifier = CityNotifier(
        // Kolwezi comes back deactivated → filtered out of the active list.
        _FakeRepository([
          _city(_lubumbashiId, 'Lubumbashi'),
          _city(_kolweziId, 'Kolwezi', isActive: false, sort: 1),
        ]),
        storage,
      );
      await _settle();

      expect(notifier.state.selectedCity, isNull);
      expect(storage.deleted, contains(_cityIdKey),
          reason: 'a dangling town id would be re-resolved on every launch');
      notifier.dispose();
    });

    test('an unknown stored id is not restored and its id is dropped',
        () async {
      final storage = _FakeStorage({_cityIdKey: 'deleted-town-id'});
      final notifier = CityNotifier(_FakeRepository(cities), storage);
      await _settle();

      expect(notifier.state.selectedCity, isNull);
      expect(storage.deleted, contains(_cityIdKey));
      notifier.dispose();
    });
  });

  group('CityNotifier — selection and clearing', () {
    test('selectCity persists the id for the next cold start', () async {
      final storage = _FakeStorage();
      final notifier = CityNotifier(_FakeRepository(cities), storage);
      await _settle();

      await notifier.selectCity(cities.first);
      expect(notifier.state.selectedCity?.id, _lubumbashiId);
      expect(await storage.read(key: _cityIdKey), _lubumbashiId);
      notifier.dispose();

      // A new notifier over the same storage = the next cold start.
      final restarted = CityNotifier(_FakeRepository(cities), storage);
      await _settle();
      expect(restarted.state.selectedCity?.id, _lubumbashiId);
      restarted.dispose();
    });

    test('changing town replaces the persisted id', () async {
      final storage = _FakeStorage({_cityIdKey: _lubumbashiId});
      final notifier = CityNotifier(_FakeRepository(cities), storage);
      await _settle();

      await notifier.selectCity(cities[1]);
      expect(await storage.read(key: _cityIdKey), _kolweziId);
      notifier.dispose();
    });

    // NB: this used to be titled "(logout path)". It was not — nothing in
    // lib/ called clearCity(), so the title implied a guarantee the app did
    // not make, and MS5's town gap survived behind it. clearCity() is the
    // buyer deliberately unsetting their town from the UI.
    test('clearCity removes the persisted id (explicit user action)', () async {
      final storage = _FakeStorage({_cityIdKey: _lubumbashiId});
      final notifier = CityNotifier(_FakeRepository(cities), storage);
      await _settle();

      await notifier.clearCity();
      expect(notifier.state.selectedCity, isNull);
      expect(await storage.read(key: _cityIdKey), isNull);
      notifier.dispose();
    });

    // MS5 — the town is private state and must not cross a session boundary.
    test('clearLocalCity drops the town without syncing null to the profile',
        () async {
      final storage = _FakeStorage({_cityIdKey: _lubumbashiId});
      final repo = _FakeRepository(cities);
      final notifier = CityNotifier(repo, storage);
      notifier.isAuthenticated = true;
      await _settle();
      expect(notifier.state.selectedCity, isNotNull,
          reason: 'precondition: a town is held');

      await notifier.clearLocalCity();

      expect(notifier.state.selectedCity, isNull);
      expect(await storage.read(key: _cityIdKey), isNull);
      expect(repo.setPreferredCityCalls, 0,
          reason:
              'a session boundary must not wipe the outgoing account\'s saved '
              'preference, and there is no valid session to call with');
      notifier.dispose();
    });

    // The concrete symptom the gap produced: B inherits A's town, and because
    // hydrateFromProfile bails on `if (state.hasCity) return`, B's own
    // server-side preferredCityId is silently ignored.
    test('after clearLocalCity the next account gets its OWN profile town',
        () async {
      final storage = _FakeStorage({_cityIdKey: _lubumbashiId});
      final notifier = CityNotifier(_FakeRepository(cities), storage);
      await _settle();

      // A's town is held; B's profile says Kolwezi.
      await notifier.hydrateFromProfile(_kolweziId);
      expect(notifier.state.selectedCity?.id, _lubumbashiId,
          reason: 'without a clear, A\'s local choice wins — the bug');

      await notifier.clearLocalCity();
      await notifier.hydrateFromProfile(_kolweziId);
      expect(notifier.state.selectedCity?.id, _kolweziId);
      expect(await storage.read(key: _cityIdKey), _kolweziId);
      notifier.dispose();
    });
  });
}
