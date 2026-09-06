import 'package:dio/dio.dart';
import '../storage/secure_storage.dart';

/// `RequestOptions.extra` key the AuthInterceptor sets on a 401 it hands back
/// AFTER a successful token refresh whose transparent replay failed (a
/// consumed multipart body). It tells the caller "the session is fresh, the
/// server created nothing, you may rebuild the body and send once more" —
/// see `postMultipartWithAuthRetry` in multipart_upload.dart. A 401 without
/// it means the refresh did not happen or was rejected: never retry those.
const String authRefreshedExtraKey = 'teka.authRefreshed';

class AuthInterceptor extends Interceptor {
  final TokenStorage _tokenStorage;
  final Dio _refreshDio;

  AuthInterceptor(this._tokenStorage, this._refreshDio);

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _tokenStorage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      final refreshToken = await _tokenStorage.getRefreshToken();
      if (refreshToken != null) {
        try {
          final response = await _refreshDio.post(
            '/v1/auth/refresh',
            data: {'refreshToken': refreshToken},
          );
          final data = response.data['data'];
          if (data != null) {
            final newAccess =
                data['tokens']?['accessToken'] ?? data['accessToken'];
            final newRefresh =
                data['tokens']?['refreshToken'] ?? data['refreshToken'];
            if (newAccess != null && newRefresh != null) {
              await _tokenStorage.saveTokens(newAccess, newRefresh);

              final options = err.requestOptions;
              options.headers['Authorization'] = 'Bearer $newAccess';
              try {
                final retryResponse = await _refreshDio.fetch(options);
                handler.resolve(retryResponse);
                return;
              } catch (_) {
                // The REFRESH succeeded and the new tokens are stored; only
                // the replay failed (typically a multipart body whose stream
                // was consumed by the first attempt — Dio cannot re-send a
                // finalised FormData). This is NOT an auth failure: keep the
                // fresh session and surface the original 401 so the caller
                // can rebuild its request (see multipart_upload.dart).
                // Before 2026-09-05 this fell into the generic catch below
                // and wiped a perfectly valid session.
                err.requestOptions.extra[authRefreshedExtraKey] = true;
                handler.next(err);
                return;
              }
            }
          }
        } on DioException catch (refreshErr) {
          // Distinguish "the refresh CALL failed for connectivity reasons"
          // from "the server rejected our refresh token". The first is
          // transient — clearing the session would force a re-login as
          // soon as the user comes back online, which is the worst UX
          // possible on flaky DRC networks (`I got logged out riding the
          // tram` — closes the 2026-05 outage gap).
          //
          // The second IS a real auth failure: the refresh token has
          // expired / been revoked / been replayed. Clear tokens so the
          // app falls back to login.
          if (!isConnectivityError(refreshErr)) {
            await _tokenStorage.clearTokens();
          }
          // else: keep tokens. The original 401 still propagates below;
          // the user's next action will retry the original request when
          // connectivity is back, which will trigger a fresh refresh.
        } catch (_) {
          // Non-Dio exceptions (JSON parsing, etc.) are not connectivity
          // issues — clear tokens conservatively.
          await _tokenStorage.clearTokens();
        }
      }
    }
    handler.next(err);
  }

  /// True if a DioException is plausibly a transient network / upstream
  /// failure rather than a server decision. Shared classification: the
  /// refresh path below and the session check on cold start
  /// (`AuthRepository.checkSession`) must agree on what "unreachable" means,
  /// or a phone with no signal gets logged out (A2, 2026-09-06).
  static bool isConnectivityError(DioException err) {
    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.connectionError:
        return true;
      case DioExceptionType.badResponse:
        // 502/503/504 = upstream / gateway issue, treat as connectivity.
        final code = err.response?.statusCode ?? 0;
        return code == 502 || code == 503 || code == 504;
      case DioExceptionType.badCertificate:
      case DioExceptionType.cancel:
      case DioExceptionType.unknown:
        return false;
    }
  }
}
