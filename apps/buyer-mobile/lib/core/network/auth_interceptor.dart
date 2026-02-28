import 'package:dio/dio.dart';
import '../storage/secure_storage.dart';

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
              final retryResponse = await _refreshDio.fetch(options);
              handler.resolve(retryResponse);
              return;
            }
          }
        } catch (_) {
          await _tokenStorage.clearTokens();
        }
      }
    }
    handler.next(err);
  }
}
