import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
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
  }

  void _log(String msg) {
    if (kDebugMode) {
      // ignore: avoid_print
      print('[PushController] $msg');
    }
  }
}
