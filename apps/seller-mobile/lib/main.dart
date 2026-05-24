import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/config/flavor.dart';
import 'core/push/push_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Resolve which flavor (development / staging / production) this APK is.
  // Reads `--dart-define=FLAVOR=…` + `API_BASE_URL` + optional `SENTRY_DSN`.
  // Must run before anything that touches ApiConstants.baseUrl.
  FlavorConfig.initialize();
  // Firebase + local-notifications + handlers. Awaited before runApp so
  // the background message handler is registered before the first
  // frame. Idempotent + fail-soft (push becomes a no-op if anything
  // throws).
  await PushService.instance.init();
  runApp(const ProviderScope(child: TekaApp()));
}
