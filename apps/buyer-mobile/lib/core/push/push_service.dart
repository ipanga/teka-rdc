import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// FCM channel ID — referenced in three places that must stay in sync:
///   - here, when creating the channel
///   - the same ID surfaced on each [AndroidNotificationDetails] when we
///     show a foreground notification
///   - `android/app/src/main/AndroidManifest.xml` meta-data
///     `com.google.firebase.messaging.default_notification_channel_id`
///
/// Picking a single channel for all order notifications keeps the user
/// settings UI to one toggle. If we ever add categories that should be
/// separately mutable (e.g. promo vs order), introduce additional channels
/// and a per-channel preference.
const _channelId = 'teka_orders';
const _channelName = 'Commandes';
const _channelDescription = 'Mises à jour de commandes et expéditions';

/// Top-level background handler. MUST be a top-level function (not a
/// method, not a closure) — the Flutter engine spins up a new isolate
/// to call it when the app is killed, and it can't reach instance state.
/// Kept minimal: we don't show anything ourselves here, the OS already
/// displays system notification from FCM's `notification` payload.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Initialize Firebase in this background isolate. The handler may run
  // before any UI exists.
  await Firebase.initializeApp();
}

/// Owns the FCM lifecycle on the buyer-mobile client. Created once at
/// app boot via `PushService.init()`; methods are then called as the
/// auth state changes (register on login, unregister on logout).
///
/// All operations are best-effort: every call is wrapped so a push
/// failure can never block auth, navigation, or any other product
/// flow. Errors are logged in debug builds and silently swallowed in
/// release — push is an additive feature.
class PushService {
  PushService._();
  static final instance = PushService._();

  // `late final` — defers the FirebaseMessaging.instance lookup until
  // first access. Without this, the singleton's constructor (which is
  // called when `PushService.instance` is first read from main.dart)
  // would touch FirebaseMessaging BEFORE `init()` had a chance to call
  // `Firebase.initializeApp()`, throwing `[core/no-app] No Firebase
  // App '[DEFAULT]' has been created`. Caught during the 2026-05-22
  // emulator smoke test.
  late final _messaging = FirebaseMessaging.instance;
  final _local = FlutterLocalNotificationsPlugin();

  String? _cachedToken;
  bool _initialized = false;

  /// Called once from `main.dart` before `runApp`. Idempotent — safe to
  /// invoke multiple times (e.g. on hot restart).
  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    try {
      await Firebase.initializeApp();

      // Background handler MUST be set before the first frame to catch
      // messages received while the app is killed.
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      await _initLocalNotifications();

      // Foreground messages don't display automatically — the OS only
      // shows the system notification when the app is background /
      // killed. We re-emit via flutter_local_notifications so the user
      // sees something either way.
      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    } catch (e) {
      _log('init failed: $e');
    }
  }

  Future<void> _initLocalNotifications() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: androidInit);
    await _local.initialize(settings);

    const channel = AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: _channelDescription,
      importance: Importance.high,
    );
    await _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(channel);
  }

  /// Prompts for notification permission on iOS / Android 13+. Android
  /// 12 and below auto-grant. Returns the granted/denied/notDetermined
  /// status so the UI can decide whether to surface a settings prompt.
  Future<AuthorizationStatus> requestPermission() async {
    try {
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      return settings.authorizationStatus;
    } catch (e) {
      _log('requestPermission failed: $e');
      return AuthorizationStatus.notDetermined;
    }
  }

  /// Returns the current FCM registration token, or null if Firebase
  /// init failed / the device hasn't generated one yet. The result is
  /// cached for the lifetime of the process; use [refreshToken] to
  /// force a re-fetch.
  Future<String?> getToken() async {
    if (_cachedToken != null) return _cachedToken;
    try {
      _cachedToken = await _messaging.getToken();
      return _cachedToken;
    } catch (e) {
      _log('getToken failed: $e');
      return null;
    }
  }

  /// Forces a token refresh — useful after a logout/login cycle to
  /// guarantee the next register() pushes a fresh value to the backend.
  Future<void> resetCache() async {
    _cachedToken = null;
  }

  /// Subscribes to token-refresh events. The caller (provider layer)
  /// re-pushes to the backend on every fired event.
  Stream<String> onTokenRefresh() => _messaging.onTokenRefresh;

  void _handleForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    // Title/body may come from notification block (display payload) or
    // data-only payload. Prefer notification block; fall back to data.
    final title = notification.title ?? message.data['title'] as String?;
    final body = notification.body ?? message.data['body'] as String?;
    if (title == null && body == null) return;

    _local.show(
      message.hashCode,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: _channelDescription,
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      // Encode the data payload as the notification payload so we can
      // route on tap. flutter_local_notifications passes it back via
      // its onSelectNotification callback (PR follow-up will wire that
      // to go_router).
      payload: message.data.isEmpty ? null : message.data.toString(),
    );
  }

  void _log(String msg) {
    if (kDebugMode) {
      // ignore: avoid_print
      print('[PushService] $msg');
    }
  }
}
