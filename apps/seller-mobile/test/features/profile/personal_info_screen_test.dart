import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/profile/data/profile_repository.dart';
import 'package:seller_mobile/features/profile/presentation/screens/personal_info_screen.dart';

import '../../support/seller_dashboard_fixtures.dart';
import '../../support/seller_profile_fixtures.dart';

late FixtureAuthNotifier _auth;

Future<void> _pump(WidgetTester tester, FixtureProfileRepository repo,
    {Size size = const Size(390, 844), double textScale = 1}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  _auth = FixtureAuthNotifier();
  await tester.pumpWidget(
    ProviderScope(
      key: ValueKey(repo),
      overrides: [
        profileRepositoryProvider.overrideWithValue(repo),
        authProvider.overrideWith((ref) => _auth),
      ],
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: const PersonalInfoScreen(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

Finder _field(String label) => find.ancestor(
    of: find.text(label), matching: find.byType(TextFormField));

Future<void> _save(WidgetTester tester) async {
  await tester.tap(find.text('Enregistrer'));
  await tester.pump();
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('prefills the person and the login email from the API',
      (tester) async {
    await _pump(tester, FixtureProfileRepository());
    expect(find.text('Marie'), findsOneWidget);
    expect(find.text('Kabila'), findsOneWidget);
    expect(find.text('marie@shop.cd'), findsOneWidget);
    expect(find.textContaining('sert à votre connexion'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('loading is a skeleton; a failed load is a scoped error with retry',
      (tester) async {
    final gate = Completer<void>();
    final repo = FixtureProfileRepository()..hold = gate.future;
    await _pump(tester, repo);
    expect(find.byType(FormSkeleton), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    gate.complete();
    await tester.pump();
    await tester.pump();
    expect(find.text('Marie'), findsOneWidget);

    final failing = FixtureProfileRepository()..failMe = true;
    await _pump(tester, failing);
    expect(find.text('Informations indisponibles'), findsOneWidget);
    failing.failMe = false;
    await tester.tap(find.text('Réessayer'));
    await tester.pump();
    await tester.pump();
    await tester.pump();
    expect(find.text('Marie'), findsOneWidget);
  });

  testWidgets('invalid input is refused in French with the API\'s own words; nothing is sent',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    await tester.enterText(_field('Prénom'), 'M');
    await tester.enterText(_field('Email'), 'marie@');
    await _save(tester);
    expect(find.text('Le prénom doit contenir au moins 2 caractères'), findsOneWidget);
    expect(find.text('Adresse email invalide'), findsOneWidget);
    expect(repo.profileUpdates, isEmpty);
  });

  testWidgets('saving sends only the changed fields, then the session user follows the API\'s answer',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    await tester.enterText(_field('Prénom'), 'Marie-Claire');
    await _save(tester);
    expect(repo.profileUpdates, [{'firstName': 'Marie-Claire'}]);
    expect(find.text('Informations enregistrées'), findsOneWidget);
    expect(_auth.state.user!['firstName'], 'Marie-Claire');
    expect(_auth.state.user!['lastName'], 'Kabila');
  });

  testWidgets('an unchanged form says so and sends nothing', (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    await _save(tester);
    expect(repo.profileUpdates, isEmpty);
    expect(find.text('Aucune modification à enregistrer'), findsOneWidget);
  });

  testWidgets('an email change is sent as typed and the message says to log in with it',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    await tester.enterText(_field('Email'), 'Marie.Kabila@Shop.cd');
    await _save(tester);
    expect(repo.profileUpdates, [{'email': 'Marie.Kabila@Shop.cd'}]);
    // The API normalised it; the screen shows the API's value.
    expect(find.text('marie.kabila@shop.cd'), findsOneWidget);
    expect(find.textContaining('nouvel email sert désormais'), findsOneWidget);
    expect(_auth.state.user!['email'], 'marie.kabila@shop.cd');
  });

  testWidgets('an API refusal is shown verbatim and the typed values are kept',
      (tester) async {
    final repo = FixtureProfileRepository()
      ..nextUpdateError =
          apiError('/v1/users/profile', 409, 'Cette adresse email est déjà utilisée');
    await _pump(tester, repo);
    await tester.enterText(_field('Email'), 'autre@shop.cd');
    await _save(tester);
    expect(find.text('Cette adresse email est déjà utilisée'), findsOneWidget);
    expect(find.text('autre@shop.cd'), findsOneWidget);
    expect(_auth.state.user!['email'], isNot('autre@shop.cd'));
  });

  testWidgets('while saving the form is locked and a second tap sends nothing',
      (tester) async {
    final repo = FixtureProfileRepository();
    await _pump(tester, repo);
    await tester.enterText(_field('Nom'), 'Kabila Mwamba');
    final gate = Completer<void>();
    repo.hold = gate.future;
    await tester.tap(find.text('Enregistrer'));
    await tester.pump();
    expect(find.text('Enregistrement…'), findsOneWidget);
    expect(tester.widget<TextFormField>(_field('Nom')).enabled, isFalse);
    await tester.tap(find.text('Enregistrement…'), warnIfMissed: false);
    await tester.pump();
    gate.complete();
    await tester.pump();
    await tester.pump();
    expect(repo.profileUpdates.length, 1);
  });

  for (final width in [320.0, 360.0, 390.0, 412.0]) {
    for (final scale in [1.0, 1.5]) {
      testWidgets('form fits $width at $scale×', (tester) async {
        await _pump(tester, FixtureProfileRepository(),
            size: Size(width, 740), textScale: scale);
        await tester.enterText(_field('Prénom'), 'M');
        await _save(tester);
        expect(find.text('Le prénom doit contenir au moins 2 caractères'),
            findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('tablet 1024×768: the form stays in a readable column', (tester) async {
    await _pump(tester, FixtureProfileRepository(), size: const Size(1024, 768));
    expect(tester.getSize(_field('Email')).width, lessThan(800));
    expect(tester.takeException(), isNull);
  });
}
