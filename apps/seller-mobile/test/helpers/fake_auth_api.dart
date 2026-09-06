import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:seller_mobile/core/network/auth_interceptor.dart';
import 'package:seller_mobile/core/storage/secure_storage.dart';

/// In-memory token storage so tests never touch the platform keychain.
class MemoryTokens extends TokenStorage {
  MemoryTokens({this.access = 'old-access', this.refresh = 'old-refresh'})
      : super(const FlutterSecureStorage());
  String? access;
  String? refresh;
  int clears = 0;
  @override
  Future<String?> getAccessToken() async => access;
  @override
  Future<String?> getRefreshToken() async => refresh;
  @override
  Future<void> saveTokens(String accessToken, String refreshToken) async {
    access = accessToken;
    refresh = refreshToken;
  }

  @override
  Future<void> clearTokens() async {
    access = null;
    refresh = null;
    clears++;
  }
}

/// How the fake /v1/auth/refresh endpoint behaves.
enum RefreshMode {
  /// Rotates old-access/old-refresh → new-access/new-refresh (then
  /// newer-access/… on a second call).
  ok,

  /// The server rejects the refresh token (401): a real auth failure.
  rejected,

  /// The refresh call cannot reach the server (connection error).
  offline,
}

class RecordedRequest {
  RecordedRequest(this.method, this.path, this.authorization);
  final String method;
  final String path;
  final String? authorization;
}

/// A fake API at the HttpClientAdapter level, shared by the app Dio and the
/// refresh Dio, so a test runs the REAL AuthInterceptor end to end: the
/// expired-token 401, the refresh, Dio's own "finalized FormData" replay
/// failure, the marker, and the caller's rebuilt retry.
///
/// Uploads: any request whose path matches [isUpload] answers 401 while the
/// bearer is not one the fake has issued (i.e. 'old-access' or absent), and
/// creates a resource otherwise. [uploadBody] builds the success payload for
/// the n-th created resource (1-based) so callers can assert ordering.
class FakeAuthApi implements HttpClientAdapter {
  FakeAuthApi({
    required this.isUpload,
    required this.uploadBody,
    this.refreshMode = RefreshMode.ok,
    this.alwaysUnauthorized = false,
    this.uploadStatus = 201,
  });

  final bool Function(String path) isUpload;
  final Map<String, dynamic> Function(int index, String path) uploadBody;
  final RefreshMode refreshMode;

  /// Answer 401 to every upload, even with a fresh token (bounded-retry test).
  final bool alwaysUnauthorized;

  /// Non-401 status to answer uploads with (validation failure test).
  final int uploadStatus;

  final List<RecordedRequest> requests = [];
  final List<String> createdResources = [];
  int refreshCalls = 0;
  final Set<String> _issued = {'new-access', 'newer-access'};

  int get uploadRequests => requests.where((r) => isUpload(r.path)).length;

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    // Drain the multipart stream like a real socket would: this is what
    // consumes the FormData and makes Dio's transparent replay fail.
    if (requestStream != null) {
      await for (final _ in requestStream) {}
    }
    final auth = options.headers['Authorization'] as String?;
    requests.add(RecordedRequest(options.method, options.path, auth));

    if (options.path == '/v1/auth/refresh') {
      refreshCalls++;
      switch (refreshMode) {
        case RefreshMode.rejected:
          return _json(401, {
            'success': false,
            'error': {'status': 401, 'message': 'Session expirée'}
          });
        case RefreshMode.offline:
          throw DioException(
              requestOptions: options,
              type: DioExceptionType.connectionError,
              message: 'offline');
        case RefreshMode.ok:
          final second = refreshCalls > 1;
          return _json(200, {
            'success': true,
            'data': {
              'tokens': {
                'accessToken': second ? 'newer-access' : 'new-access',
                'refreshToken': second ? 'newer-refresh' : 'new-refresh',
              }
            }
          });
      }
    }

    if (isUpload(options.path)) {
      final bearer = auth?.replaceFirst('Bearer ', '');
      if (alwaysUnauthorized || bearer == null || !_issued.contains(bearer)) {
        return _json(401, {
          'success': false,
          'error': {'status': 401, 'message': 'Unauthorized'}
        });
      }
      if (uploadStatus != 201) {
        return _json(uploadStatus, {
          'success': false,
          'error': {'status': uploadStatus, 'message': 'Format non supporté'}
        });
      }
      final body = uploadBody(createdResources.length + 1, options.path);
      createdResources.add(options.path);
      return _json(201, {'success': true, 'data': body});
    }

    return _json(200, {
      'success': true,
      'data': {'ok': true}
    });
  }

  ResponseBody _json(int status, Map<String, dynamic> body) =>
      ResponseBody.fromString(jsonEncode(body), status, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType]
      });

  @override
  void close({bool force = false}) {}
}

/// The app's Dio wired like api_client.dart for auth purposes: the
/// AuthInterceptor attaches the stored bearer and refreshes on 401 through a
/// separate refresh Dio that shares the same fake transport.
Dio buildAuthedDio(FakeAuthApi api, MemoryTokens tokens) {
  final refreshDio = Dio(BaseOptions(baseUrl: 'http://fake'))
    ..httpClientAdapter = api;
  return Dio(BaseOptions(baseUrl: 'http://fake'))
    ..httpClientAdapter = api
    ..interceptors.add(AuthInterceptor(tokens, refreshDio));
}
