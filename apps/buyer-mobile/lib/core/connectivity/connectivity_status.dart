/// Centralized 5-state machine for the app's view of internet connectivity.
///
/// Differs from `connectivity_plus`'s raw `ConnectivityResult` (which only
/// reports the interface — wifi / mobile / none) by also distinguishing
/// "interface but no actual internet" (e.g. captive portal, DNS failure,
/// API down) and "connection is slow / flaky".
///
/// State transitions are owned by `ConnectivityService`; consumers (UI,
/// interceptors) should treat this as read-only.
enum ConnectivityStatus {
  /// Network interface up + last reachability probe to our API succeeded
  /// within the latency threshold. Normal operation.
  connected,

  /// `connectivity_plus` reports no network interface (airplane mode,
  /// wifi off + mobile data off). Fail-fast for non-safe requests.
  disconnected,

  /// Network interface up but reachability probe to our API failed
  /// (captive portal, DNS failure, router outage, our API down).
  noInternet,

  /// Probes succeed but latency is consistently high (slow 2G/3G). Used
  /// to nudge the UI to show progress indicators sooner.
  unstable,

  /// Transitional state — we just came back from `disconnected` or
  /// `noInternet` and the first confirming probe hasn't completed yet.
  /// Short-lived (<3s in practice).
  reconnecting,
}

/// Immutable snapshot of the connectivity state at a moment in time.
/// Emitted by `ConnectivityService.stream` on every transition.
class ConnectivitySnapshot {
  final ConnectivityStatus status;
  final DateTime at;

  /// Round-trip latency of the most recent successful probe, in ms.
  /// Null when no probe has succeeded since the last interface change.
  final int? lastProbeLatencyMs;

  /// Short tag describing the last probe failure (`'timeout'`,
  /// `'http_500'`, `'dns'`, `'cancelled'`, …). Null on success.
  /// Sentry/breadcrumb-safe (no URLs, no headers, no body).
  final String? lastProbeError;

  const ConnectivitySnapshot({
    required this.status,
    required this.at,
    this.lastProbeLatencyMs,
    this.lastProbeError,
  });

  bool get isOnline =>
      status == ConnectivityStatus.connected ||
      status == ConnectivityStatus.unstable;

  bool get isOffline =>
      status == ConnectivityStatus.disconnected ||
      status == ConnectivityStatus.noInternet;

  ConnectivitySnapshot copyWith({
    ConnectivityStatus? status,
    DateTime? at,
    int? lastProbeLatencyMs,
    String? lastProbeError,
    bool clearLatency = false,
    bool clearError = false,
  }) {
    return ConnectivitySnapshot(
      status: status ?? this.status,
      at: at ?? this.at,
      lastProbeLatencyMs:
          clearLatency ? null : (lastProbeLatencyMs ?? this.lastProbeLatencyMs),
      lastProbeError:
          clearError ? null : (lastProbeError ?? this.lastProbeError),
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ConnectivitySnapshot &&
          other.status == status &&
          other.at == at &&
          other.lastProbeLatencyMs == lastProbeLatencyMs &&
          other.lastProbeError == lastProbeError);

  @override
  int get hashCode => Object.hash(status, at, lastProbeLatencyMs, lastProbeError);

  @override
  String toString() =>
      'ConnectivitySnapshot($status, latency=${lastProbeLatencyMs}ms, '
      'error=$lastProbeError)';
}
