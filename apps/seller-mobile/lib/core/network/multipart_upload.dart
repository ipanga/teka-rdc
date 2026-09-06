import 'package:dio/dio.dart';

import 'auth_interceptor.dart' show authRefreshedExtraKey;

/// POST a multipart body with the one retry that Rule 15 allows on a
/// non-idempotent request.
///
/// A multipart upload is never retry-safe by itself (it creates a row plus a
/// Cloudinary asset), so it is never marked `retryable` for the
/// RetryInterceptor. The single exception is an access token that expired
/// mid-session: the AuthInterceptor refreshes it but cannot replay the body
/// (Dio finalises a FormData stream on first send), so the first attempt
/// surfaces a 401 *without the API having created anything*. In that case,
/// and only in that case, [buildForm] is called again to rebuild a fresh body
/// and the upload is sent exactly once more with the refreshed token.
///
/// The gate is [authRefreshedExtraKey]: the AuthInterceptor sets it on the
/// failed request only when its refresh succeeded and its replay failed. A
/// 401 without the marker (refresh rejected, refresh token missing, refresh
/// call offline) and any non-401 failure are rethrown untouched, so a
/// rejected session or a validation error never triggers a second upload.
///
/// Bounded to one retry: a 401 on the rebuilt attempt is surfaced as-is.
Future<Response<T>> postMultipartWithAuthRetry<T>(
  Dio dio,
  String path, {
  required FormData Function() buildForm,
  ProgressCallback? onSendProgress,
}) async {
  Future<Response<T>> send() => dio.post<T>(
        path,
        data: buildForm(),
        onSendProgress: onSendProgress,
      );
  try {
    return await send();
  } on DioException catch (e) {
    if (e.response?.statusCode != 401 ||
        e.requestOptions.extra[authRefreshedExtraKey] != true) {
      rethrow;
    }
    return await send();
  }
}
