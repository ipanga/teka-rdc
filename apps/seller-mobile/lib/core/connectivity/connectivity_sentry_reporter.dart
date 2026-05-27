import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'connectivity_provider.dart';
import 'connectivity_status.dart';

/// Funnels connectivity state into Sentry as observability data.
///
/// Three signals land in Sentry:
///
///   1. **Tag on every event:** every Sentry event captured anywhere
///      in the app gets a `connectivity_state` tag with the current
///      snapshot status. Lets ops filter "errors that happened while
///      the user was on a noInternet connection" without instrumenting
///      every call site.
///
///   2. **Breadcrumb on every transition:** category `connectivity`,
///      payload `{ from, to, latencyMs?, error? }`. Sentry default
///      breadcrumb buffer is the last 100, which is more than enough
///      to reconstruct the path that led to an error.
///
///   3. **Captured events on user-visible problems** (rate-limited
///      to 1 per category per minute to avoid drowning the dashboard
///      when the user is on a flaky 2G connection that flaps every
///      few seconds):
///
///      * `connected → noInternet` transition — real degradation,
///        not a clean disconnect; usually indicates captive portal /
///        DNS / API outage.
///      * 5 consecutive noInternet snapshots without a connected in
///        between — sustained problem, worth investigating.
///
/// What we deliberately do NOT capture as events (only breadcrumbs):
///   * Clean `connected → disconnected` transitions — too frequent in
///     the DRC (every train ride). Would drown the Sentry dashboard.
///   * Transient `unstable` flips. Common on 2G/3G.
///   * Recoveries (anything → connected). Success doesn't need an
///     event.
///
/// Privacy: the only data attached is the connectivity state, latency,
/// and short error tag (`timeout`, `dns`, `http_5xx`). No URLs, no
/// payloads, no auth tokens. The existing phone-number scrubber in
/// `core/config/sentry_scrub.dart` is unaffected (we never emit
/// phone numbers from this code path).
class ConnectivitySentryReporter {
  ConnectivitySentryReporter(this._ref) {
    _subscribe();
  }

  static const Duration _captureCooldown = Duration(minutes: 1);
  static const int _sustainedNoInternetThreshold = 5;

  final Ref _ref;
  StreamSubscription<ConnectivitySnapshot>? _sub;
  ConnectivityStatus? _previousStatus;
  int _consecutiveNoInternet = 0;
  DateTime? _lastTransitionCapture;
  DateTime? _lastSustainedCapture;

  void _subscribe() {
    _sub = _ref
        .read(connectivityServiceProvider)
        .stream
        .listen(_onSnapshot, onError: (_) {});
  }

  Future<void> dispose() async {
    await _sub?.cancel();
    _sub = null;
  }

  Future<void> _onSnapshot(ConnectivitySnapshot snap) async {
    final previous = _previousStatus;
    _previousStatus = snap.status;

    // 1. Update the global scope tag on every transition. Subsequent
    //    Sentry events from anywhere in the app pick this up. The
    //    structured 'connectivity' context carries the richer fields
    //    (Sentry deprecated `setExtra` in favor of named contexts).
    await Sentry.configureScope((scope) {
      scope.setTag('connectivity_state', snap.status.name);
      scope.setContexts('connectivity', {
        'status': snap.status.name,
        if (snap.lastProbeLatencyMs != null)
          'latency_ms': snap.lastProbeLatencyMs,
        if (snap.lastProbeError != null) 'last_error': snap.lastProbeError,
      });
    });

    // 2. Breadcrumb on every transition. Skip if the status didn't
    //    actually change (dedupe).
    if (previous != snap.status) {
      Sentry.addBreadcrumb(Breadcrumb(
        category: 'connectivity',
        level: _levelFor(snap.status),
        message: '${previous?.name ?? 'init'} -> ${snap.status.name}',
        data: {
          'from': previous?.name,
          'to': snap.status.name,
          if (snap.lastProbeLatencyMs != null)
            'latency_ms': snap.lastProbeLatencyMs,
          if (snap.lastProbeError != null) 'error': snap.lastProbeError,
        },
      ));
    }

    // 3. Track consecutive noInternet count. Reset on any other state.
    if (snap.status == ConnectivityStatus.noInternet) {
      _consecutiveNoInternet++;
    } else {
      _consecutiveNoInternet = 0;
    }

    // 4. Capture event on connected → noInternet (degradation, not a
    //    clean disconnect). Rate-limited.
    if (previous == ConnectivityStatus.connected &&
        snap.status == ConnectivityStatus.noInternet &&
        _passesRateLimit(_lastTransitionCapture)) {
      _lastTransitionCapture = DateTime.now();
      await Sentry.captureMessage(
        'connected_to_noInternet',
        level: SentryLevel.warning,
        withScope: (scope) {
          scope.setTag('connectivity_event', 'degradation');
          scope.setContexts('connectivity_event', {
            'kind': 'degradation',
            'probe_error': snap.lastProbeError ?? 'unknown',
          });
        },
      );
    }

    // 5. Capture event on sustained noInternet (>= 5 consecutive
    //    failures without a recovery). Rate-limited.
    if (_consecutiveNoInternet >= _sustainedNoInternetThreshold &&
        _passesRateLimit(_lastSustainedCapture)) {
      _lastSustainedCapture = DateTime.now();
      await Sentry.captureMessage(
        'sustained_noInternet',
        level: SentryLevel.warning,
        withScope: (scope) {
          scope.setTag('connectivity_event', 'sustained_failure');
          scope.setContexts('connectivity_event', {
            'kind': 'sustained_failure',
            'consecutive_failures': _consecutiveNoInternet,
            'last_probe_error': snap.lastProbeError ?? 'unknown',
          });
        },
      );
    }
  }

  bool _passesRateLimit(DateTime? lastAt) {
    if (lastAt == null) return true;
    return DateTime.now().difference(lastAt) > _captureCooldown;
  }

  SentryLevel _levelFor(ConnectivityStatus status) {
    switch (status) {
      case ConnectivityStatus.connected:
        return SentryLevel.info;
      case ConnectivityStatus.unstable:
      case ConnectivityStatus.reconnecting:
        return SentryLevel.info;
      case ConnectivityStatus.disconnected:
      case ConnectivityStatus.noInternet:
        return SentryLevel.warning;
    }
  }
}

/// Riverpod hook for [ConnectivitySentryReporter]. Reading this
/// provider — typically once from `TekaApp.build()` — instantiates
/// the reporter which then subscribes to the connectivity stream for
/// the app's lifetime.
final connectivitySentryReporterProvider =
    Provider<ConnectivitySentryReporter>((ref) {
  final reporter = ConnectivitySentryReporter(ref);
  ref.onDispose(reporter.dispose);
  return reporter;
});
