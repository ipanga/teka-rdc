// Keychain accessibility migration (2026-09-10).
//
// MS4 pinned iOS keychain accessibility to `first_unlock_this_device`. The
// iOS keychain primary key for a generic password is service + account;
// `kSecAttrAccessible` is NOT part of it. flutter_secure_storage nevertheless
// includes the accessibility in the lookup it uses to choose between update
// and insert, so after the change:
//
//   * the existence check missed the item written by the previous build, and
//   * SecItemAdd then failed with errSecDuplicateItem (-25299).
//
// That throw is a PlatformException, not a DioException, so the app collapsed
// it to « Une erreur inattendue est survenue » and sign-in was impossible on
// every device that had installed the app before — the iOS keychain survives
// app deletion, so reinstalling did not help either.
//
// Reproduced on an iPhone 17 Pro simulator against the real keychain before
// the fix (-25299) and confirmed green after it. These tests pin the logic in
// CI, which has no device.

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';

/// Refuses the first write of each key with the real errSecDuplicateItem the
/// keychain raised, until the legacy namespace is swept.
class _DuplicateOnFirstWrite extends FlutterSecureStorage {
  _DuplicateOnFirstWrite(this.legacy) : super();
  final _FakeLegacy legacy;
  final Map<String, String> store = {};

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
    if (legacy.store.containsKey(key)) {
      throw PlatformException(
        code: '-25299',
        message: 'The specified item already exists in the keychain.',
      );
    }
    store[key] = value!;
  }

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async =>
      store[key];

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
    store.remove(key);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _FakeLegacy extends FlutterSecureStorage {
  _FakeLegacy(this.store) : super();
  final Map<String, String> store;

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
    store.remove(key);
  }

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async =>
      store[key];

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

void main() {
  group('TokenStorage — keychain accessibility migration', () {
    test('sign-in succeeds on a device upgrading from a pre-MS4 build', () async {
      final legacy = _FakeLegacy({
        'teka_access_token': 'OLD_A',
        'teka_refresh_token': 'OLD_R',
      });
      final storage = _DuplicateOnFirstWrite(legacy);
      final tokens = TokenStorage(storage, legacy: legacy);

      await tokens.saveTokens('NEW_A', 'NEW_R');

      expect(await tokens.getAccessToken(), 'NEW_A');
      expect(await tokens.getRefreshToken(), 'NEW_R');
      expect(legacy.store, isEmpty,
          reason: 'the stale items must be swept, not left behind');
    });

    test('a clean install never touches the legacy namespace', () async {
      final legacy = _FakeLegacy({});
      final storage = _DuplicateOnFirstWrite(legacy);
      final tokens = TokenStorage(storage, legacy: legacy);

      await tokens.saveTokens('A', 'R');

      expect(await tokens.getAccessToken(), 'A');
      expect(await tokens.hasTokens(), isTrue);
    });

    test('logout sweeps BOTH namespaces, so no stale token outlives it', () async {
      final legacy = _FakeLegacy({'teka_access_token': 'OLD_A'});
      final storage = _DuplicateOnFirstWrite(legacy);
      final tokens = TokenStorage(storage, legacy: legacy);

      await tokens.saveTokens('NEW_A', 'NEW_R');
      await tokens.clearTokens();

      expect(await tokens.getAccessToken(), isNull);
      expect(await tokens.hasTokens(), isFalse);
      expect(legacy.store, isEmpty);
    });
  });
}
