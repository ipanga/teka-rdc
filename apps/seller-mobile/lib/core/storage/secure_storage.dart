import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// MS4 — keychain accessibility.
///
/// Without `iOptions` the plugin defaults to `kSecAttrAccessibleWhenUnlocked`,
/// which is included in an encrypted iTunes/Finder backup and therefore
/// restorable onto a DIFFERENT device. `first_unlock_this_device` keeps the
/// same runtime behaviour — the item is readable after the first unlock
/// following a boot, so background refresh still works — while marking it
/// `ThisDeviceOnly`, so it is excluded from every backup and never leaves the
/// hardware it was written on.
///
/// Android already pins `encryptedSharedPreferences`, which wraps the value in
/// a Keystore key that is itself non-exportable.
final secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );
});

/// The pre-2026-09-09 options: no `iOptions`, so the plugin used its default
/// `kSecAttrAccessibleWhenUnlocked`.
///
/// Kept ONLY to clean up items written by a build that shipped before the
/// accessibility was pinned. See [TokenStorage._writeMigrating].
const _legacyStorage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

class TokenStorage {
  final FlutterSecureStorage _storage;

  /// The namespace a pre-accessibility build wrote into. Injectable so the
  /// migration can be tested without a device.
  final FlutterSecureStorage _legacy;

  TokenStorage(this._storage, {FlutterSecureStorage? legacy})
      : _legacy = legacy ?? _legacyStorage;

  static const _accessTokenKey = 'teka_access_token';
  static const _refreshTokenKey = 'teka_refresh_token';

  Future<void> saveTokens(String access, String refresh) async {
    await _writeMigrating(_accessTokenKey, access);
    await _writeMigrating(_refreshTokenKey, refresh);
  }

  /// Write a token, healing a keychain item left by a pre-accessibility build.
  ///
  /// On iOS the keychain primary key for a generic password is service +
  /// account; `kSecAttrAccessible` is NOT part of it. flutter_secure_storage
  /// nevertheless includes the accessibility in the lookup it uses to decide
  /// between update and insert, so once the accessibility changed:
  ///
  ///   * the existence check no longer matched the item written by the
  ///     previous build, so the plugin skipped its update/delete branch, and
  ///   * `SecItemAdd` then failed with errSecDuplicateItem (-25299), because
  ///     an item with that service + account already existed.
  ///
  /// The throw is a `PlatformException`, not a `DioException`, so the app
  /// collapsed it to « Une erreur inattendue est survenue » and sign-in was
  /// impossible on any device that had installed the app before. The keychain
  /// survives app deletion, so reinstalling did not help.
  ///
  /// Deleting through the legacy options removes the stale item — the delete
  /// query has to carry the OLD accessibility or it misses in exactly the same
  /// way — after which the write succeeds. Idempotent, and a no-op on a device
  /// that never held a legacy item.
  Future<void> _writeMigrating(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
    } on PlatformException {
      await _legacy.delete(key: key);
      await _storage.write(key: key, value: value);
    }
  }

  Future<String?> getAccessToken() async {
    return _storage.read(key: _accessTokenKey);
  }

  Future<String?> getRefreshToken() async {
    return _storage.read(key: _refreshTokenKey);
  }

  Future<void> clearTokens() async {
    await _storage.delete(key: _accessTokenKey);
    await _storage.delete(key: _refreshTokenKey);
    // A legacy item is invisible to the query above, so logout has to sweep
    // the old namespace too or a stale token outlives the session on disk.
    await _legacy.delete(key: _accessTokenKey);
    await _legacy.delete(key: _refreshTokenKey);
  }

  Future<bool> hasTokens() async {
    final token = await getAccessToken();
    return token != null;
  }
}

final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return TokenStorage(ref.read(secureStorageProvider));
});
