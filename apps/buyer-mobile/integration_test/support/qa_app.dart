// Launches the REAL buyer app (TekaApp: real router, screens, providers,
// repositories and Dio chain against the local API) for opt-in native QA.
//
// What differs from main.dart — and only this:
//   * Storage is in-memory for the whole process: FlutterSecureStorage and
//     SharedPreferences are switched to their plugins' own test backends
//     BEFORE anything reads them, so the device's real keychain / prefs (the
//     installed .dev app's session, town, recent searches) are never read or
//     written. Every secure-storage instance, including TokenStorage's legacy
//     namespace and the town cache, goes through that backend.
//   * External observers NOT bound: the FCM push controller (no Firebase
//     init, no token registration) and the App Links / Universal Links
//     deep-link controller. Both providers are overridden with UNBOUND
//     instances; no product, cart, checkout or order behaviour is replaced.
//   * main()'s Sentry / PostHog / PushService init is not run (development
//     flavor ships without keys anyway).
// Auth, catalog, cart, checkout and order repositories are the shipping ones.

import 'package:buyer_mobile/app.dart';
import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/deep_link/deep_link_controller.dart';
import 'package:buyer_mobile/core/network/api_client.dart';
import 'package:buyer_mobile/core/providers/core_providers.dart';
import 'package:buyer_mobile/core/push/push_controller.dart';
import 'package:buyer_mobile/core/router/app_router.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/city/presentation/providers/city_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'qa_api.dart';
import 'qa_config.dart';
import 'qa_driver_helpers.dart';

class QaBuyerApp {
  QaBuyerApp._(this.container, this.fault);
  final ProviderContainer container;
  final QaReadFault fault;

  /// The app's own authenticated Dio (in-memory session) for API assertions.
  QaHttp get http => AppDioHttp(container.read(dioProvider));

  /// Isolated storage + container. Call once per process (one in-memory
  /// session for the whole file: OTP issuance is limited to 3 / 10 min).
  static Future<QaBuyerApp> create(QaConfig config) async {
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
      deepLinkControllerProvider.overrideWith((ref) => DeepLinkController(ref)),
    ]);
    final fault = QaReadFault();
    container.read(dioProvider).interceptors.insert(0, fault);
    return QaBuyerApp._(container, fault);
  }

  /// Current route path, without mounting the router as a side effect.
  String get route {
    if (!container.exists(appRouterProvider)) return '(routeur non monté)';
    return container
        .read(appRouterProvider)
        .routerDelegate
        .currentConfiguration
        .uri
        .path;
  }

  /// Safe one-line state for progress / failure messages: auth STATUS, town
  /// loading flags + counts and the route path only — never user fields,
  /// tokens, phones or town contents.
  String stateSummary() {
    final auth = container.exists(authProvider)
        ? container.read(authProvider).status.name
        : '(non démarrée)';
    final city = container.exists(cityProvider) ? container.read(cityProvider) : null;
    final towns = city == null
        ? '(non démarrées)'
        : 'chargement=${city.isLoading} choisie=${city.hasCity} '
            'villes=${city.cities.length} erreur=${city.error != null}';
    return 'auth=$auth ville{$towns} route=$route';
  }

  /// Starts the REAL auth and town providers before the first frame and waits
  /// until both have resolved: auth reads the (empty, in-memory) token store
  /// → unauthenticated; the town notifier performs the real GET /v1/cities.
  ///
  /// In the shipping app these providers start when the router is built and
  /// the town gate is applied by a `refreshListenable` re-evaluation once
  /// they resolve. Starting them here instead means the gate is decided by
  /// the router's INITIAL redirect evaluation — the same redirect code, the
  /// same states, without depending on how long a slow emulator takes to
  /// deliver the later refresh. Nothing is forced or stubbed.
  Future<void> startSessionAndTowns(
      {Duration timeout = const Duration(seconds: 60)}) async {
    container.read(authProvider);
    container.read(cityProvider);
    final deadline = DateTime.now().add(timeout);
    var nextLog = DateTime.now();
    while (true) {
      final authResolved =
          container.read(authProvider).status != AuthStatus.unknown;
      final townsResolved = !container.read(cityProvider).isLoading;
      if (authResolved && townsResolved) {
        qaStep('démarrage résolu : ${stateSummary()}');
        return;
      }
      if (DateTime.now().isAfter(nextLog)) {
        qaStep('démarrage en cours : ${stateSummary()}');
        nextLog = DateTime.now().add(const Duration(seconds: 5));
      }
      if (DateTime.now().isAfter(deadline)) {
        throw StateError('Démarrage non résolu en ${timeout.inSeconds} s '
            '(session et/ou GET /v1/cities) : ${stateSummary()}');
      }
      await Future<void>.delayed(const Duration(milliseconds: 150));
    }
  }

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const TekaApp(),
    ));
    await tester.pump();
  }
}
