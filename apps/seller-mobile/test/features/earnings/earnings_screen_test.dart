import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/core/theme/teka_colors.dart';
import 'package:seller_mobile/core/widgets/seller_list_state.dart';
import 'package:seller_mobile/core/widgets/seller_status_badge.dart';
import 'package:seller_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:seller_mobile/features/earnings/data/earnings_repository.dart';
import 'package:seller_mobile/features/earnings/presentation/screens/earnings_screen.dart';
import 'package:seller_mobile/features/earnings/presentation/widgets/wallet_card.dart';

import '../../support/seller_dashboard_fixtures.dart';
import '../../support/seller_earnings_fixtures.dart';

Future<void> _pump(
  WidgetTester tester,
  FixtureEarningsRepository repo, {
  Size size = const Size(390, 844),
  double textScale = 1,
  int initialTab = 0,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final router = GoRouter(routes: [
    GoRoute(
        path: '/',
        builder: (_, __) => EarningsScreen(initialTab: initialTab)),
    GoRoute(
        path: '/earnings/request-payout',
        builder: (_, __) =>
            const Scaffold(body: Text('ÉCRAN DEMANDE DE VIREMENT'))),
    GoRoute(
        path: '/earnings/payouts/:id',
        builder: (_, s) =>
            Scaffold(body: Text('DÉTAIL ${s.pathParameters['id']}'))),
    GoRoute(
        path: '/orders',
        builder: (_, __) => const Scaffold(body: Text('ÉCRAN COMMANDES'))),
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
  await tester.pumpAndSettle();
}

Future<void> _reveal(WidgetTester tester, String text) async {
  await tester.dragUntilVisible(
      find.text(text), find.byType(ListView).last, const Offset(0, -120));
  await tester.pumpAndSettle();
}

Color _badgeColor(WidgetTester tester, String label) {
  final text = find.text(label);
  if (text.evaluate().isEmpty) {
    fail('no badge « $label » — texts on screen: ${find.byType(Text).evaluate().map((e) => (e.widget as Text).data).whereType<String>().toList()}');
  }
  return tester
      .widget<SellerStatusBadge>(find.ancestor(
          of: text, matching: find.byType(SellerStatusBadge)))
      .color;
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  group('wallet hierarchy', () {
    testWidgets(
        'available balance is the hero, pending / gross / commission / net are labelled and formatted « 9.350 FC »',
        (tester) async {
      final repo = FixtureEarningsRepository(
        wallet: wallet(
            availableFc: 63000,
            pendingFc: 9350,
            grossFc: 250000,
            commissionFc: 25000),
        earnings: [earning()],
      );
      await _pump(tester, repo);

      expect(find.text('Solde disponible'), findsOneWidget);
      expect(find.text('63.000 FC'), findsOneWidget);
      expect(find.text('9.350 FC en attente'), findsOneWidget);
      expect(find.textContaining('fenêtre de retour de 2 jours'), findsOneWidget);
      expect(find.text('Ventes livrées (montant brut)'), findsOneWidget);
      expect(find.text('250.000 FC'), findsOneWidget);
      expect(find.text('Commission Teka prélevée'), findsOneWidget);
      expect(find.text('− 25.000 FC'), findsOneWidget);
      expect(find.text('Vos gains nets (depuis le début)'), findsOneWidget);
      expect(find.text('225.000 FC'), findsOneWidget);
      // The misleading « Revenus totaux » (gross) label is gone; CDF never.
      expect(find.text('Revenus totaux'), findsNothing);
      expect(find.textContaining('CDF'), findsNothing);
      // The hero is the largest money figure on the screen.
      final hero = tester.widget<Text>(find.text('63.000 FC'));
      final line = tester.widget<Text>(find.text('250.000 FC'));
      expect(hero.style!.fontSize!, greaterThan(line.style!.fontSize!));
      expect(hero.style!.color, TekaColors.foreground);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
        'an open payout is shown as reserved (« virement en cours ») with its own amount, distinct from the available balance',
        (tester) async {
      final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 1200),
        payouts: [payout(id: 'p-open', amountFc: 63000, status: 'APPROVED')],
      );
      await _pump(tester, repo);

      expect(find.text('1.200 FC'), findsOneWidget);
      expect(find.text('63.000 FC · virement en cours'), findsOneWidget);
      expect(
          _badgeColor(tester, '63.000 FC · virement en cours'), TekaColors.infoForeground);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a failed wallet request shows a scoped error with retry, never « 0 FC »',
        (tester) async {
      final repo = FixtureEarningsRepository(wallet: wallet())
        ..failWallet = true;
      await _pump(tester, repo);

      expect(find.text('Solde indisponible'), findsOneWidget);
      expect(find.text('0 FC'), findsNothing);
      expect(find.text('Demander un virement'), findsNothing);

      repo.failWallet = false;
      await tester.tap(find.text('Réessayer').first);
      await tester.pump();
      await tester.pump();
      expect(find.text('Solde disponible'), findsOneWidget);
      expect(find.text('63.000 FC'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the summary is a static skeleton (no spinner) while the wallet loads',
        (tester) async {
      final gate = Completer<void>();
      final repo = FixtureEarningsRepository(wallet: wallet(), earnings: [earning()])
        ..hold = gate.future;
      await _pump(tester, repo);
      expect(find.byType(WalletSummarySkeleton), findsOneWidget);
      expect(find.byType(SellerListLoading), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('0 FC'), findsNothing);
      gate.complete();
      await tester.pump();
      await tester.pump();
      expect(find.byType(WalletSummarySkeleton), findsNothing);
      expect(find.text('63.000 FC'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('payout eligibility', () {
    testWidgets('balance ≥ 5.000 FC and no open payout: the request button is live',
        (tester) async {
      final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 5000));
      await _pump(tester, repo);

      final button = tester.widget<ElevatedButton>(find.ancestor(
          of: find.text('Demander un virement'),
          matching: find.byType(ElevatedButton)));
      expect(button.enabled, isTrue);
      expect(find.textContaining('Solde minimum'), findsNothing);

      await tester.tap(find.text('Demander un virement'));
      await tester.pumpAndSettle();
      expect(find.text('ÉCRAN DEMANDE DE VIREMENT'), findsOneWidget);
    });

    testWidgets('below the minimum: disabled with the minimum stated', (tester) async {
      final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 4999));
      await _pump(tester, repo);

      final button = tester.widget<ElevatedButton>(find.ancestor(
          of: find.text('Demander un virement'),
          matching: find.byType(ElevatedButton)));
      expect(button.enabled, isFalse);
      expect(find.text('Solde minimum pour un virement : 5.000 FC.'),
          findsOneWidget);
    });

    testWidgets(
        'an open payout blocks a new request and links to it (no invented seller action)',
        (tester) async {
      final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 80000),
        payouts: [payout(id: 'p-open', status: 'PROCESSING')],
      );
      await _pump(tester, repo);

      final button = tester.widget<ElevatedButton>(find.ancestor(
          of: find.text('Demander un virement'),
          matching: find.byType(ElevatedButton)));
      expect(button.enabled, isFalse);
      expect(find.textContaining('déjà en cours'), findsOneWidget);
      await tester.tap(find.text('Voir le virement en cours'));
      await tester.pumpAndSettle();
      expect(find.text('DÉTAIL p-open'), findsOneWidget);
    });
  });

  group('lists', () {
    testWidgets(
        'an earning row: net amount strong in the foreground colour, gross − commission (rate) muted, state chip on a semantic tone',
        (tester) async {
      final repo = FixtureEarningsRepository(
        wallet: wallet(),
        earnings: [
          earning(id: 'e1', grossFc: 50000, commissionFc: 4125, rate: '0.0825'),
          earning(id: 'e2', orderNumber: 'TK-2', state: 'RESERVED'),
          earning(id: 'e3', orderNumber: 'TK-3', state: 'HELD'),
        ],
      );
      await _pump(tester, repo);

      expect(find.text('Commande TK-20260901-000210'), findsOneWidget);
      expect(find.text('45.875 FC'), findsOneWidget);
      expect(find.text('Vente 50.000 FC − commission 4.125 FC (8,25 %)'),
          findsOneWidget);
      final net = tester.widget<Text>(find.text('45.875 FC'));
      expect(net.style!.color, TekaColors.foreground);
      expect(net.style!.fontWeight, FontWeight.w700);
      expect(_badgeColor(tester, 'Disponible'), TekaColors.successForeground);
      await _reveal(tester, 'Réservé (virement en cours)');
      expect(_badgeColor(tester, 'Réservé (virement en cours)'),
          TekaColors.infoForeground);
      await _reveal(tester, 'En attente (retour possible)');
      expect(_badgeColor(tester, 'En attente (retour possible)'),
          TekaColors.warningForeground);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
        'payout rows: status labels never call an approval a payment, the number is masked, tap opens the detail',
        (tester) async {
      final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 0),
        payouts: [
          payout(id: 'p1', status: 'REQUESTED', amountFc: 63000),
          payout(id: 'p2', status: 'APPROVED', amountFc: 20000),
          payout(id: 'p3', status: 'COMPLETED', amountFc: 15000, reference: 'MP-1'),
          payout(id: 'p4', status: 'REJECTED', amountFc: 9000, reason: 'Numéro invalide'),
        ],
      );
      await _pump(tester, repo, initialTab: 1);

      expect(find.text('Demande reçue'), findsOneWidget);
      expect(_badgeColor(tester, 'Demande reçue'), TekaColors.warningForeground);
      expect(find.text('M-Pesa (Vodacom) · +243 97• ••• 001'), findsWidgets);
      expect(find.text('+243970000001'), findsNothing);
      await _reveal(tester, 'Approuvé — virement en préparation');
      expect(_badgeColor(tester, 'Approuvé — virement en préparation'),
          TekaColors.infoForeground);
      await _reveal(tester, 'Payé');
      expect(_badgeColor(tester, 'Payé'), TekaColors.successForeground);
      expect(find.text('Référence : MP-1'), findsOneWidget);
      await _reveal(tester, 'Refusé / échec');
      expect(_badgeColor(tester, 'Refusé / échec'), TekaColors.destructiveForeground);
      expect(find.text('Raison : Numéro invalide'), findsOneWidget);
      expect(find.text('+243970000001'), findsNothing);

      await _reveal(tester, 'Demande reçue');
      await tester.tap(find.text('Demande reçue'));
      await tester.pumpAndSettle();
      expect(find.text('DÉTAIL p1'), findsOneWidget);
    });

    testWidgets('empty earnings: contextual copy with a way to the orders',
        (tester) async {
      final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 0));
      await _pump(tester, repo);

      expect(find.text('Aucun gain pour le moment'), findsOneWidget);
      expect(find.textContaining('après la livraison de vos commandes'),
          findsOneWidget);
      await tester.ensureVisible(find.text('Voir mes commandes'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Voir mes commandes'));
      await tester.pumpAndSettle();
      expect(find.text('ÉCRAN COMMANDES'), findsOneWidget);
    });

    testWidgets('empty payouts below the threshold: states 5.000 FC and points to the gains',
        (tester) async {
      final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 0));
      await _pump(tester, repo, initialTab: 1);
      expect(find.text('Aucun virement pour le moment'), findsOneWidget);
      expect(find.textContaining('atteint 5.000 FC'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Voir mes gains'),
          findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Demander un virement'),
          findsNothing);
    });

    testWidgets('empty payouts with an eligible balance: the CTA is the request itself',
        (tester) async {
      final repo = FixtureEarningsRepository(wallet: wallet(availableFc: 70000));
      await _pump(tester, repo, initialTab: 1);
      expect(find.text('Aucun virement pour le moment'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Demander un virement'),
          findsOneWidget);
      await tester.ensureVisible(
          find.widgetWithText(OutlinedButton, 'Demander un virement'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(OutlinedButton, 'Demander un virement'));
      await tester.pumpAndSettle();
      expect(find.text('ÉCRAN DEMANDE DE VIREMENT'), findsOneWidget);
    });

    testWidgets('a failed list shows the reason with a retry, scoped to that list',
        (tester) async {
      final repo = FixtureEarningsRepository(wallet: wallet(), earnings: [earning()])
        ..failEarnings = true;
      await _pump(tester, repo);

      expect(find.text('Impossible de charger vos gains'), findsOneWidget);
      expect(find.text('Solde disponible'), findsOneWidget); // wallet still fine
      repo.failEarnings = false;
      await tester.tap(find.text('Réessayer'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Commande TK-20260901-000210'), findsOneWidget);
    });

    testWidgets(
        '« Actualiser » refetches the wallet AND both lists — a payout settled elsewhere clears the reserved state',
        (tester) async {
      final repo = FixtureEarningsRepository(
        wallet: wallet(availableFc: 0),
        earnings: [earning(state: 'RESERVED')],
        payouts: [payout(id: 'p-open', status: 'REQUESTED')],
      );
      await _pump(tester, repo);
      expect(find.text('63.000 FC · virement en cours'), findsOneWidget);
      expect(find.text('Voir le virement en cours'), findsOneWidget);

      // Admin rejected the payout: money back, earning available again.
      repo.walletRow = wallet(availableFc: 63000);
      repo.earnings = [earning(state: 'AVAILABLE')];
      repo.payouts = [payout(id: 'p-open', status: 'REJECTED', reason: 'Numéro invalide')];
      final calls = (repo.walletCalls, repo.earningsCalls, repo.payoutsCalls);
      await tester.tap(find.byTooltip('Actualiser'));
      await tester.pump();
      await tester.pump();
      expect((repo.walletCalls, repo.earningsCalls, repo.payoutsCalls),
          (calls.$1 + 1, calls.$2 + 1, calls.$3 + 1));
      expect(find.text('63.000 FC'), findsOneWidget);
      expect(find.text('63.000 FC · virement en cours'), findsNothing);
      expect(find.text('Voir le virement en cours'), findsNothing);
      expect(find.text('Disponible'), findsOneWidget);
      final button = tester.widget<ElevatedButton>(find.ancestor(
          of: find.text('Demander un virement'),
          matching: find.byType(ElevatedButton)));
      expect(button.enabled, isTrue);
    });
  });

  group('responsive', () {
    for (final width in [320.0, 360.0, 412.0]) {
      for (final scale in [1.0, 1.5]) {
        testWidgets('earnings fit $width at $scale×', (tester) async {
          final repo = FixtureEarningsRepository(
            wallet: wallet(
                availableFc: 12345678, pendingFc: 9350, grossFc: 98765432),
            earnings: [earning(grossFc: 12345678, commissionFc: 1234567)],
            payouts: [payout(status: 'APPROVED', amountFc: 12345678)],
          );
          await _pump(tester, repo,
              size: Size(width, 740), textScale: scale);
          expect(find.text('Solde disponible'), findsOneWidget);
          expect(tester.takeException(), isNull);
        });
      }
    }

    testWidgets('tablet 1024×768: the summary stays in a readable column',
        (tester) async {
      final repo = FixtureEarningsRepository(wallet: wallet(), earnings: [earning()]);
      await _pump(tester, repo, size: const Size(1024, 768));
      final card = tester.getSize(find.byType(WalletSummaryCard));
      expect(card.width, lessThan(800));
      expect(tester.takeException(), isNull);
    });
  });
}
