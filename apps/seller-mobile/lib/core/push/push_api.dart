import 'dart:io' show Platform;
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';

/// Thin client over the backend device-token endpoints shipped in PR A.
/// Both methods are JWT-protected — the caller must be authenticated
/// before invoking them (dio's interceptor attaches the access cookie).
class PushApi {
  PushApi(this._dio);

  final Dio _dio;

  Future<void> register({
    required String token,
    String? deviceInfo,
    String? appVersion,
  }) async {
    await _dio.post(
      '/v1/users/device-tokens',
      data: {
        'token': token,
        'platform': _platform(),
        if (deviceInfo != null) 'deviceInfo': deviceInfo,
        if (appVersion != null) 'appVersion': appVersion,
      },
    );
  }

  Future<void> unregister(String token) async {
    // DELETE in dio takes the path; backend matches by (userId, token).
    // Returns 200 with { removed: 0|1 } whether the token existed or
    // not — we don't care about the count here.
    await _dio.delete('/v1/users/device-tokens/$token');
  }

  String _platform() {
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return 'web';
  }
}

final pushApiProvider = Provider<PushApi>(
  (ref) => PushApi(ref.read(dioProvider)),
);
