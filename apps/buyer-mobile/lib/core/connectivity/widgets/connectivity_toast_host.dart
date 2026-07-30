import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../widgets/app_snackbar.dart';
import '../connectivity_provider.dart';
import '../connectivity_status.dart';

/// The two things a user can actually act on. The service's five states are
/// deliberately collapsed here — `unstable` means "online but slow" (nothing
/// to do) and `reconnecting` is an internal transient.
///
/// Private on purpose: `isOfflineProvider` must stay the checkout gate's
/// definition of offline. Folding `reconnecting` into "offline" for the toast
/// would, if shared, flicker the place-order button disabled on every
/// recovery probe.
enum _ConnectivityUx { offline, online }

/// Announces connectivity changes with a floating snackbar, without ever
/// touching layout.
///
/// Replaces the pre-2026-07 `ConnectivityBannerHost`, which rendered a
/// full-width bar in a `Column` above the routed content: it pushed every
/// screen down on appearance, and on a flapping 2G link the 3s "Connexion
/// rétablie" bar re-fired every few seconds, reflowing the page each time.
///
/// Mounted exactly where that banner was — inside `MaterialApp.router`'s
/// `builder:` — because `MaterialApp` wraps `builder` *inside* its
/// `ScaffoldMessenger`, so this widget shares the very messenger every routed
/// `Scaffold` resolves to. No `scaffoldMessengerKey` needed.
///
/// ```dart
/// MaterialApp.router(
///   builder: (ctx, child) => ConnectivityLifecycleObserver(
///     child: ConnectivityToastHost(child: child ?? const SizedBox.shrink()),
///   ),
///   ...
/// )
/// ```
///
/// State → UX:
///   * `disconnected` / `noInternet` → "Connexion Internet indisponible."
///   * `connected`                   → "Connexion rétablie." — only to close a
///                                     loop we actually opened.
///   * `unstable` / `reconnecting`   → nothing.
///
/// There is deliberately **no** persistent global offline chrome. Sustained
/// offline is surfaced by the screen that needs it (checkout's inline
/// "Connexion requise pour passer commande" notice, `AppErrorState`'s retry),
/// which is what "show it only when meaningful to the current action" means.
/// An infinite-duration snackbar was considered and rejected: `showSnackBar`
/// queues, so it would starve every other snackbar for the whole offline
/// window.
///
/// Sentry keeps full five-state fidelity — `ConnectivitySentryReporter`
/// subscribes to the service stream directly, not to this widget.
class ConnectivityToastHost extends ConsumerStatefulWidget {
  const ConnectivityToastHost({super.key, required this.child});

  final Widget child;

  /// How long a bucket must hold before it is announced. Swallows every
  /// sub-2s flap, and moves the `showSnackBar` call into a timer callback
  /// (calling it during build would assert).
  static const Duration settleDelay = Duration(seconds: 2);

  /// Hard ceiling of one connectivity toast per minute. Chosen as 2×
  /// `ConnectivityService.healthyProbeInterval` (30s) — the fastest cadence at
  /// which the state machine can sustainably oscillate — so a link that fails
  /// every probe cycle still cannot spam, while an isolated real event is
  /// never suppressed.
  static const Duration minNotifyInterval = Duration(seconds: 60);

  static const Duration offlineToastDuration = Duration(seconds: 4);
  static const Duration restoredToastDuration = Duration(seconds: 2);

  static const String offlineMessage = 'Connexion Internet indisponible.';
  static const String restoredMessage = 'Connexion rétablie.';

  @override
  ConsumerState<ConnectivityToastHost> createState() =>
      _ConnectivityToastHostState();
}

class _ConnectivityToastHostState extends ConsumerState<ConnectivityToastHost> {
  /// Last bucket seen on the stream (announced or not).
  _ConnectivityUx? _pendingBucket;

  /// Last bucket the user has actually been told about. `null` means nothing
  /// has been announced yet — the cold-start guard.
  _ConnectivityUx? _notifiedBucket;

  /// True while an offline toast is outstanding, i.e. a "rétablie" toast
  /// would close a loop the user has seen opened. Suppressed offline events
  /// leave this false so their recovery stays silent too.
  bool _offlineToastShown = false;

  bool _inCooldown = false;
  Timer? _settleTimer;
  Timer? _cooldownTimer;

  @override
  void initState() {
    super.initState();
    // `ref.listen` only fires on changes *after* registration. If the stream
    // already carries a value when this widget mounts, adopt it once so the
    // first real transition is measured against the right baseline.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final snapshot = ref.read(connectivitySnapshotProvider).valueOrNull;
      if (snapshot != null) _onSnapshot(snapshot);
    });
  }

  @override
  void dispose() {
    _settleTimer?.cancel();
    _cooldownTimer?.cancel();
    super.dispose();
  }

  void _onSnapshot(ConnectivitySnapshot snapshot) {
    final status = snapshot.status;

    // Transient by construction: entered on every interface-up and on cold
    // start. Treating it as a bucket would flash a toast at every launch.
    if (status == ConnectivityStatus.reconnecting) return;

    final bucket = (status == ConnectivityStatus.disconnected ||
            status == ConnectivityStatus.noInternet)
        ? _ConnectivityUx.offline
        : _ConnectivityUx.online;

    // Dedupe on the bucket, never on the snapshot: `ConnectivitySnapshot ==`
    // includes `at` and `lastProbeLatencyMs`, so a fresh snapshot lands on
    // every probe (~30s) even when nothing changed.
    if (bucket == _pendingBucket) return;
    _pendingBucket = bucket;

    _settleTimer?.cancel();

    // Flapped back to what the user already knows — drop the pending toast
    // instead of announcing a change that has already been undone.
    if (bucket == _notifiedBucket) return;

    _settleTimer = Timer(
      ConnectivityToastHost.settleDelay,
      () => _onSettled(bucket),
    );
  }

  void _onSettled(_ConnectivityUx bucket) {
    if (!mounted) return;
    if (_pendingBucket != bucket || bucket == _notifiedBucket) return;

    // Backgrounded — a toast nobody can see would only burn the cooldown.
    // Adopt the bucket silently. `lifecycleState` is null before the first
    // platform lifecycle message (and under the test binding), which counts
    // as visible.
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    if (lifecycle != null && lifecycle != AppLifecycleState.resumed) {
      _notifiedBucket = bucket;
      _offlineToastShown = false;
      return;
    }

    final coldStart = _notifiedBucket == null;
    _notifiedBucket = bucket;

    if (bucket == _ConnectivityUx.offline) {
      // Cold start straight into offline is worth announcing; a repeat within
      // the cooldown is not.
      if (!coldStart && _inCooldown) {
        _offlineToastShown = false;
        return;
      }
      _offlineToastShown = _toast(bucket);
      return;
    }

    // INVARIANT: the app booting healthy (`reconnecting → connected`) must
    // never flash "Connexion rétablie". Guarded twice — nothing was announced
    // yet (coldStart), and no offline toast is outstanding.
    if (coldStart) return;
    if (!_offlineToastShown) return;
    _offlineToastShown = false;
    if (_inCooldown) return;
    _toast(bucket);
  }

  /// Returns whether the toast was actually displayed.
  bool _toast(_ConnectivityUx bucket) {
    final isOffline = bucket == _ConnectivityUx.offline;
    final shown = showAppSnackbar(
      context,
      message: isOffline
          ? ConnectivityToastHost.offlineMessage
          : ConnectivityToastHost.restoredMessage,
      tone: isOffline ? AppSnackbarTone.error : AppSnackbarTone.success,
      icon: isOffline ? Icons.wifi_off_outlined : Icons.wifi_outlined,
      duration: isOffline
          ? ConnectivityToastHost.offlineToastDuration
          : ConnectivityToastHost.restoredToastDuration,
      // Rate-limited to ≤1/min, so preempting an unrelated snackbar is
      // acceptable and keeps the message current rather than stale.
      replaceCurrent: true,
    );
    if (shown == null) return false; // no messenger — don't start the cooldown

    _inCooldown = true;
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer(
      ConnectivityToastHost.minNotifyInterval,
      () => _inCooldown = false,
    );
    return true;
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<ConnectivitySnapshot>>(
      connectivitySnapshotProvider,
      (previous, next) {
        final snapshot = next.valueOrNull;
        if (snapshot != null) _onSnapshot(snapshot);
      },
    );

    // Zero layout contribution — this is the whole point of the widget.
    return widget.child;
  }
}
