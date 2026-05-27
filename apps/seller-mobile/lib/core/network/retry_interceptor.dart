import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

/// Exponential-backoff retry interceptor for transient network failures.
///
/// **What it retries:**
///   * `DioExceptionType.connectionTimeout`
///   * `DioExceptionType.receiveTimeout`
///   * `DioExceptionType.sendTimeout`
///   * `DioExceptionType.connectionError`
///   * HTTP 502 / 503 / 504 (transient server states, NOT 500 which is
///     usually an application bug that won't change on retry)
///
/// **What it does NOT retry:**
///   * Any other HTTP status (4xx, 500, 501, etc.)
///   * `badCertificate` (TLS issues won't fix themselves)
///   * `cancel`, `unknown`
///   * Non-safe methods (POST / PUT / PATCH / DELETE) unless the request
///     explicitly opts in via `Options(extra: {'retryable': true})`. This
///     is the load-bearing rule that protects checkout / OTP / payment
///     state — see CLAUDE.md Rule 15 and the initiative plan's
///     "Non-retry-safe call sites" list.
///
/// **Backoff schedule (full-jitter):**
///   * Attempt 1 → wait 0..500ms then retry
///   * Attempt 2 → wait 0..1500ms then retry
///   * Attempt 3 → wait 0..4000ms then retry
///   * Cap at 5s per attempt (per plan).
///
/// **Why "full-jitter" not "exponential":** prevents thundering-herd
/// reconnect storms when many devices come back online together (a real
/// concern in DRC where shared cell-tower outages can knock thousands of
/// users offline simultaneously). See:
/// <https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/>
class RetryInterceptor extends Interceptor {
  static const Set<String> _safeMethods = {'GET', 'HEAD'};

  /// Default schedule per the plan. The actual sleep on each attempt is
  /// `Random().nextInt(schedule[attempt].inMilliseconds)` — full jitter.
  static const List<Duration> defaultBackoffSchedule = [
    Duration(milliseconds: 500),
    Duration(milliseconds: 1500),
    Duration(milliseconds: 4000),
  ];

  /// Cap per-attempt sleep at 5s no matter what the schedule says.
  static const Duration maxBackoff = Duration(seconds: 5);

  RetryInterceptor({
    Dio? client,
    List<Duration>? backoffSchedule,
    Random? random,
  })  : _client = client,
        _schedule = backoffSchedule ?? defaultBackoffSchedule,
        _random = random ?? Random();

  /// The Dio instance the interceptor uses to fire retry attempts. When
  /// null, the interceptor uses the `err.requestOptions` to reconstruct
  /// the call via a fresh `Dio()` instance — the only sane fallback for
  /// tests that don't wire a full Dio.
  ///
  /// In production, **always pass the same Dio that owns this
  /// interceptor**. That keeps retries flowing through the same
  /// interceptor chain (auth, log, offline-aware) — otherwise a retry
  /// would skip token attachment.
  final Dio? _client;
  final List<Duration> _schedule;
  final Random _random;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    if (!_isRetryable(err, options)) {
      handler.next(err);
      return;
    }

    final currentAttempt = (options.extra['_retryAttempt'] as int?) ?? 0;
    if (currentAttempt >= _schedule.length) {
      // Budget exhausted — let the error through to the caller.
      //
      // Capture as a Sentry breadcrumb (always) + event (rate-limited
      // 1/min). Indicates a request that retried N times and still
      // failed — usually network degradation severe enough that the
      // user couldn't get content. URL path is captured but query
      // params are stripped to avoid leaking buyer-specific filters /
      // search terms.
      Sentry.addBreadcrumb(Breadcrumb(
        category: 'connectivity',
        level: SentryLevel.warning,
        message: 'retry_budget_exhausted',
        data: {
          'method': options.method,
          'path': options.path,
          'attempts': currentAttempt,
          'error_type': err.type.name,
          if (err.response?.statusCode != null)
            'status_code': err.response!.statusCode,
        },
      ));
      _maybeCaptureBudgetExhaustion(err, options, currentAttempt);
      handler.next(err);
      return;
    }

    final delay = _jitter(_schedule[currentAttempt]);
    await Future<void>.delayed(delay);

    // Mutate the request's extras for the next attempt's counter.
    options.extra['_retryAttempt'] = currentAttempt + 1;

    try {
      final retryClient = _client ?? Dio();
      final response = await retryClient.fetch(options);
      handler.resolve(response);
    } on DioException catch (retryErr) {
      // Re-enter onError — the interceptor chain handles the next
      // decision (could be another retry, could fall through).
      handler.next(retryErr);
    }
  }

  /// True if [err] qualifies for retry given the request's method + the
  /// caller's opt-in flag.
  bool _isRetryable(DioException err, RequestOptions options) {
    final isSafe = _safeMethods.contains(options.method.toUpperCase()) ||
        options.extra['retryable'] == true;
    if (!isSafe) return false;

    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.connectionError:
        return true;
      case DioExceptionType.badResponse:
        final code = err.response?.statusCode ?? 0;
        return code == 502 || code == 503 || code == 504;
      case DioExceptionType.badCertificate:
      case DioExceptionType.cancel:
      case DioExceptionType.unknown:
        return false;
    }
  }

  /// Rate-limited (1/min) capture for retry-budget exhaustion.
  /// Indicates "the device tried 3 times to fetch X and gave up" —
  /// useful for spotting endpoints that fail systematically vs.
  /// users on persistently bad networks.
  static DateTime? _lastBudgetCapture;
  static const Duration _budgetCaptureCooldown = Duration(minutes: 1);

  void _maybeCaptureBudgetExhaustion(
    DioException err,
    RequestOptions options,
    int attempts,
  ) {
    final last = _lastBudgetCapture;
    if (last != null &&
        DateTime.now().difference(last) <= _budgetCaptureCooldown) {
      return;
    }
    _lastBudgetCapture = DateTime.now();
    Sentry.captureMessage(
      'retry_budget_exhausted',
      level: SentryLevel.warning,
      withScope: (scope) {
        scope.setTag('connectivity_event', 'retry_exhausted');
        scope.setContexts('connectivity_event', {
          'kind': 'retry_exhausted',
          'method': options.method,
          'path': options.path,
          'attempts': attempts,
          'error_type': err.type.name,
          if (err.response?.statusCode != null)
            'status_code': err.response!.statusCode,
        });
      },
    );
  }

  Duration _jitter(Duration scheduled) {
    final scheduledMs = scheduled.inMilliseconds;
    final cappedMs = scheduledMs > maxBackoff.inMilliseconds
        ? maxBackoff.inMilliseconds
        : scheduledMs;
    if (cappedMs <= 0) return Duration.zero;
    return Duration(milliseconds: _random.nextInt(cappedMs));
  }
}
