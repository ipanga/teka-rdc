import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/connectivity/connectivity_provider.dart';
import 'core/connectivity/connectivity_status.dart';
import 'core/analytics/posthog_analytics.dart';
import 'core/connectivity/connectivity_lifecycle_observer.dart';
import 'core/connectivity/connectivity_sentry_reporter.dart';
import 'core/connectivity/widgets/connectivity_toast_host.dart';
import 'core/deep_link/deep_link_controller.dart';
import 'core/push/push_controller.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/providers/auth_provider.dart';

class TekaApp extends ConsumerWidget {
  const TekaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    // Activate the push controller — its `bind()` runs in the provider
    // factory and subscribes to authProvider, so simply reading it
    // here is enough to wire token register/unregister to login/logout.
    // The provider is read (not watched) because we don't need to
    // rebuild on changes; we just need it instantiated.
    ref.read(pushControllerProvider);

    // Activate the deep-link controller — subscribes to incoming App Links /
    // Universal Links and routes them via DeepLinkParser. Read-once-instantiate
    // (same pattern as pushController); the cold-start link is handled after
    // the first frame so the router is mounted.
    ref.read(deepLinkControllerProvider);

    // Activate the Sentry reporter — subscribes to the connectivity
    // stream + tags every Sentry event with the current state and
    // captures rate-limited events on user-visible degradations.
    // Same read-once-instantiate pattern as pushController above.
    // No-op when SENTRY_DSN is unset (FlavorConfig falls back to
    // a Sentry stub that swallows all calls).
    ref.read(connectivitySentryReporterProvider);

    // Tie PostHog identity to auth — identify(user.id, {role}) on login,
    // reset() on logout. Centralized here (one place) the same way the web
    // PostHogProvider keys off the auth store. id + role only, never
    // phone/email (Rule 13). No-op when PostHog isn't initialized.
    // A2 (2026-09-06): a session accepted while offline is confirmed the
    // moment the network is back — the server, not the phone, has the last
    // word on whether the credentials still stand.
    ref.listen<ConnectivityStatus>(connectivityStatusProvider, (prev, next) {
      final online = next == ConnectivityStatus.connected ||
          next == ConnectivityStatus.unstable;
      final wasOnline = prev == ConnectivityStatus.connected ||
          prev == ConnectivityStatus.unstable;
      if (online && !wasOnline) {
        ref.read(authProvider.notifier).reverifyIfNeeded();
      }
    });

    ref.listen<AuthState>(authProvider, (prev, next) {
      const analytics = PosthogAnalytics();
      final wasAuthed = prev?.status == AuthStatus.authenticated;
      final isAuthed = next.status == AuthStatus.authenticated;
      if (isAuthed && !wasAuthed) {
        analytics.identifyUser(next.user);
      } else if (!isAuthed && wasAuthed) {
        analytics.reset();
      }
    });

    return MaterialApp.router(
      title: 'Teka RDC',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      // French-only platform — no app localization layer; the framework's
      // Material/Widgets/Cupertino localizations render built-in widgets
      // (date pickers, tooltips, semantics) in French.
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // Wraps every route with the connectivity infrastructure:
      //   1. ConnectivityLifecycleObserver (outermost) bridges
      //      WidgetsBindingObserver lifecycle events to the
      //      connectivity service — pauses the probe timer on
      //      background, kicks a fresh probe on resume.
      //   2. ConnectivityToastHost (innermost) announces connectivity
      //      changes with a floating snackbar. It renders `child`
      //      verbatim, so it never shifts layout — unlike the banner it
      //      replaced, which sat in a Column above every route.
      // See lib/core/connectivity/.
      builder: (context, child) => ConnectivityLifecycleObserver(
        child: ConnectivityToastHost(
          child: child ?? const SizedBox.shrink(),
        ),
      ),
      routerConfig: router,
    );
  }
}
