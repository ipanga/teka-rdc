import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/notifications/presentation/providers/notifications_provider.dart';

/// Things that must be fresh when the app comes back to the front
/// (PR D, 2026-09-06). Deliberately tiny — one unread-count GET, no polling:
/// the feed reloads only while its own screen is showing, and the session
/// re-check on reconnect lives in `app.dart`.
///
/// Read once in `app.dart` (same pattern as the push / deep-link controllers).
final resumeHooksProvider = Provider<AppLifecycleListener>((ref) {
  final listener = AppLifecycleListener(
    onResume: () {
      if (ref.read(authProvider).status == AuthStatus.authenticated) {
        ref.invalidate(notificationUnreadCountProvider);
      }
    },
  );
  ref.onDispose(listener.dispose);
  return listener;
});
