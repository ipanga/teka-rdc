import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app.dart';
import 'core/config/flavor.dart';
import 'core/config/sentry_scrub.dart';
import 'core/providers/core_providers.dart';
import 'core/push/push_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Resolve which flavor (development / staging / production) this APK is.
  // Reads `--dart-define=FLAVOR=…` + `API_BASE_URL` + optional `SENTRY_DSN`.
  // Must run before anything that touches ApiConstants.baseUrl.
  FlavorConfig.initialize();

  final dsn = FlavorConfig.instance.sentryDsn;
  if (dsn != null && dsn.isNotEmpty) {
    // SentryFlutter.init wraps appRunner in a guarded Zone — async errors,
    // FlutterError.onError, and PlatformDispatcher.onError all flow to
    // Sentry automatically. No extra runZonedGuarded needed.
    await SentryFlutter.init(
      (options) {
        options.dsn = dsn;
        options.environment = FlavorConfig.instance.envName;
        // Errors-only — match apps/api/src/instrument.ts. Revisit when
        // there's a specific question about app-start / network perf.
        options.tracesSampleRate = 0.0;
        options.beforeSend = scrubBeforeSend;
      },
      appRunner: _bootstrap,
    );
  } else {
    // DSN unset (dev, or prod before PR 4 wires build args). Run the app
    // without Sentry wiring; nothing else changes.
    await _bootstrap();
  }
}

Future<void> _bootstrap() async {
  // Firebase + local-notifications + handlers. Awaited before runApp so
  // the background message handler is registered before the first
  // frame — otherwise a push that arrives mid-init could miss its
  // isolate entry point. PushService.init() is idempotent and never
  // throws — failures degrade silently (push becomes a no-op).
  await PushService.instance.init();

  // SharedPreferences is the disk-backing for the connectivity cache
  // layer (lib/core/cache/typed_cache.dart) — preload it here so the
  // Riverpod provider doesn't have to be async-aware. Awaiting blocks
  // the first frame by ~10ms on cold start; acceptable.
  final prefs = await SharedPreferences.getInstance();

  runApp(ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
    ],
    child: const TekaApp(),
  ));
}
