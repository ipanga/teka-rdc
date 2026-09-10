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

class TokenStorage {
  final FlutterSecureStorage _storage;

  TokenStorage(this._storage);

  static const _accessTokenKey = 'teka_access_token';
  static const _refreshTokenKey = 'teka_refresh_token';

  Future<void> saveTokens(String access, String refresh) async {
    await _storage.write(key: _accessTokenKey, value: access);
    await _storage.write(key: _refreshTokenKey, value: refresh);
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
  }

  Future<bool> hasTokens() async {
    final token = await getAccessToken();
    return token != null;
  }
}

final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return TokenStorage(ref.read(secureStorageProvider));
});
