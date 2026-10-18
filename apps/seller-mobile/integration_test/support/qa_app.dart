// Launches the REAL seller app (TekaApp: real router, screens, providers,
// repositories and Dio chain against the local API) for opt-in native QA.
//
// What differs from main.dart — and only this:
//   * Storage is in-memory for the whole process: FlutterSecureStorage and
//     SharedPreferences are switched to their plugins' own test backends
//     BEFORE anything reads them, so the device's real keychain / prefs (the
//     installed .dev app's session) are never read or written.
//   * External observer NOT bound: the FCM push controller (no Firebase init,
//     no token registration). Its provider is overridden with an UNBOUND
//     instance; no order, product or auth behaviour is replaced. (The seller
//     app has no deep-link controller.)
//   * main()'s Sentry / PostHog / PushService init is not run (development
//     flavor ships without keys anyway).
// Auth (email + password), orders and products repositories are the shipping
// ones.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/app.dart';
import 'package:seller_mobile/core/config/flavor.dart';
import 'package:seller_mobile/core/network/api_client.dart';
import 'package:seller_mobile/core/providers/core_providers.dart';
import 'package:seller_mobile/core/push/push_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'qa_api.dart';
import 'qa_config.dart';
import 'qa_driver_helpers.dart';

class QaSellerApp {
  QaSellerApp._(this.container, this.fault);
  final ProviderContainer container;
  final QaReadFault fault;

  /// The app's own authenticated Dio (in-memory seller session).
  QaHttp get http => AppDioHttp(container.read(dioProvider));

  /// Isolated storage + container. Call once per process.
  static Future<QaSellerApp> create(QaConfig config) async {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
    FlavorConfig.initialize();
    if (FlavorConfig.instance.apiBaseUrl.replaceAll(RegExp(r'/+$'), '') !=
        config.apiBaseUrl) {
      throw StateError('FlavorConfig ne pointe pas vers l’API QA validée.');
    }
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      pushControllerProvider.overrideWith((ref) => PushController(ref)),
    ]);
    final fault = QaReadFault();
    container.read(dioProvider).interceptors.insert(0, fault);
    return QaSellerApp._(container, fault);
  }

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const TekaApp(),
    ));
    await tester.pump();
  }
}
