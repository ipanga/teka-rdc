import 'package:dio/dio.dart';

import '../connectivity/connectivity_status.dart';

/// Synchronous getter for the current ConnectivityStatus. Designed to
/// take `() => ref.read(connectivityStatusProvider)` from a Riverpod
/// `Ref`, but the type is plain Dart so it stays trivially testable.
typedef ConnectivityStatusGetter = ConnectivityStatus Function();

/// Fails fast on non-safe requests when the device is `disconnected`.
///
/// **Purpose:** save the round-trip on writes (POST / PUT / PATCH /
/// DELETE) that have no chance of succeeding while the network interface
/// is down. The Dio default would wait the full connectTimeout (15s)
/// before reporting failure — frustrating for the user and wasteful of
/// the burst of work the app does on submit (token attach, payload
/// serialization, etc).
///
/// **What this does NOT do:**
///   * Block safe (GET / HEAD) requests. Those still go through; the
///     `RetryInterceptor` handles them transparently.
///   * Block requests in `noInternet` state. Some captive-portal / DNS
///     situations resolve mid-request — let Dio try and fail organically.
///   * Block requests when `unstable` or `reconnecting`. We're optimistic.
///
/// **Caller opt-out:** set `Options(extra: {'allowOffline': true})` to
/// bypass this check. Reserved for the device-token unregister call on
/// sign-out, which is best-effort by design.
class OfflineAwareInterceptor extends Interceptor {
  OfflineAwareInterceptor(this._getStatus);

  static const Set<String> _safeMethods = {'GET', 'HEAD'};

  final ConnectivityStatusGetter _getStatus;

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) {
    final status = _getStatus();
    final isOffline = status == ConnectivityStatus.disconnected;
    final isSafe = _safeMethods.contains(options.method.toUpperCase());
    final allowOffline = options.extra['allowOffline'] == true;

    if (isOffline && !isSafe && !allowOffline) {
      // Synthesize a DioException that looks exactly like a connection
      // failure so existing error-mapping code (the shared
      // `extractDioErrorMessage` helper at
      // `lib/core/network/dio_error_messages.dart`) handles it
      // without changes.
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
          error: 'offline',
          message:
              'Pas de connexion internet — la requête ne peut pas être envoyée.',
        ),
        // `true` skips the rest of the interceptor chain entirely. The
        // caller's `try/catch` (if any) handles the DioException as
        // usual; otherwise it propagates to Dio's default error path.
        true,
      );
      return;
    }

    handler.next(options);
  }
}
