import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../connectivity/connectivity_provider.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage.dart';
import 'auth_interceptor.dart';
import 'offline_aware_interceptor.dart';
import 'retry_interceptor.dart';

/// Dio interceptor chain (request order):
///
///   OfflineAware → Auth → Retry → Log
///
/// * **OfflineAware** fails fast on POST/PUT/PATCH/DELETE when the device
///   is `disconnected`, saving the 15s connectTimeout dance.
/// * **Auth** attaches the bearer token. On 401, refreshes once + retries
///   the original. Does NOT clear tokens when the refresh call itself
///   fails for connectivity reasons (closes the "logged out on the bus"
///   footgun from the May 2026 outage).
/// * **Retry** kicks in on transient failures (timeouts, 502/503/504) for
///   safe methods (GET/HEAD) or opt-in non-safe methods. Full-jitter
///   exponential backoff: 0..500ms, 0..1500ms, 0..4000ms (cap 5s).
/// * **Log** captures request/response/error metadata only. Headers and bodies
///   are deliberately excluded because they can contain bearer tokens, OTPs,
///   phone numbers, addresses, and other private user data.
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: ApiConstants.baseUrl,
    connectTimeout: ApiConstants.connectTimeout,
    receiveTimeout: ApiConstants.receiveTimeout,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  ));

  // Separate Dio for token refresh (no auth interceptor to avoid loop).
  // Also has no offline-aware / retry interceptors — the refresh call
  // is short, idempotent on the server, and shouldn't burn retry budget.
  final refreshDio = Dio(BaseOptions(
    baseUrl: ApiConstants.baseUrl,
    connectTimeout: ApiConstants.connectTimeout,
    receiveTimeout: ApiConstants.receiveTimeout,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  ));

  final tokenStorage = ref.read(tokenStorageProvider);

  dio.interceptors.add(
    OfflineAwareInterceptor(() => ref.read(connectivityStatusProvider)),
  );
  dio.interceptors.add(AuthInterceptor(tokenStorage, refreshDio));
  dio.interceptors.add(RetryInterceptor(client: dio));
  dio.interceptors.add(
    LogInterceptor(
      requestHeader: false,
      requestBody: false,
      responseHeader: false,
      responseBody: false,
    ),
  );

  return dio;
});
