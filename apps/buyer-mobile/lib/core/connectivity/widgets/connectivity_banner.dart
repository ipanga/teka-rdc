import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/teka_colors.dart';
import '../connectivity_provider.dart';
import '../connectivity_status.dart';

/// Wraps the entire routed app and shows a slim banner above the page
/// content whenever the device's connectivity isn't healthy. Designed
/// to be injected via `MaterialApp.router.builder`:
///
/// ```dart
/// MaterialApp.router(
///   builder: (context, child) => ConnectivityBannerHost(child: child!),
///   ...
/// )
/// ```
///
/// Behavior:
///   * `connected` (steady state)  → banner is hidden (zero height).
///   * `disconnected`              → red banner, "Pas de connexion internet".
///   * `noInternet` / `unstable`   → orange banner, "Internet limité" /
///                                   "Connexion instable".
///   * `reconnecting`              → orange banner, "Reconnexion...".
///   * transition offline → connected → green banner with
///     "Connexion rétablie" for 3 seconds, then hides.
///
/// The banner sits above all routed content via a Column, briefly
/// reflowing the page when it appears/disappears. AnimatedSize keeps the
/// transition pleasant; AnimatedSwitcher cross-fades the inner content
/// when the state changes within a still-visible banner (e.g. red →
/// orange when the user grants captive-portal access).
class ConnectivityBannerHost extends ConsumerStatefulWidget {
  const ConnectivityBannerHost({super.key, required this.child});

  final Widget child;

  /// How long the "Connexion rétablie" green banner stays visible after
  /// the offline → connected transition.
  static const Duration restoredDisplayDuration = Duration(seconds: 3);

  @override
  ConsumerState<ConnectivityBannerHost> createState() =>
      _ConnectivityBannerHostState();
}

class _ConnectivityBannerHostState
    extends ConsumerState<ConnectivityBannerHost> {
  Timer? _restoredTimer;
  bool _showRestored = false;

  /// The last "truly offline" status the widget observed
  /// (`disconnected` or `noInternet`). Used to decide whether a
  /// subsequent `connected` emission deserves the green "Connexion
  /// rétablie" banner. Cleared when that banner is triggered.
  ///
  /// Crucially, **`reconnecting` and `unstable` do NOT count as
  /// offline**. That prevents the green banner from firing on app
  /// startup (where the stream's first emission is `reconnecting`
  /// before the first probe completes), and lets the transient
  /// `disconnected → reconnecting → connected` recovery sequence still
  /// trigger the banner correctly (the `disconnected` step records
  /// the offline state, the `reconnecting` step is a no-op, the
  /// `connected` step fires).
  ConnectivityStatus? _previousOfflineStatus;

  @override
  void dispose() {
    _restoredTimer?.cancel();
    super.dispose();
  }

  void _handleStatusChange(ConnectivityStatus next) {
    switch (next) {
      case ConnectivityStatus.disconnected:
      case ConnectivityStatus.noInternet:
        _previousOfflineStatus = next;
        if (_showRestored) {
          // Dropped back to offline before the 3s green window expired.
          // Kill it so the user sees the new error state immediately.
          _restoredTimer?.cancel();
          setState(() => _showRestored = false);
        }
        break;
      case ConnectivityStatus.connected:
        if (_previousOfflineStatus != null && !_showRestored) {
          _previousOfflineStatus = null;
          setState(() => _showRestored = true);
          _restoredTimer?.cancel();
          _restoredTimer = Timer(
            ConnectivityBannerHost.restoredDisplayDuration,
            () {
              if (mounted) setState(() => _showRestored = false);
            },
          );
        }
        break;
      case ConnectivityStatus.reconnecting:
      case ConnectivityStatus.unstable:
        // Transient / intermediate states — neither record offline nor
        // trigger restored. Preserves any previously-recorded offline
        // status so the eventual `connected` emission can still fire
        // the green banner.
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(connectivitySnapshotProvider);
    final status = async.maybeWhen(
      data: (snap) => snap.status,
      orElse: () => ConnectivityStatus.reconnecting,
    );

    // Only react to real stream emissions; skip the synthetic loading
    // state so app boot on a healthy network doesn't flash the banner.
    if (async.hasValue) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _handleStatusChange(status);
      });
    }

    final spec = _bannerSpecFor(context, status, _showRestored);

    return Column(
      children: [
        AnimatedSize(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          alignment: Alignment.topCenter,
          child: spec == null
              ? const SizedBox(width: double.infinity, height: 0)
              : _BannerBar(spec: spec),
        ),
        Expanded(child: widget.child),
      ],
    );
  }

  _BannerSpec? _bannerSpecFor(
    BuildContext context,
    ConnectivityStatus status,
    bool showRestored,
  ) {
    if (showRestored && status == ConnectivityStatus.connected) {
      return _BannerSpec(
        text: "Connexion rétablie",
        background: TekaColors.success,
        foreground: Colors.white,
        icon: Icons.check_circle_outline,
        key: const ValueKey('restored'),
      );
    }
    switch (status) {
      case ConnectivityStatus.connected:
        return null;
      case ConnectivityStatus.disconnected:
        return _BannerSpec(
          text: "Pas de connexion internet",
          background: TekaColors.destructive,
          foreground: Colors.white,
          icon: Icons.wifi_off_outlined,
          key: const ValueKey('disconnected'),
        );
      case ConnectivityStatus.noInternet:
        return _BannerSpec(
          text: "Internet limité",
          background: TekaColors.warning,
          foreground: Colors.white,
          icon: Icons.signal_wifi_bad_outlined,
          key: const ValueKey('noInternet'),
        );
      case ConnectivityStatus.unstable:
        return _BannerSpec(
          text: "Connexion instable",
          background: TekaColors.warning,
          foreground: Colors.white,
          icon: Icons.network_check_outlined,
          key: const ValueKey('unstable'),
        );
      case ConnectivityStatus.reconnecting:
        return _BannerSpec(
          text: "Reconnexion...",
          background: TekaColors.warning,
          foreground: Colors.white,
          icon: Icons.sync,
          key: const ValueKey('reconnecting'),
        );
    }
  }
}

class _BannerSpec {
  final String text;
  final Color background;
  final Color foreground;
  final IconData icon;
  final ValueKey<String> key;

  const _BannerSpec({
    required this.text,
    required this.background,
    required this.foreground,
    required this.icon,
    required this.key,
  });
}

class _BannerBar extends StatelessWidget {
  const _BannerBar({required this.spec});

  final _BannerSpec spec;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: spec.background,
      child: SafeArea(
        bottom: false,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: Container(
            key: spec.key,
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 8,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(spec.icon, color: spec.foreground, size: 16),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    spec.text,
                    style: TextStyle(
                      color: spec.foreground,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
