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
import 'package:seller_mobile/features/earnings/presentation/screens/request_payout_screen.dart';

import '../../support/seller_dashboard_fixtures.dart';
import '../../support/seller_earnings_fixtures.dart';

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

Future<void> _tapSubmit(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Demander le virement'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Demander le virement'));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  testWidgets(
      'states the amount (whole available balance, no partial input) and prefills the saved destination',
      (tester) async {
    final repo = FixtureEarningsRepository(
      wallet: wallet(availableFc: 63000),
      saved: const SellerPayoutMethod(
          payoutMethod: 'AIRTEL_MONEY', payoutPhone: '+243990000001'),
    );
    await _pump(tester, repo);

    expect(find.text('Montant du virement'), findsOneWidget);
    expect(find.text('63.000 FC'), findsOneWidget);
    expect(find.textContaining('totalité de votre solde disponible'),
        findsOneWidget);
    expect(find.byType(TextFormField), findsOneWidget); // phone only
    expect(find.text('+243990000001'), findsOneWidget);
    expect(
        tester
            .widget<RadioGroup<String>>(find.byType(RadioGroup<String>))
            .groupValue,
        'AIRTEL_MONEY');
    expect(_submitButton(tester).enabled, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('invalid input is refused in French before anything is sent',
      (tester) async {
    final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 63000));
    await _pump(tester, repo);

    await _tapSubmit(tester);
    expect(find.text('Choisissez l’opérateur du numéro de réception.'),
        findsOneWidget);
    expect(find.text('Entrez le numéro Mobile Money qui recevra l’argent.'),
        findsOneWidget);
    expect(find.text('Confirmer la demande de virement'), findsNothing);

    await tester.tap(find.text('Orange Money'));
    await tester.enterText(find.byType(TextFormField), '0970000001');
    await _tapSubmit(tester);
    expect(
        find.text(
            'Entrez un numéro congolais au format +243 suivi de 9 chiffres.'),
        findsOneWidget);
    expect(find.text('Confirmer la demande de virement'), findsNothing);
    expect(repo.requested, isEmpty);
    expect(repo.savedDestinations, isEmpty);
  });

  testWidgets(
      'a valid request asks for one confirmation that repeats amount and full destination; « Annuler » sends nothing',
      (tester) async {
    final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 63000));
    await _pump(tester, repo);

    await tester.tap(find.text('M-Pesa (Vodacom)'));
    await tester.enterText(find.byType(TextFormField), '+243970000001');
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
    // Values kept.
    expect(find.text('+243970000001'), findsOneWidget);
  });

  testWidgets(
      'confirming saves the destination, sends exactly one request even on a double tap, then returns with a success message',
      (tester) async {
    final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 63000));
    await _pump(tester, repo);

    await tester.tap(find.text('M-Pesa (Vodacom)'));
    await tester.enterText(find.byType(TextFormField), '+243970000001');
    await _tapSubmit(tester);
    await tester.tap(find.text('Confirmer'));
    await tester.tap(find.text('Confirmer'), warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(repo.savedDestinations,
        [{'method': 'M_PESA', 'phone': '+243970000001'}]);
    expect(repo.requested, [{'method': 'M_PESA', 'phone': '+243970000001'}]);
    expect(find.text('ÉCRAN REVENUS'), findsOneWidget);
    expect(find.textContaining('Demande envoyée'), findsOneWidget);
    // The request moved money: wallet, earnings and payouts were all refetched.
    expect(repo.walletCalls, greaterThanOrEqualTo(2));
    expect(repo.earningsCalls, greaterThanOrEqualTo(2));
    expect(repo.payoutsCalls, greaterThanOrEqualTo(1));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'a stale balance (API 400) shows the API reason verbatim, keeps the values, refetches the balance and disables the button with the reason',
      (tester) async {
    final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 63000));
    await _pump(tester, repo);
    const apiMessage =
        'Le solde minimum pour un retrait est de 5.000 FC. Votre solde disponible est de 1.200 FC.';
    repo.nextRequestError = apiError('/v1/sellers/payouts', 400, apiMessage);
    // Meanwhile the server's balance dropped (a return reversed an earning).
    repo.walletRow = wallet(availableFc: 1200);

    await tester.tap(find.text('Orange Money'));
    await tester.enterText(find.byType(TextFormField), '+243890000001');
    final walletCalls = repo.walletCalls;
    await _tapSubmit(tester);
    await tester.tap(find.text('Confirmer'));
    await tester.pumpAndSettle();

    expect(find.text(apiMessage), findsOneWidget);
    expect(find.text('+243890000001'), findsOneWidget); // values preserved
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
    final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 63000));
    await _pump(tester, repo);
    const apiMessage =
        'Vous avez déjà une demande de retrait en cours. Veuillez attendre son traitement.';
    repo.nextRequestError = apiError('/v1/sellers/payouts', 409, apiMessage);
    repo.payouts = [payout(id: 'p-web', status: 'REQUESTED')];

    await tester.tap(find.text('M-Pesa (Vodacom)'));
    await tester.enterText(find.byType(TextFormField), '+243970000001');
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

  testWidgets('below the minimum on entry: disabled with the API minimum stated',
      (tester) async {
    final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 4000));
    await _pump(tester, repo);
    expect(_submitButton(tester).enabled, isFalse);
    expect(
        find.text(
            'Solde minimum pour un virement : 5.000 FC. Votre solde disponible est de 4.000 FC.'),
        findsOneWidget);
  });

  testWidgets('while the request is in flight the form is locked and cannot be sent twice',
      (tester) async {
    final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 63000));
    await _pump(tester, repo);
    await tester.tap(find.text('M-Pesa (Vodacom)'));
    await tester.enterText(find.byType(TextFormField), '+243970000001');
    final gate = Completer<void>();
    repo.hold = gate.future;
    await _tapSubmit(tester);
    await tester.tap(find.text('Confirmer'));
    // The busy spinner animates, so settle by time: dialog gone, request held.
    // The busy spinner never settles, so pump the dialog's exit by time
    // (one frame starts the ticker, the next completes it).
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Confirmer la demande de virement'), findsNothing);
    expect(find.text('Envoi en cours…'), findsOneWidget);
    expect(find.text('Demander le virement'), findsNothing);
    expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField))
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
      testWidgets('form fits $width at $scale×', (tester) async {
        final repo = FixtureEarningsRepository(
          wallet: wallet(availableFc: 12345678),
          saved: const SellerPayoutMethod(
              payoutMethod: 'M_PESA', payoutPhone: '+243970000001'),
        );
        await _pump(tester, repo, size: Size(width, 740), textScale: scale);
        await _tapSubmit(tester);
        expect(find.text('Confirmer la demande de virement'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('tablet 1024×768: the form stays in a readable column',
      (tester) async {
    final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 63000));
    await _pump(tester, repo, size: const Size(1024, 768));
    final field = tester.getSize(find.byType(TextFormField));
    expect(field.width, lessThan(800));
    expect(tester.takeException(), isNull);
  });
}
