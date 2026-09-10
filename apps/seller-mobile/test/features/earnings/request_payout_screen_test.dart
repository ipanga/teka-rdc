import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/earnings/data/earnings_repository.dart';
import 'package:seller_mobile/features/earnings/data/models/earning_model.dart';
import 'package:seller_mobile/features/earnings/presentation/payout_status.dart';
import 'package:seller_mobile/features/earnings/presentation/screens/request_payout_screen.dart';

import '../../support/seller_dashboard_fixtures.dart';
import '../../support/seller_earnings_fixtures.dart';

const _savedAirtel = SellerPayoutMethod(
    payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243990000001');
const _savedMpesa =
    SellerPayoutMethod(payoutMethod: 'M_PESA', payoutPhone: '+243970000001');

Future<GoRouter> _pump(
  WidgetTester tester,
  FixtureEarningsRepository repo, {
  Size size = const Size(390, 844),
  double textScale = 1,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final router = GoRouter(routes: [
    GoRoute(
        path: '/',
        builder: (_, __) => const Scaffold(body: Text('ÉCRAN REVENUS'))),
    GoRoute(
        path: '/earnings/request-payout',
        builder: (_, __) => const RequestPayoutScreen()),
    GoRoute(
        path: '/earnings/payouts/:id',
        builder: (_, s) =>
            Scaffold(body: Text('DÉTAIL ${s.pathParameters['id']}'))),
  ]);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        earningsRepositoryProvider.overrideWithValue(repo),
        authProvider.overrideWith((ref) => FixtureAuthNotifier()),
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
  router.push('/earnings/request-payout');
  await tester.pumpAndSettle();
  return router;
}

ElevatedButton _submitButton(WidgetTester tester) =>
    tester.widget<ElevatedButton>(find.ancestor(
        of: find.text('Demander le virement'),
        matching: find.byType(ElevatedButton)));

OutlinedButton _saveButton(WidgetTester tester) =>
    tester.widget<OutlinedButton>(find.ancestor(
        of: find.text('Enregistrer la destination'),
        matching: find.byType(OutlinedButton)));

Future<void> _tapSubmit(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Demander le virement'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Demander le virement'));
  await tester.pumpAndSettle();
}

Future<void> _tapSave(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Enregistrer la destination'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Enregistrer la destination'));
  await tester.pumpAndSettle();
}

Future<void> _openEditor(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Modifier la destination'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Modifier la destination'));
  await tester.pumpAndSettle();
}

final _phoneField = find.byKey(payoutPhoneFieldKey);
final _passwordField = find.byKey(payoutPasswordFieldKey);

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  testWidgets(
      'states the amount (whole available balance, no partial input) and shows the saved destination read-only',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedAirtel);
    await _pump(tester, repo);

    expect(find.text('Montant du virement'), findsOneWidget);
    expect(find.text('63.000 FC'), findsOneWidget);
    expect(find.textContaining('totalité de votre solde disponible'),
        findsOneWidget);
    // Read-only: operator label + full number, no field, no picker.
    expect(find.text('Airtel Money'), findsOneWidget);
    expect(find.text('+243990000001'), findsOneWidget);
    expect(find.byType(TextFormField), findsNothing);
    expect(find.byType(RadioGroup<String>), findsNothing);
    expect(find.text('Modifier la destination'), findsOneWidget);
    expect(_submitButton(tester).enabled, isTrue);
    expect(repo.payoutMethodCalls, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      '« Modifier la destination » opens the editor prefilled, with a password field and the security notice; Save is gated on all three fields',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedAirtel);
    await _pump(tester, repo);
    await _openEditor(tester);

    expect(find.byType(TextFormField), findsNWidgets(2)); // phone + password
    expect(
        tester
            .widget<RadioGroup<String>>(find.byType(RadioGroup<String>))
            .groupValue,
        'AIRTEL_MONEY');
    expect(find.text('+243990000001'), findsOneWidget); // prefilled
    expect(find.text(payoutDestinationPasswordNotice), findsOneWidget);
    expect(find.text('Mot de passe actuel'), findsOneWidget);
    expect(
        tester
            .widget<EditableText>(find.descendant(
                of: _passwordField, matching: find.byType(EditableText)))
            .obscureText,
        isTrue);
    // While editing, the request button is off: save first.
    expect(_submitButton(tester).enabled, isFalse);
    expect(find.text('Enregistrez d’abord la destination pour demander un virement.'),
        findsOneWidget);

    // Operator + number set, no password → still gated, nothing sent.
    expect(_saveButton(tester).enabled, isFalse);
    await _tapSave(tester);
    expect(repo.savedDestinations, isEmpty);

    // The eye toggle reveals the password.
    await tester.tap(find.byTooltip('Afficher le mot de passe'));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<EditableText>(find.descendant(
                of: _passwordField, matching: find.byType(EditableText)))
            .obscureText,
        isFalse);

    // « Annuler » closes the editor, sends nothing and keeps the saved row.
    await tester.tap(find.text('Annuler la modification'));
    await tester.pumpAndSettle();
    expect(find.byType(TextFormField), findsNothing);
    expect(find.text('Airtel Money'), findsOneWidget);
    expect(repo.savedDestinations, isEmpty);
    expect(_submitButton(tester).enabled, isTrue);
  });

  testWidgets(
      'invalid number is refused in French before anything is sent, even with a password',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedAirtel);
    await _pump(tester, repo);
    await _openEditor(tester);

    await tester.tap(find.text('Orange Money'));
    await tester.enterText(_phoneField, '0970000001');
    await tester.enterText(_passwordField, 'Secret123');
    await _tapSave(tester);
    expect(
        find.text(
            'Entrez un numéro congolais au format +243 suivi de 9 chiffres.'),
        findsOneWidget);
    expect(repo.savedDestinations, isEmpty);
    expect(repo.requested, isEmpty);
  });

  testWidgets(
      'saving with the password calls PATCH exactly once (password present, never retained), shows the availability date, collapses the editor and clears the password',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedAirtel);
    // The widget reads the REAL clock for the cooling-off check
    // (request_payout_screen.dart:267), so a hard-coded fixture date made this
    // test flip from pass to fail the moment wall-clock time passed it — it
    // began failing in CI on 2026-09-10 at 14:05 UTC. Anchor the fixture to
    // `now` instead, the pattern the rest of this file already uses, so the
    // cooling-off is always genuinely in force while the test runs.
    final changedAt = DateTime.now();
    final availableAt = changedAt.add(const Duration(hours: 24));
    repo.now = () => changedAt;
    await _pump(tester, repo);
    await _openEditor(tester);

    await tester.tap(find.text('M-Pesa (Vodacom)'));
    await tester.enterText(_phoneField, '+243970000001');
    await tester.enterText(_passwordField, 'Secret123');
    await tester.pump();
    expect(_saveButton(tester).enabled, isTrue);
    await _tapSave(tester);

    expect(repo.savedDestinations, [
      {'method': 'M_PESA', 'phone': '+243970000001', 'withPassword': true},
    ]);
    // The fixture recorded only the presence of a password.
    expect(repo.savedDestinations.single.values, isNot(contains('Secret123')));
    expect(
        find.text(
            'Destination enregistrée. Les retraits seront possibles à partir du '
            '${payoutAvailabilityLabel(availableAt)}'),
        findsOneWidget);
    // Editor collapsed onto the new destination; nothing was requested.
    expect(find.byType(TextFormField), findsNothing);
    expect(find.text('M-Pesa (Vodacom)'), findsOneWidget);
    expect(find.text('+243970000001'), findsOneWidget);
    expect(repo.requested, isEmpty);
    // The cooling-off now blocks the request button with its date.
    expect(_submitButton(tester).enabled, isFalse);
    expect(
        find.text(
            'Destination modifiée récemment : retraits possibles à partir du '
            '${payoutAvailabilityLabel(availableAt)}'),
        findsOneWidget);
    // Reopening shows an EMPTY password field.
    await _openEditor(tester);
    expect(tester.widget<TextFormField>(_passwordField).controller!.text, '');
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'a wrong password (API 403) shows « Mot de passe invalide. » verbatim, keeps the editor open and does not log the seller out',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedAirtel);
    repo.nextSaveError =
        apiError('/v1/sellers/payout-method', 403, 'Mot de passe invalide.');
    await _pump(tester, repo);
    await _openEditor(tester);

    await tester.tap(find.text('M-Pesa (Vodacom)'));
    await tester.enterText(_phoneField, '+243970000001');
    await tester.enterText(_passwordField, 'wrong');
    await _tapSave(tester);

    expect(find.text('Mot de passe invalide.'), findsOneWidget);
    expect(find.byType(TextFormField), findsNWidgets(2)); // still editing
    expect(find.text('+243970000001'), findsOneWidget); // values kept
    expect(repo.savedDestinations.length, 1);
    expect(find.text('Demande de virement'), findsOneWidget); // same screen
    expect(find.text('ÉCRAN REVENUS'), findsNothing);
  });

  testWidgets(
      'too many attempts (API 429) shows the French reason verbatim',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedAirtel);
    const apiMessage =
        'Trop de tentatives. Veuillez réessayer dans 45 minutes.';
    repo.nextSaveError =
        apiError('/v1/sellers/payout-method', 429, apiMessage);
    await _pump(tester, repo);
    await _openEditor(tester);
    await tester.tap(find.text('Orange Money'));
    await tester.enterText(_phoneField, '+243890000001');
    await tester.enterText(_passwordField, 'Secret123');
    await _tapSave(tester);
    expect(find.text(apiMessage), findsOneWidget);
  });

  testWidgets(
      'with no saved destination the editor is open from the start, the request button is off, and saving needs the password',
      (tester) async {
    final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 63000));
    await _pump(tester, repo);

    expect(find.byType(TextFormField), findsNWidgets(2));
    expect(find.text('Modifier la destination'), findsNothing);
    expect(find.text('Annuler la modification'), findsNothing); // nothing to fall back to
    expect(_submitButton(tester).enabled, isFalse);
    expect(_saveButton(tester).enabled, isFalse);

    await tester.tap(find.text('M-Pesa (Vodacom)'));
    await tester.enterText(_phoneField, '+243970000001');
    expect(_saveButton(tester).enabled, isFalse); // password missing
    await tester.enterText(_passwordField, 'Secret123');
    await _tapSave(tester);

    expect(repo.savedDestinations, [
      {'method': 'M_PESA', 'phone': '+243970000001', 'withPassword': true},
    ]);
    expect(find.byType(TextFormField), findsNothing);
    expect(find.text('M-Pesa (Vodacom)'), findsOneWidget);
    expect(find.textContaining('Destination enregistrée.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'a valid request asks for one confirmation that repeats amount and the SAVED destination; « Annuler » sends nothing',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedMpesa);
    await _pump(tester, repo);
    await _tapSubmit(tester);

    expect(find.text('Confirmer la demande de virement'), findsOneWidget);
    expect(find.text('63.000 FC'), findsNWidgets(2)); // screen + dialog
    expect(find.text('M-Pesa (Vodacom) · +243970000001'), findsOneWidget);
    expect(find.textContaining('ne peut pas être annulé'), findsOneWidget);

    await tester.tap(find.text('Annuler'));
    await tester.pumpAndSettle();
    expect(find.text('Confirmer la demande de virement'), findsNothing);
    expect(repo.requested, isEmpty);
    expect(repo.savedDestinations, isEmpty);
    expect(find.text('+243970000001'), findsOneWidget);
  });

  testWidgets(
      'confirming sends exactly one POST with an EMPTY body even on a double tap (no PATCH), then returns with a success message',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedMpesa);
    await _pump(tester, repo);

    await _tapSubmit(tester);
    await tester.tap(find.text('Confirmer'));
    await tester.tap(find.text('Confirmer'), warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(repo.requested, [<String, dynamic>{}]);
    expect(repo.savedDestinations, isEmpty);
    expect(find.text('ÉCRAN REVENUS'), findsOneWidget);
    expect(find.textContaining('Demande envoyée'), findsOneWidget);
    // The request moved money: wallet, earnings and payouts were all refetched.
    expect(repo.walletCalls, greaterThanOrEqualTo(2));
    expect(repo.earningsCalls, greaterThanOrEqualTo(2));
    expect(repo.payoutsCalls, greaterThanOrEqualTo(1));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'a stale balance (API 400) shows the API reason verbatim, refetches the balance and disables the button with the reason',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedAirtel);
    await _pump(tester, repo);
    const apiMessage =
        'Le solde minimum pour un retrait est de 5.000 FC. Votre solde disponible est de 1.200 FC.';
    repo.nextRequestError = apiError('/v1/sellers/payouts', 400, apiMessage);
    // Meanwhile the server's balance dropped (a return reversed an earning).
    repo.walletRow = wallet(availableFc: 1200);

    final walletCalls = repo.walletCalls;
    await _tapSubmit(tester);
    await tester.tap(find.text('Confirmer'));
    await tester.pumpAndSettle();

    expect(find.text(apiMessage), findsOneWidget);
    expect(find.text('+243990000001'), findsOneWidget); // destination kept
    expect(repo.walletCalls, walletCalls + 1); // balance refetched
    expect(repo.earningsCalls, greaterThanOrEqualTo(2)); // and the earnings
    expect(find.text('1.200 FC'), findsOneWidget); // authoritative amount
    expect(_submitButton(tester).enabled, isFalse);
    expect(find.textContaining('Solde minimum pour un virement : 5.000 FC'),
        findsOneWidget);
    expect(find.text('ÉCRAN REVENUS'), findsNothing); // stayed on the form
  });

  testWidgets(
      'a payout opened elsewhere (API 409) shows the reason and links to the open payout',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedMpesa);
    await _pump(tester, repo);
    const apiMessage =
        'Vous avez déjà une demande de retrait en cours. Veuillez attendre son traitement.';
    repo.nextRequestError = apiError('/v1/sellers/payouts', 409, apiMessage);
    repo.payouts = [payout(id: 'p-web', status: 'REQUESTED')];

    await _tapSubmit(tester);
    await tester.tap(find.text('Confirmer'));
    await tester.pumpAndSettle();

    expect(find.text(apiMessage), findsOneWidget);
    expect(_submitButton(tester).enabled, isFalse);
    await tester.ensureVisible(find.text('Voir le virement en cours'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Voir le virement en cours'));
    await tester.pumpAndSettle();
    expect(find.text('DÉTAIL p-web'), findsOneWidget);
  });

  testWidgets(
      'a cooling-off refusal (API 409 after a change made elsewhere) shows the reason verbatim and refetches the destination, whose date then blocks the button',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedMpesa);
    await _pump(tester, repo);
    const apiMessage =
        'Votre destination de retrait a été modifiée récemment. Par sécurité, les retraits sont à nouveau possibles à partir du 10 septembre 2026 à 14:05.';
    repo.nextRequestError = apiError('/v1/sellers/payouts', 409, apiMessage);
    // Seller-web changed the destination a moment ago.
    final availableAt = DateTime.now().add(const Duration(hours: 23));
    repo.saved = SellerPayoutMethod(
        payoutMethod: 'ORANGE_MONEY',
        payoutPhone: '+243890000001',
        changedAt: DateTime.now(),
        payoutsAvailableAt: availableAt);

    await _tapSubmit(tester);
    await tester.tap(find.text('Confirmer'));
    await tester.pumpAndSettle();

    expect(find.text(apiMessage), findsOneWidget);
    expect(repo.requested.length, 1);
    expect(_submitButton(tester).enabled, isFalse);
    expect(
        find.text(
            'Destination modifiée récemment : retraits possibles à partir du ${payoutAvailabilityLabel(availableAt)}'),
        findsOneWidget);
    // The read-only card now shows the destination saved elsewhere.
    expect(find.text('Orange Money'), findsOneWidget);
    expect(find.text('+243890000001'), findsOneWidget);
  });

  testWidgets(
      'inside the cooling-off the request button is off and names the reopen date',
      (tester) async {
    final future = DateTime.now().add(const Duration(hours: 5));
    final repo = FixtureEarningsRepository(
      wallet: wallet(availableFc: 63000),
      saved: SellerPayoutMethod(
          payoutMethod: 'M_PESA',
          payoutPhone: '+243970000001',
          changedAt: future.subtract(const Duration(hours: 24)),
          payoutsAvailableAt: future),
    );
    await _pump(tester, repo);
    expect(_submitButton(tester).enabled, isFalse);
    expect(
        find.text(
            'Destination modifiée récemment : retraits possibles à partir du ${payoutAvailabilityLabel(future)}'),
        findsOneWidget);
    await _tapSubmit(tester);
    expect(find.text('Confirmer la demande de virement'), findsNothing);
    expect(repo.requested, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'once the cooling-off has passed the request button is on again',
      (tester) async {
    final past = DateTime.now().subtract(const Duration(minutes: 1));
    final repo = FixtureEarningsRepository(
      wallet: wallet(availableFc: 63000),
      saved: SellerPayoutMethod(
          payoutMethod: 'M_PESA',
          payoutPhone: '+243970000001',
          changedAt: past.subtract(const Duration(hours: 24)),
          payoutsAvailableAt: past),
    );
    await _pump(tester, repo);
    expect(_submitButton(tester).enabled, isTrue);
    expect(find.textContaining('Destination modifiée récemment'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('below the minimum on entry: disabled with the API minimum stated',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 4000), saved: _savedMpesa);
    await _pump(tester, repo);
    expect(_submitButton(tester).enabled, isFalse);
    expect(
        find.text(
            'Solde minimum pour un virement : 5.000 FC. Votre solde disponible est de 4.000 FC.'),
        findsOneWidget);
  });

  testWidgets(
      'the saved destination failing to load shows a retry instead of the editor',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedMpesa);
    // Only the destination read fails: the wallet still loads, so the
    // blocker under test is the unknown destination and nothing else.
    repo.failPayoutMethodOnce = true;
    await _pump(tester, repo);
    expect(find.text('La destination enregistrée n’a pas pu être chargée.'),
        findsOneWidget);
    expect(find.byType(TextFormField), findsNothing);
    expect(_submitButton(tester).enabled, isFalse);

    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.text('M-Pesa (Vodacom)'), findsOneWidget);
    expect(_submitButton(tester).enabled, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('while the request is in flight the screen is locked and cannot be sent twice',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedMpesa);
    await _pump(tester, repo);
    final gate = Completer<void>();
    repo.hold = gate.future;
    await _tapSubmit(tester);
    await tester.tap(find.text('Confirmer'));
    // The busy spinner never settles, so pump the dialog's exit by time
    // (one frame starts the ticker, the next completes it).
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Confirmer la demande de virement'), findsNothing);
    expect(find.text('Envoi en cours…'), findsOneWidget);
    expect(find.text('Demander le virement'), findsNothing);
    // The destination cannot be edited under an in-flight request.
    expect(
        tester
            .widget<TextButton>(find.ancestor(
                of: find.text('Modifier la destination'),
                matching: find.byType(TextButton)))
            .enabled,
        isFalse);
    await tester.tap(find.text('Envoi en cours…'), warnIfMissed: false);
    await tester.pump();
    expect(find.text('Confirmer la demande de virement'), findsNothing);
    gate.complete();
    await tester.pumpAndSettle();
    expect(repo.requested.length, 1);
    expect(find.text('ÉCRAN REVENUS'), findsOneWidget);
  });

  for (final width in [320.0, 360.0, 412.0]) {
    for (final scale in [1.0, 1.5]) {
      testWidgets('form fits $width at $scale× (read-only + editor)', (tester) async {
        final repo = FixtureEarningsRepository(
          wallet: wallet(availableFc: 12345678),
          saved: _savedMpesa,
        );
        await _pump(tester, repo, size: Size(width, 740), textScale: scale);
        await _tapSubmit(tester);
        expect(find.text('Confirmer la demande de virement'), findsOneWidget);
        await tester.tap(find.text('Annuler'));
        await tester.pumpAndSettle();
        await _openEditor(tester);
        expect(find.byType(TextFormField), findsNWidgets(2));
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('tablet 1024×768: the form stays in a readable column',
      (tester) async {
    final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 63000), saved: _savedMpesa);
    await _pump(tester, repo, size: const Size(1024, 768));
    await _openEditor(tester);
    final field = tester.getSize(_phoneField);
    expect(field.width, lessThan(800));
    expect(tester.takeException(), isNull);
  });
}
