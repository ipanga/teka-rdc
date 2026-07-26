import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'connectivity_provider.dart';

/// Bridges Flutter's [WidgetsBindingObserver] lifecycle events to the
/// [ConnectivityService] so it can:
///
///   * **Pause its probe timer** when the app goes to the background.
///     Saves battery + cellular data while the user can't see anything
///     anyway. Without this, the service would keep probing every 30s
///     forever, including overnight when the device is locked.
///
///   * **Force an immediate re-probe on resume**. The user might have:
///       - locked the phone for 20min and unlocked in a new wifi network
///       - swapped SIMs / toggled airplane mode during a phone call
///       - moved into / out of a captive-portal range
///     `connectivity_plus`'s stream emits on interface change, but its
///     event delivery while backgrounded can lag — manually kicking a
///     probe gives the user accurate status the second they look at the
///     app again.
///
/// Intentionally **not** touching the auth state on resume. PR2's
/// AuthInterceptor already handles the "tokens still valid after a long
/// pause" case correctly: the next API request triggers a refresh if
/// needed, and connectivity-caused refresh failures don't clear tokens.
/// Invalidating authProvider here would force-reset auth state — too
/// aggressive for a transient lifecycle event.
///
/// Wire into `app.dart` as the outermost widget under MaterialApp.router's
/// builder, wrapping the `ConnectivityToastHost`:
///
/// ```dart
/// MaterialApp.router(
///   builder: (ctx, child) => ConnectivityLifecycleObserver(
///     child: ConnectivityToastHost(child: child ?? const SizedBox()),
///   ),
///   ...
/// )
/// ```
class ConnectivityLifecycleObserver extends ConsumerStatefulWidget {
  const ConnectivityLifecycleObserver({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<ConnectivityLifecycleObserver> createState() =>
      _ConnectivityLifecycleObserverState();
}

class _ConnectivityLifecycleObserverState
    extends ConsumerState<ConnectivityLifecycleObserver>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final service = ref.read(connectivityServiceProvider);
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
        // App backgrounded / visible-but-not-foreground. Pause the
        // probe loop. Note: `pause()` is idempotent — calling it
        // multiple times (e.g. inactive → paused on iOS) is fine.
        service.pause();
        break;
      case AppLifecycleState.resumed:
        // App foregrounded. `resume()` runs an immediate probe.
        // Fire-and-forget; the service handles its own errors.
        service.resume();
        break;
      case AppLifecycleState.detached:
        // App is being torn down by the OS. No action needed — the
        // Riverpod ref.onDispose chain disposes the service for us.
        break;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
