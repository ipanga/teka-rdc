import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/network/auth_interceptor.dart';
import 'package:buyer_mobile/core/storage/secure_storage.dart';

/// In-memory token storage so the test never touches the platform keychain.
class _MemoryTokens extends TokenStorage {
  _MemoryTokens() : super(const FlutterSecureStorage());
  String? access = 'old-access';
  String? refresh = 'old-refresh';
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

/// The API behind the refresh Dio: /v1/auth/refresh rotates the tokens; a
/// replayed multipart request blows up the way Dio does on a consumed
/// FormData; a replayed JSON request succeeds.
Dio _api({required bool multipartReplayFails}) {
  return Dio()
    ..interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      if (o.path == '/v1/auth/refresh') {
        h.resolve(Response(requestOptions: o, statusCode: 200, data: {
          'success': true,
          'data': {
            'tokens': {
              'accessToken': 'new-access',
              'refreshToken': 'new-refresh'
            }
          },
        }));
        return;
      }
      if (o.data is FormData && multipartReplayFails) {
        throw StateError("Can't finalize a finalized MultipartFile.");
      }
      h.resolve(Response(requestOptions: o, statusCode: 200, data: {
        'success': true,
        'data': {'ok': true}
      }));
    }));
}

DioException _unauthorized(RequestOptions o) => DioException(
      requestOptions: o,
      type: DioExceptionType.badResponse,
      response: Response(requestOptions: o, statusCode: 401, data: {
        'success': false,
        'error': {'status': 401, 'message': 'Unauthorized'}
      }),
    );

void main() {
  test(
      'a 401 on a JSON request refreshes, stores the new tokens and replays transparently',
      () async {
    final tokens = _MemoryTokens();
    final interceptor =
        AuthInterceptor(tokens, _api(multipartReplayFails: false));
    final options =
        RequestOptions(path: '/v1/sellers/verification', method: 'GET');
    Response<dynamic>? resolved;
    DioException? propagated;
    final handler =
        _Handler(onResolve: (r) => resolved = r, onNext: (e) => propagated = e);
    interceptor.onError(_unauthorized(options), handler);
    await handler.done.future;
    expect(resolved?.statusCode, 200);
    expect(propagated, isNull);
    expect(tokens.access, 'new-access');
    expect(tokens.refresh, 'new-refresh');
    expect(tokens.clears, 0);
  });

  test(
      'a 401 on a MULTIPART request: refresh succeeds, the replay fails, the session is KEPT and the 401 propagates (2026-09-05 fix)',
      () async {
    final tokens = _MemoryTokens();
    final interceptor =
        AuthInterceptor(tokens, _api(multipartReplayFails: true));
    final options = RequestOptions(
      path: '/v1/sellers/verification/documents',
      method: 'POST',
      data: FormData.fromMap({
        'document': MultipartFile.fromBytes([1, 2, 3], filename: 'x.pdf')
      }),
    );
    Response<dynamic>? resolved;
    DioException? propagated;
    final handler =
        _Handler(onResolve: (r) => resolved = r, onNext: (e) => propagated = e);
    interceptor.onError(_unauthorized(options), handler);
    await handler.done.future;
    expect(resolved, isNull);
    expect(propagated?.response?.statusCode, 401,
        reason: 'the caller rebuilds its body and retries once');
    expect(tokens.access, 'new-access',
        reason: 'refreshed tokens must survive a replay failure');
    expect(tokens.clears, 0, reason: 'a replay failure is not an auth failure');
  });
}

class _Handler extends ErrorInterceptorHandler {
  _Handler({required this.onResolve, required this.onNext});
  final void Function(Response<dynamic>) onResolve;
  final void Function(DioException) onNext;
  final done = Completer<void>();
  @override
  void resolve(Response<dynamic> response) {
    onResolve(response);
    done.complete();
  }

  @override
  void next(DioException err) {
    onNext(err);
    done.complete();
  }

  @override
  void reject(DioException error) {
    onNext(error);
    done.complete();
  }
}
