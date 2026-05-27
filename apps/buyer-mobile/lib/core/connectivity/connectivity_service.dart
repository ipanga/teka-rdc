import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';

import 'connectivity_status.dart';

/// Result of a single probe attempt.
///
/// Carries both the measured latency AND the error tag so the service
/// doesn't need to wall-clock around the probe call (which kept tests
/// brittle — the fake probe's own `Future.delayed` was racing with the
/// service's `DateTime.now()` measurements).
class ProbeOutcome {
  /// Round-trip latency in milliseconds (>= 0).
  final int latencyMs;

  /// Short error tag on failure (`'timeout'`, `'http_5xx'`, `'dns'`,
  /// `'cancelled'`, …). Null on success.
  final String? errorTag;

  const ProbeOutcome({required this.latencyMs, this.errorTag});

  bool get ok => errorTag == null;
}

/// Probe function signature. Returns a [ProbeOutcome] with both latency
/// and an optional error tag.
typedef ConnectivityProbe = Future<ProbeOutcome> Function();

/// Owns the 5-state connectivity machine. Sources of truth:
///   * `connectivity_plus` for interface up/down events.
///   * A periodic GET to `${baseUrl}/v1/health` for actual reachability.
///
/// Both sources are injectable for tests:
///   * `interfaceStream` defaults to `Connectivity().onConnectivityChanged`
///   * `probe` defaults to a Dio GET with 3s timeout.
///
/// Lifecycle:
///   1. Construct, then call [start]. The service immediately runs a probe
///      and starts listening to interface changes.
///   2. Use [stream] for state changes or [snapshot] for a synchronous read.
///   3. Call [pause] when the app backgrounds (saves the probe timer + the
///      battery). Call [resume] or [checkNow] when it comes back.
///   4. Call [dispose] to release resources.
class ConnectivityService {
  /// Latency above which a successful probe still marks the connection
  /// as `unstable` (after the hysteresis check). 1.5s is the DRC 3G
  /// median; consistent slowness above this hurts UX enough that the
  /// UI should show progress indicators sooner.
  static const Duration unstableThreshold = Duration(milliseconds: 1500);

  /// Two consecutive slow probes flip into `unstable`. One fast probe
  /// flips back to `connected`. Asymmetric to dampen false alarms.
  static const int unstableEntryCount = 2;

  /// Periodic probe interval while in healthy states.
  static const Duration healthyProbeInterval = Duration(seconds: 30);

  /// Faster probe interval while in `noInternet` — we want to detect
  /// recovery quickly without battery-draining the device when truly
  /// disconnected (which is handled by stopping probes entirely).
  static const Duration recoveryProbeInterval = Duration(seconds: 5);

  /// Maximum time a single probe is allowed to run before being
  /// considered failed.
  static const Duration probeTimeout = Duration(seconds: 3);

  ConnectivityService({
    required String baseUrl,
    Stream<List<ConnectivityResult>>? interfaceStream,
    ConnectivityProbe? probe,
  })  : _baseUrl = baseUrl.endsWith('/')
            ? baseUrl.substring(0, baseUrl.length - 1)
            : baseUrl,
        _interfaceStream =
            interfaceStream ?? Connectivity().onConnectivityChanged,
        _probe = probe ?? _defaultProbe(baseUrl);

  final String _baseUrl;
  final Stream<List<ConnectivityResult>> _interfaceStream;
  final ConnectivityProbe _probe;

  final _controller = StreamController<ConnectivitySnapshot>.broadcast();
  StreamSubscription<List<ConnectivityResult>>? _interfaceSub;
  Timer? _probeTimer;
  bool _paused = false;
  bool _started = false;
  bool _disposed = false;
  int _consecutiveSlowProbes = 0;

  ConnectivitySnapshot _snapshot = ConnectivitySnapshot(
    status: ConnectivityStatus.reconnecting,
    at: DateTime.now(),
  );

  /// Stream of state transitions. Subscribe in providers + UI listeners.
  /// Always emits the current snapshot on subscribe (broadcast + cached).
  Stream<ConnectivitySnapshot> get stream async* {
    yield _snapshot;
    yield* _controller.stream;
  }

  /// Synchronous read for cheap UI / interceptor checks. Reads the last
  /// emitted snapshot; never returns null.
  ConnectivitySnapshot get snapshot => _snapshot;

  /// Wire up the interface listener + initial probe.
  ///
  /// Awaits the initial probe before returning so callers (and tests) can
  /// rely on the snapshot being a real state, not `reconnecting`. If the
  /// initial probe fails the service settles at `noInternet` and starts
  /// the recovery loop — caller doesn't have to handle that.
  Future<void> start() async {
    if (_disposed) {
      throw StateError('ConnectivityService.start() called after dispose()');
    }
    if (_started) return;
    _started = true;

    _interfaceSub = _interfaceStream.listen(
      _onInterfaceChange,
      onError: (_) {
        // connectivity_plus stream errors are rare + recoverable; ignore.
      },
    );

    // Await the initial probe so the service doesn't sit at `reconnecting`
    // longer than needed AND test setUp can rely on a deterministic state.
    await checkNow();
  }

  /// Force a probe immediately. Used by the app-resume hook and by retry
  /// logic that wants to confirm reachability before retrying.
  Future<ConnectivitySnapshot> checkNow() async {
    if (_disposed) return _snapshot;
    await _runProbe();
    return _snapshot;
  }

  /// Pause the probe timer (no new probes scheduled). Interface-change
  /// events still fire — they're cheap. Call on `AppLifecycleState.paused`.
  void pause() {
    _paused = true;
    _probeTimer?.cancel();
    _probeTimer = null;
  }

  /// Reverse [pause]. Fires an immediate probe + reschedules the timer.
  Future<void> resume() async {
    if (_disposed) return;
    _paused = false;
    await checkNow();
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    _probeTimer?.cancel();
    await _interfaceSub?.cancel();
    await _controller.close();
  }

  // ---- internals --------------------------------------------------------

  void _onInterfaceChange(List<ConnectivityResult> results) {
    final hasInterface = results.any((r) => r != ConnectivityResult.none);
    if (!hasInterface) {
      // No network at all. Stop probing — Dart timers waste battery when
      // we know they'll all fail.
      _probeTimer?.cancel();
      _probeTimer = null;
      _consecutiveSlowProbes = 0;
      _emit(_snapshot.copyWith(
        status: ConnectivityStatus.disconnected,
        at: DateTime.now(),
        clearLatency: true,
        clearError: true,
      ));
      return;
    }

    // Interface came up. Mark `reconnecting` until the first probe
    // confirms reachability.
    if (_snapshot.status == ConnectivityStatus.disconnected) {
      _emit(_snapshot.copyWith(
        status: ConnectivityStatus.reconnecting,
        at: DateTime.now(),
      ));
    }
    unawaited(_runProbe());
  }

  Future<void> _runProbe() async {
    if (_disposed) return;
    if (_snapshot.status == ConnectivityStatus.disconnected) {
      // No interface — short-circuit. The interface-change listener will
      // kick a probe when one comes back.
      return;
    }

    ProbeOutcome outcome;
    try {
      outcome = await _probe();
    } catch (_) {
      outcome = const ProbeOutcome(latencyMs: 0, errorTag: 'unknown');
    }

    if (!outcome.ok) {
      _consecutiveSlowProbes = 0;
      _emit(ConnectivitySnapshot(
        status: ConnectivityStatus.noInternet,
        at: DateTime.now(),
        lastProbeError: outcome.errorTag,
      ));
      _scheduleNextProbe(recoveryProbeInterval);
      return;
    }

    // Probe succeeded. Decide between connected vs unstable based on
    // latency hysteresis.
    final isSlow = outcome.latencyMs > unstableThreshold.inMilliseconds;
    if (isSlow) {
      _consecutiveSlowProbes++;
      final next = _consecutiveSlowProbes >= unstableEntryCount
          ? ConnectivityStatus.unstable
          : ConnectivityStatus.connected;
      _emit(ConnectivitySnapshot(
        status: next,
        at: DateTime.now(),
        lastProbeLatencyMs: outcome.latencyMs,
      ));
    } else {
      _consecutiveSlowProbes = 0;
      _emit(ConnectivitySnapshot(
        status: ConnectivityStatus.connected,
        at: DateTime.now(),
        lastProbeLatencyMs: outcome.latencyMs,
      ));
    }
    _scheduleNextProbe(healthyProbeInterval);
  }

  void _scheduleNextProbe(Duration interval) {
    if (_paused || _disposed) return;
    _probeTimer?.cancel();
    _probeTimer = Timer(interval, () => unawaited(_runProbe()));
  }

  void _emit(ConnectivitySnapshot next) {
    if (next == _snapshot) return; // dedupe — avoid flooding listeners
    _snapshot = next;
    if (!_controller.isClosed) _controller.add(next);
  }

  // ---- default probe ----------------------------------------------------

  /// Builds a Dio-backed probe that GETs `${baseUrl}/v1/health` with a
  /// short timeout and reports both latency and any error tag.
  ///
  /// Error tags:
  ///   - 'http_4xx' / 'http_5xx' on response with status
  ///   - 'timeout'  on connect/receive/send timeout
  ///   - 'dns'      on connection error
  ///   - 'tls'      on bad certificate
  ///   - 'cancelled' on cancellation
  ///   - 'unknown'  on anything else
  static ConnectivityProbe _defaultProbe(String baseUrl) {
    // Construct a tiny Dio with no interceptors so probes never trigger
    // auth/retry logic. Owned by the service for its lifetime.
    final probeDio = Dio(BaseOptions(
      baseUrl: baseUrl.endsWith('/')
          ? baseUrl.substring(0, baseUrl.length - 1)
          : baseUrl,
      connectTimeout: probeTimeout,
      receiveTimeout: probeTimeout,
      sendTimeout: probeTimeout,
      headers: const {'Accept': 'application/json'},
      followRedirects: false,
    ));
    return () async {
      final start = DateTime.now();
      String? mapDioError(DioException e) {
        switch (e.type) {
          case DioExceptionType.connectionTimeout:
          case DioExceptionType.sendTimeout:
          case DioExceptionType.receiveTimeout:
            return 'timeout';
          case DioExceptionType.connectionError:
            return 'dns';
          case DioExceptionType.badResponse:
            final code = e.response?.statusCode ?? 0;
            return 'http_${code ~/ 100}xx';
          case DioExceptionType.cancel:
            return 'cancelled';
          case DioExceptionType.badCertificate:
            return 'tls';
          case DioExceptionType.unknown:
            return 'unknown';
        }
      }

      String? errorTag;
      try {
        final res = await probeDio.get<dynamic>('/v1/health');
        final code = res.statusCode ?? 0;
        if (code >= 200 && code < 300) {
          errorTag = null;
        } else if (code >= 400) {
          errorTag = 'http_${code ~/ 100}xx';
        } else {
          errorTag = 'unknown';
        }
      } on DioException catch (e) {
        errorTag = mapDioError(e);
      } catch (_) {
        errorTag = 'unknown';
      }

      final latencyMs = DateTime.now().difference(start).inMilliseconds;
      return ProbeOutcome(latencyMs: latencyMs, errorTag: errorTag);
    };
  }
}
