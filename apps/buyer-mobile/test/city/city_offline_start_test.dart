// A3 (2026-09-06) — offline cold start restores the stored town from the
// cached town list instead of blocking the buyer at the town gate.
import 'package:buyer_mobile/core/cache/typed_cache.dart';
import 'package:buyer_mobile/features/city/data/city_repository.dart';
import 'package:buyer_mobile/features/city/data/models/city_model.dart';
import 'package:buyer_mobile/features/city/presentation/providers/city_provider.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _lub = '01000000-0000-0000-0000-000000000001';
const _kol = '01000000-0000-0000-0000-000000000002';
const _cityIdKey = 'teka_selected_city_id';

CityModel _city(String id, String name) => CityModel(id: id, name: name, slug: name.toLowerCase(), province: 'Haut-Katanga', isActive: true, sortOrder: 0);

class _Repo implements CityRepository {
  _Repo(this._cities, {this.offline = false});
  final List<CityModel> _cities;
  bool offline;
  @override
  Future<List<CityModel>> getCities() async {
    await Future<void>.delayed(Duration.zero);
    if (offline) throw Exception('SocketException: Failed host lookup');
    return _cities;
  }
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _Storage extends FlutterSecureStorage {
  _Storage(this._store) : super();
  final Map<String, String> _store;
  @override
  Future<String?> read({required String key, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async => _store[key];
  @override
  Future<void> write({required String key, required String? value, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async {
    if (value == null) {
      _store.remove(key);
    } else {
      _store[key] = value;
    }
  }
  @override
  Future<void> delete({required String key, AppleOptions? iOptions, AndroidOptions? aOptions, LinuxOptions? lOptions, WebOptions? webOptions, AppleOptions? mOptions, WindowsOptions? wOptions}) async => _store.remove(key);
}

Future<void> _settle() async {
  for (var i = 0; i < 5; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  late TypedCache cache;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    cache = TypedCache(await SharedPreferences.getInstance());
  });

  test('an online launch caches the town list', () async {
    final n = CityNotifier(_Repo([_city(_lub, 'Lubumbashi'), _city(_kol, 'Kolwezi')]), _Storage({}), cache);
    await _settle();
    expect(n.state.cities.length, 2);
    expect(cache.read<Map<String, Object?>>('teka_cache_cities_v1', fromJson: (j) => j), isNotNull);
  });

  test('offline launch with a stored town and a cached list → town restored, gate stays shut, no error', () async {
    // First launch online populates the cache…
    final storage = _Storage({_cityIdKey: _kol});
    final online = CityNotifier(_Repo([_city(_lub, 'Lubumbashi'), _city(_kol, 'Kolwezi')]), storage, cache);
    await _settle();
    expect(online.state.selectedCity?.id, _kol);

    // …the next launch has no network.
    final offline = CityNotifier(_Repo(const [], offline: true), storage, cache);
    await _settle();
    expect(offline.state.isLoading, isFalse);
    expect(offline.state.error, isNull);
    expect(offline.state.hasCity, isTrue);
    expect(offline.state.selectedCity?.name, 'Kolwezi');
    expect(offline.state.cities.map((c) => c.id), containsAll([_lub, _kol]));
  });

  test('offline first launch with nothing cached → the picker with its retry, as before', () async {
    final n = CityNotifier(_Repo(const [], offline: true), _Storage({}), cache);
    await _settle();
    expect(n.state.isLoading, isFalse);
    expect(n.state.hasCity, isFalse);
    expect(n.state.error, isNotNull);
  });

  test('offline launch, cached list but no stored town → gate opens (nothing to restore)', () async {
    final storage = _Storage({});
    CityNotifier(_Repo([_city(_lub, 'Lubumbashi')]), storage, cache);
    await _settle();
    final offline = CityNotifier(_Repo(const [], offline: true), storage, cache);
    await _settle();
    expect(offline.state.hasCity, isFalse);
    expect(offline.state.error, isNull);
    expect(offline.state.cities, isNotEmpty);
  });
}
