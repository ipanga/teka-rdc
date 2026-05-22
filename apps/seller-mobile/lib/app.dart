import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'l10n/app_localizations.dart';
import 'core/locale/locale_provider.dart';
import 'core/push/push_controller.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

class TekaApp extends ConsumerWidget {
  const TekaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final locale = ref.watch(localeProvider);

    // Activate the push controller — its `bind()` runs in the provider
    // factory and subscribes to authProvider, so simply reading it
    // here is enough to wire token register/unregister to login/logout.
    ref.read(pushControllerProvider);

    return MaterialApp.router(
      title: 'Teka RDC',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
    );
  }
}
