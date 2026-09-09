import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:seller_mobile/core/providers/seller_refresh_provider.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/core/theme/teka_colors.dart';
import 'package:seller_mobile/core/widgets/seller_status_badge.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/profile/data/profile_repository.dart';
import 'package:seller_mobile/features/profile/presentation/screens/profile_screen.dart';

import '../../support/seller_dashboard_fixtures.dart';
import '../../support/seller_profile_fixtures.dart';

late FixtureAuthNotifier _auth;

Future<GoRouter> _pump(
  WidgetTester tester,
  FixtureProfileRepository repo, {
  Size size = const Size(390, 844),
  double textScale = 1,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  _auth = FixtureAuthNotifier();
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => const ProfileScreen()),
    for (final r in [
      '/profile/personal',
      '/profile/shop',
      '/profile/verification',
      '/profile/security',
      '/orders',
      '/earnings'
    ])
      GoRoute(path: r, builder: (_, __) => Scaffold(body: Text('ÉCRAN $r'))),
    GoRoute(
        path: '/auth/login',
        builder: (_, __) => const Scaffold(body: Text('ÉCRAN CONNEXION'))),
  ]);
  await tester.pumpWidget(
    ProviderScope(
      // A new scope per pump: a second seller's session is a new tree, as a
      // real logout/login is (the shell is disposed).
      key: ValueKey(repo),
      overrides: [
        profileRepositoryProvider.overrideWithValue(repo),
        authProvider.overrideWith((ref) => _auth),
      ],
      child: MaterialApp.router(
        theme: AppTheme.lightTheme,
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return router;
}

Future<void> _reveal(WidgetTester tester, String text) async {
  await tester.dragUntilVisible(
      find.text(text), find.byType(ListView).first, const Offset(0, -120));
  await tester.pumpAndSettle();
}

Color _badgeColor(WidgetTester tester, String label) => tester
    .widget<SellerStatusBadge>(find.ancestor(
        of: find.text(label), matching: find.byType(SellerStatusBadge)))
    .color;

void main() {
  testWidgets(
      'loaded: shop first, then the person, the login email, town · commune, and both statuses as labelled badges',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);

    expect(find.text('Boutique Marie'), findsOneWidget);
    expect(find.text('Marie Kabila'), findsOneWidget);
    expect(find.text('marie@shop.cd'), findsOneWidget);
    expect(find.text('Lubumbashi · Kampemba'), findsOneWidget);
    expect(_badgeColor(tester, 'Boutique approuvée'), TekaColors.successForeground);
    expect(_badgeColor(tester, 'Non vérifié'), TekaColors.neutralForeground);
    // The user's own phone is not part of the account header.
    expect(find.textContaining('+243'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('loading is a static skeleton, not a spinner', (tester) async {
    final gate = Completer<void>();
    final repo = FixtureProfileRepository()..hold = gate.future;
    await _pump(tester, repo);
    expect(find.byType(ProfileSkeleton), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    gate.complete();
    await tester.pump();
    await tester.pump();
    expect(find.byType(ProfileSkeleton), findsNothing);
    expect(find.text('Boutique Marie'), findsOneWidget);
  });

  testWidgets('a failed load shows a scoped error with retry; the retry loads',
      (tester) async {
    final repo = FixtureProfileRepository()..failMe = true;
    await _pump(tester, repo);
    expect(find.text('Compte indisponible'), findsOneWidget);
    expect(find.text('Réessayer'), findsOneWidget);
    repo.failMe = false;
    await tester.tap(find.text('Réessayer'));
    await tester.pump();
    await tester.pump();
    await tester.pump();
    expect(find.text('Boutique Marie'), findsOneWidget);
  });

  testWidgets(
      'a refused verification is the one row that asks for action: « Action requise » pill, destructive tones, opens the verification',
      (tester) async {
    final repo =
        FixtureProfileRepository(me: meJson(verificationStatus: 'REJECTED'));
    await _pump(tester, repo);

    expect(_badgeColor(tester, 'Vérification refusée'),
        TekaColors.destructiveForeground);
    await _reveal(tester, 'Action requise');
    expect(find.text('Action requise'), findsOneWidget);
    expect(find.textContaining('nouveaux documents à fournir'), findsOneWidget);
    await tester.tap(find.text('Vérification de la boutique'));
    await tester.pumpAndSettle();
    expect(find.text('ÉCRAN /profile/verification'), findsOneWidget);
  });

  testWidgets('pending and verified read in words on their own tones',
      (tester) async {
    await _pump(
        tester,
        FixtureProfileRepository(
            me: meJson(
                applicationStatus: 'PENDING',
                verificationStatus: 'PENDING_REVIEW')));
    expect(_badgeColor(tester, 'Demande en révision'), TekaColors.warningForeground);
    expect(_badgeColor(tester, 'En attente de vérification'),
        TekaColors.warningForeground);
    expect(find.text('Action requise'), findsNothing);
  });

  testWidgets('verified reads « Vérifié » on the success tone', (tester) async {
    await _pump(tester,
        FixtureProfileRepository(me: meJson(verificationStatus: 'VERIFIED')));
    expect(_badgeColor(tester, 'Vérifié'), TekaColors.successForeground);
    expect(find.text('Action requise'), findsNothing);
  });

  testWidgets('returning from an edit screen refetches the account',
      (tester) async {
    final repo = FixtureProfileRepository();
    final router = await _pump(tester, repo);
    final calls = repo.meCalls;
    await tester.tap(find.byTooltip('Modifier mes informations'));
    await tester.pumpAndSettle();
    expect(find.text('ÉCRAN /profile/personal'), findsOneWidget);
    repo.me = meJson(firstName: 'Marie-Claire');
    router.pop();
    await tester.pumpAndSettle();
    expect(repo.meCalls, calls + 1);
    expect(find.text('Marie-Claire Kabila'), findsOneWidget);
  });

  testWidgets(
      'a saved shop or person (profile revision) and a verification change refetch the account in place',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    final container =
        ProviderScope.containerOf(tester.element(find.byType(ProfileScreen)));
    final calls = repo.meCalls;
    repo.me = meJson(communeName: 'Kenya');
    container.read(sellerRefreshProvider.notifier).profileChanged();
    await tester.pump();
    await tester.pump();
    expect(repo.meCalls, calls + 1);
    expect(find.text('Lubumbashi · Kenya'), findsOneWidget);
    expect(find.byType(ProfileSkeleton), findsNothing,
        reason: 'content kept while refetching');

    repo.me = meJson(verificationStatus: 'PENDING_REVIEW');
    container.read(sellerRefreshProvider.notifier).verificationChanged();
    await tester.pump();
    await tester.pump();
    // Badge + the verification tile's subtitle.
    expect(find.text('En attente de vérification'), findsNWidgets(2));
  });

  testWidgets(
      'logout asks first, then clears the session and returns to the login',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    await _reveal(tester, 'Se déconnecter');
    await tester.tap(find.text('Se déconnecter'));
    await tester.pumpAndSettle();
    expect(find.text('Se déconnecter ?'), findsOneWidget);
    await tester.tap(find.text('Annuler'));
    await tester.pumpAndSettle();
    expect(_auth.state.status, AuthStatus.authenticated);

    await tester.tap(find.text('Se déconnecter'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Se déconnecter'));
    await tester.pumpAndSettle();
    expect(_auth.state.status, AuthStatus.unauthenticated);
    expect(_auth.state.user, isNull);
    expect(find.text('ÉCRAN CONNEXION'), findsOneWidget);
  });

  testWidgets(
      'account isolation: a new session fetches its own account, nothing of the previous seller remains',
      (tester) async {
    final marie = FixtureProfileRepository();
    await _pump(tester, marie);
    expect(find.text('Boutique Marie'), findsOneWidget);

    final patrick = FixtureProfileRepository(
        me: meJson(
            id: 'user-patrick',
            firstName: 'Patrick',
            lastName: 'Kalonji',
            email: 'patrickk@test.com',
            businessName: 'Tech Patrick',
            cityId: 'city-kolwezi',
            cityName: 'Kolwezi',
            communeId: 'commune-dilala',
            communeName: 'Dilala',
            verificationStatus: 'REJECTED'));
    await _pump(tester, patrick);
    expect(find.text('Tech Patrick'), findsOneWidget);
    expect(find.text('Kolwezi · Dilala'), findsOneWidget);
    expect(find.text('Boutique Marie'), findsNothing);
    expect(find.text('marie@shop.cd'), findsNothing);
    expect(find.text('Lubumbashi · Kampemba'), findsNothing);
    await _reveal(tester, 'Action requise');
    expect(find.text('Action requise'), findsOneWidget);
  });

  group('responsive', () {
    for (final width in [320.0, 360.0, 390.0, 412.0]) {
      for (final scale in [1.0, 1.5]) {
        testWidgets('account fits $width at $scale×', (tester) async {
          final repo = FixtureProfileRepository(
              me: meJson(
                  businessName:
                      'Quincaillerie Générale de la Grande Avenue Kasavubu',
                  firstName: 'Marie-Claire-Antoinette',
                  lastName: 'Kabila Mwamba Ngoy',
                  email: 'marie.claire.antoinette@boutique-longue.cd',
                  verificationStatus: 'REJECTED'));
          await _pump(tester, repo, size: Size(width, 740), textScale: scale);
          expect(find.text('Vérification refusée'), findsOneWidget);
          await _reveal(tester, 'Action requise');
          expect(find.text('Action requise'), findsOneWidget);
          await _reveal(tester, 'Se déconnecter');
          expect(tester.takeException(), isNull);
        });
      }
    }
    for (final size in const [Size(600, 960), Size(1024, 768), Size(1280, 800)]) {
      testWidgets('tablet ${size.width.toInt()}×${size.height.toInt()}: readable column',
          (tester) async {
        await _pump(tester, FixtureProfileRepository(), size: size);
        final card = tester.getSize(find.byType(SellerIdentityCard));
        expect(card.width, lessThan(800));
        expect(tester.takeException(), isNull);
      });
    }
  });

  test('ProfileRepository reports every successful write to the refresh hook', () async {
    var changed = 0;
    final dio = Dio()
      ..interceptors.add(InterceptorsWrapper(onRequest: (o, h) => h.resolve(
          Response(requestOptions: o, statusCode: 200, data: {
            'success': true,
            'data': o.path == '/v1/users/profile' ? meJson() : {'id': 'x'},
          }))));
    final repo = ProfileRepository(dio, onChanged: () => changed++);
    await repo.updateProfile(firstName: 'Marie');
    await repo.updateSellerProfile(businessName: 'Boutique');
    expect(changed, 2);
  });

  test('AuthNotifier.updateUser merges non-null fields into the session user', () {
    final auth = FixtureAuthNotifier();
    auth.updateUser({'firstName': 'Marie-Claire', 'avatar': null, 'email': 'm@x.cd'});
    expect(auth.state.user!['firstName'], 'Marie-Claire');
    expect(auth.state.user!['email'], 'm@x.cd');
    expect(auth.state.user!['role'], 'SELLER');
    expect(auth.state.user!.containsKey('avatar'), isFalse);
  });
}
