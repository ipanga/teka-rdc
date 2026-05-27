// Unit tests for TypedCache.
//
// Uses `SharedPreferences.setMockInitialValues` to give the test a
// real-but-in-memory backing store. No fakes needed.

import 'package:buyer_mobile/core/cache/typed_cache.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TypedCache', () {
    late SharedPreferences prefs;
    late TypedCache cache;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      cache = TypedCache(prefs);
    });

    test('returns null on missing key', () {
      final entry = cache.read<_Sample>(
        'missing',
        fromJson: _Sample.fromJson,
      );
      expect(entry, isNull);
    });

    test('round-trips a value through write + read', () async {
      final value = _Sample(name: 'Alice', count: 42);
      await cache.write<_Sample>(
        'k',
        value,
        toJson: _Sample.toJson,
        ttl: const Duration(minutes: 5),
      );

      final entry = cache.read<_Sample>('k', fromJson: _Sample.fromJson);
      expect(entry, isNotNull);
      expect(entry!.value.name, 'Alice');
      expect(entry.value.count, 42);
    });

    test('isFresh: true within TTL, false past TTL', () async {
      final value = _Sample(name: 'x', count: 1);
      await cache.write<_Sample>(
        'k',
        value,
        toJson: _Sample.toJson,
        ttl: const Duration(milliseconds: 50),
      );

      final fresh = cache.read<_Sample>('k', fromJson: _Sample.fromJson);
      expect(fresh!.isFresh, isTrue);

      await Future<void>.delayed(const Duration(milliseconds: 80));
      final stale = cache.read<_Sample>('k', fromJson: _Sample.fromJson);
      expect(stale, isNotNull, reason: 'stale entry still readable');
      expect(stale!.isFresh, isFalse, reason: 'past TTL');
    });

    test('evict removes a single key', () async {
      await cache.write<_Sample>(
        'k',
        _Sample(name: 'x', count: 1),
        toJson: _Sample.toJson,
        ttl: const Duration(minutes: 1),
      );
      expect(cache.read<_Sample>('k', fromJson: _Sample.fromJson), isNotNull);

      await cache.evict('k');
      expect(cache.read<_Sample>('k', fromJson: _Sample.fromJson), isNull);
    });

    test('evictPrefix removes all matching keys', () async {
      await cache.write<_Sample>(
        'teka_cache_products_list_v1_city_a',
        _Sample(name: 'a', count: 1),
        toJson: _Sample.toJson,
        ttl: const Duration(minutes: 1),
      );
      await cache.write<_Sample>(
        'teka_cache_products_list_v1_city_b',
        _Sample(name: 'b', count: 2),
        toJson: _Sample.toJson,
        ttl: const Duration(minutes: 1),
      );
      await cache.write<_Sample>(
        'teka_cache_categories_tree_v1',
        _Sample(name: 'c', count: 3),
        toJson: _Sample.toJson,
        ttl: const Duration(minutes: 1),
      );

      await cache.evictPrefix('teka_cache_products_list_v1');

      expect(
        cache.read<_Sample>('teka_cache_products_list_v1_city_a',
            fromJson: _Sample.fromJson),
        isNull,
      );
      expect(
        cache.read<_Sample>('teka_cache_products_list_v1_city_b',
            fromJson: _Sample.fromJson),
        isNull,
      );
      // Untouched.
      expect(
        cache.read<_Sample>('teka_cache_categories_tree_v1',
            fromJson: _Sample.fromJson),
        isNotNull,
      );
    });

    test('returns null on corrupt JSON envelope', () async {
      await prefs.setString('k', 'not-valid-json');
      final entry = cache.read<_Sample>('k', fromJson: _Sample.fromJson);
      expect(entry, isNull);
    });

    test('returns null when stored version mismatches current', () async {
      // Manually construct an envelope with v=999 (future version) —
      // simulates an old build reading a newer cache.
      await prefs.setString(
        'k',
        '{"v":999,"savedAt":"2026-01-01T00:00:00.000Z",'
            '"ttlMs":60000,"value":{"name":"x","count":1}}',
      );
      final entry = cache.read<_Sample>('k', fromJson: _Sample.fromJson);
      expect(entry, isNull);
    });

    test('write is best-effort and never throws', () async {
      // Force a toJson that throws — the wrapper should swallow it.
      // ignore: only_throw_errors
      Map<String, Object?> badToJson(_Sample s) =>
          throw StateError('serialization failed');
      await cache.write<_Sample>(
        'k',
        _Sample(name: 'x', count: 1),
        toJson: badToJson,
        ttl: const Duration(minutes: 1),
      );
      // No assertion needed — absence of exception IS the test.
      expect(cache.read<_Sample>('k', fromJson: _Sample.fromJson), isNull);
    });

    test('CacheEntry.age is positive for past entries', () async {
      await cache.write<_Sample>(
        'k',
        _Sample(name: 'x', count: 1),
        toJson: _Sample.toJson,
        ttl: const Duration(minutes: 5),
      );
      await Future<void>.delayed(const Duration(milliseconds: 30));
      final entry = cache.read<_Sample>('k', fromJson: _Sample.fromJson);
      expect(entry!.age.inMilliseconds, greaterThanOrEqualTo(20));
    });
  });
}

class _Sample {
  final String name;
  final int count;
  _Sample({required this.name, required this.count});

  static _Sample fromJson(Map<String, Object?> json) => _Sample(
        name: json['name'] as String,
        count: json['count'] as int,
      );

  static Map<String, Object?> toJson(_Sample s) =>
      {'name': s.name, 'count': s.count};
}
