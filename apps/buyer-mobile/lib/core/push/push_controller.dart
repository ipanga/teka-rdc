import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/city/presentation/providers/city_provider.dart';
import '../../features/notifications/presentation/providers/notifications_provider.dart';
import '../navigation/pending_route.dart';
import '../router/app_router.dart';
import 'notification_router.dart';
import 'push_api.dart';
import 'push_service.dart';

/// Bridges the auth lifecycle to push-token registration.
///
/// Watches [authProvider]:
///   - on transition into AUTHENTICATED → request permission, get FCM
///     token, POST it to the backend
///   - on transition out of AUTHENTICATED → DELETE the current token
///     from the backend so the prior account stops receiving pushes
/// Token-refresh events from FCM are re-pushed to the backend as long
/// as the user is still authenticated.
///
/// Read-only externally — instantiated in `app.dart` (or the top-level
/// router) via `ref.watch(pushControllerProvider)` so it stays alive
/// for the app lifetime. The provider returns nothing; its side effect
/// is the subscription.
final pushControllerProvider = Provider<PushController>((ref) {
  final controller = PushController(ref);
  ref.onDispose(controller.dispose);
  controller.bind();
  return controller;
});

class PushController {
  PushController(this._ref);

  final Ref _ref;
  ProviderSubscription<AuthState>? _authSub;
  StreamSubscription<String>? _tokenSub;
  StreamSubscription<RemoteMessage>? _onOpenedSub;
  String? _registeredToken;

  void bind() {
    // React to every auth-state change. Riverpod's `listen` fires the
    // current value synchronously when called with fireImmediately,
    // which is what we want — if we boot already-authenticated, we
    // register the token right away.
    _authSub = _ref.listen<AuthState>(
      authProvider,
      (prev, next) => _onAuthChanged(prev, next),
      fireImmediately: true,
    );

    // Token-refresh stream — fires when FCM rotates the token (rare in
    // practice but does happen on reinstall / restore-from-backup).
    _tokenSub = PushService.instance.onTokenRefresh().listen(_onTokenRefresh);

    // ---- Notification tap routing ----------------------------------
    //
    // Three sources of taps:
    //   1. Foreground local-notification tap → PushService.onTap
    //      (wired below; the local-notif plugin's
    //      onDidReceiveNotificationResponse decodes the JSON payload
    //      and calls back into us).
    //   2. Background system-notification tap → FCM stream
    //      `onMessageOpenedApp`. Fires when the app is in background
    //      and the user taps the OS-tray notification.
    //   3. Killed-app launch → `getInitialMessage`. The RemoteMessage
    //      that launched the app (null if the user opened normally).
    //      Deferred to post-first-frame so the GoRouter is wired
    //      before we try to navigate.
    PushService.instance.onTap = _handleTapData;
    // A message received while the app is open: the Notification Center and
    // the bell badge must not stay stale until the buyer pulls to refresh
    // (PR D, 2026-09-06). Cheap — one feed GET + one count GET — and only
    // for a signed-in buyer (guests have no feed).
    PushService.instance.onForegroundMessage = _handleForegroundMessage;
    _onOpenedSub = FirebaseMessaging.onMessageOpenedApp.listen((msg) {
      _handleTapData(msg.data);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) _handleTapData(initial.data);
    });
  }

  void _handleTapData(Map<String, dynamic> data) {
    final route = NotificationRouter.routeForData(data);
    if (route == null) {
      _log('tap ignored — no route for payload keys ${data.keys.toList()}');
      return;
    }
    // First launch, no town yet: the router would replace the pushed route
    // with /city-selection and the tap would be lost. Park it; the
    // city-selection screen opens it once a town is chosen.
    final action = resolveExternalRoute(
      hasCity: _ref.read(cityProvider).hasCity,
    );
    if (action == ExternalRouteAction.deferBehindCityGate) {
      _ref.read(pendingRouteProvider.notifier).state = route;
      _log('tap deferred behind the city gate');
      return;
    }
    try {
      _ref.read(appRouterProvider).push(route);
      _log('tap → push $route');
    } catch (e) {
      _log('tap navigation failed for $route: $e');
    }
  }

  void _handleForegroundMessage(Map<String, dynamic> data) {
    if (_ref.read(authProvider).status != AuthStatus.authenticated) return;
    _ref.invalidate(notificationUnreadCountProvider);
    // Only refresh a feed that is alive (someone opened the center this
    // session); creating it here would fetch for nothing.
    if (_ref.exists(notificationsProvider)) {
      // ignore: discarded_futures
      _ref.read(notificationsProvider.notifier).refresh();
    }
  }

  Future<void> _onAuthChanged(AuthState? prev, AuthState next) async {
    final wasAuth = prev?.status == AuthStatus.authenticated;
    final isAuth = next.status == AuthStatus.authenticated;

    if (!wasAuth && isAuth) {
      await _registerCurrentToken();
    } else if (wasAuth && !isAuth) {
      await _unregisterCurrentToken();
    }
  }

  Future<void> _registerCurrentToken() async {
    try {
      await PushService.instance.requestPermission();
      final token = await PushService.instance.getToken();
      if (token == null) {
        _log('no token available — skipping register');
        return;
      }
      await _ref.read(pushApiProvider).register(token: token);
      _registeredToken = token;
      _log('token registered');
    } catch (e) {
      _log('register failed: $e');
    }
  }

  Future<void> _unregisterCurrentToken() async {
    final token = _registeredToken ?? await PushService.instance.getToken();
    if (token == null) return;
    try {
      await _ref.read(pushApiProvider).unregister(token);
      _registeredToken = null;
      // Reset cache so the next login fetches a fresh token (defensive
      // — FCM doesn't actually rotate on logout, but if we ever switch
      // to delete-on-logout semantics we want a known state).
      await PushService.instance.resetCache();
      _log('token unregistered');
    } catch (e) {
      _log('unregister failed: $e');
    }
  }

  Future<void> _onTokenRefresh(String newToken) async {
    // Only re-register if the user is still logged in. If they logged
    // out we don't want a stale token to silently re-attach.
    final state = _ref.read(authProvider);
    if (state.status != AuthStatus.authenticated) return;
    try {
      await _ref.read(pushApiProvider).register(token: newToken);
      _registeredToken = newToken;
      _log('token rotated and re-registered');
    } catch (e) {
      _log('rotation re-register failed: $e');
    }
  }

  void dispose() {
    _authSub?.close();
    _tokenSub?.cancel();
    _onOpenedSub?.cancel();
    // Clear the foreground-tap callback so PushService doesn't hold a
    // stale Ref reference after dispose. Defensive — providers in
    // production typically outlive any dispose call.
    if (identical(PushService.instance.onTap, _handleTapData)) {
      PushService.instance.onTap = null;
    }
    if (identical(
        PushService.instance.onForegroundMessage, _handleForegroundMessage)) {
      PushService.instance.onForegroundMessage = null;
    }
  }

  void _log(String msg) {
    if (kDebugMode) {
      // ignore: avoid_print
      print('[PushController] $msg');
    }
  }
}
