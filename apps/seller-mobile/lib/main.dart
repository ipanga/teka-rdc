import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'app.dart';
import 'core/config/flavor.dart';
import 'core/config/sentry_scrub.dart';
import 'core/push/push_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Resolve which flavor (development / staging / production) this APK is.
  // Reads `--dart-define=FLAVOR=…` + `API_BASE_URL` + optional `SENTRY_DSN`.
  // Must run before anything that touches ApiConstants.baseUrl.
  FlavorConfig.initialize();

  final dsn = FlavorConfig.instance.sentryDsn;
  if (dsn != null && dsn.isNotEmpty) {
    await SentryFlutter.init(
      (options) {
        options.dsn = dsn;
        options.environment = FlavorConfig.instance.envName;
        options.tracesSampleRate = 0.0;
        options.beforeSend = scrubBeforeSend;
      },
      appRunner: _bootstrap,
    );
  } else {
    await _bootstrap();
  }
}

Future<void> _bootstrap() async {
  // Firebase + local-notifications + handlers. Awaited before runApp so
  // the background message handler is registered before the first
  // frame. Idempotent + fail-soft (push becomes a no-op if anything
  // throws).
  await PushService.instance.init();
  runApp(const ProviderScope(child: TekaApp()));
}
