import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/core/theme/teka_colors.dart';
import 'package:seller_mobile/core/widgets/seller_status_badge.dart';
import 'package:seller_mobile/features/earnings/data/earnings_repository.dart';
import 'package:seller_mobile/features/earnings/data/models/earning_model.dart';
import 'package:seller_mobile/features/earnings/presentation/payout_status.dart';
import 'package:seller_mobile/features/earnings/presentation/screens/payout_detail_screen.dart';

import '../../support/seller_earnings_fixtures.dart';

Future<void> _reveal(WidgetTester tester, String text) async {
  await tester.dragUntilVisible(
      find.text(text), find.byType(ListView), const Offset(0, -120));
  await tester.pumpAndSettle();
}

Future<void> _pump(WidgetTester tester, FixtureEarningsRepository repo,
    {String id = 'payout-1',
    Size size = const Size(390, 844),
    double textScale = 1}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [earningsRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: PayoutDetailScreen(payoutId: id),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  testWidgets('a REQUESTED payout lists only what happened — no future step, no admin',
      (tester) async {
    final repo = FixtureEarningsRepository(payouts: [payout(status: 'REQUESTED')]);
    await _pump(tester, repo);

    await _reveal(tester, 'Historique');
    expect(find.text('Demandé le'), findsOneWidget);
    expect(find.text('Approuvé le'), findsNothing);
    expect(find.text('Virement lancé le'), findsNothing);
    expect(find.text('Payé le'), findsNothing);
    expect(find.text('Demande reçue'), findsOneWidget);
    expect(find.textContaining('réservé sur votre solde'), findsOneWidget);
    // Full destination on the detail (the list masks it).
    expect(find.text('+243970000001'), findsOneWidget);
    expect(find.text('M-Pesa (Vodacom)'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a COMPLETED payout shows the four dated events in order and the reference once',
      (tester) async {
    final repo = FixtureEarningsRepository(payouts: [
      payout(
        status: 'COMPLETED',
        approvedAt: '2026-09-03T10:00:00.000Z',
        processingAt: '2026-09-04T09:30:00.000Z',
        processedAt: '2026-09-04T14:53:00.000Z',
        reference: 'MPESA-REF-1',
      ),
    ]);
    await _pump(tester, repo);

    final labels = ['Demandé le', 'Approuvé le', 'Virement lancé le', 'Payé le'];
    await _reveal(tester, 'Payé le');
    for (final l in labels) {
      expect(find.text(l), findsOneWidget);
    }
    final ys = labels.map((l) => tester.getTopLeft(find.text(l)).dy).toList();
    expect(ys, orderedEquals([...ys]..sort()));
    expect(find.text('MPESA-REF-1'), findsOneWidget);
    expect(find.text('Référence de paiement'), findsOneWidget);
    expect(
        tester
            .widget<SellerStatusBadge>(find.byType(SellerStatusBadge))
            .color,
        TekaColors.successForeground);
  });

  testWidgets('a payout that failed after the transfer started reads « Échec le », a refusal « Refusé le »',
      (tester) async {
    final failed = FixtureEarningsRepository(payouts: [
      payout(
        status: 'REJECTED',
        approvedAt: '2026-09-03T10:00:00.000Z',
        processingAt: '2026-09-04T09:30:00.000Z',
        rejectedAt: '2026-09-04T11:00:00.000Z',
        reason: 'Numéro Mobile Money invalide',
      ),
    ]);
    await _pump(tester, failed);
    await _reveal(tester, 'Échec le');
    expect(find.text('Échec le'), findsOneWidget);
    expect(find.text('Refusé le'), findsNothing);
    expect(find.text('Numéro Mobile Money invalide'), findsOneWidget);
    expect(find.textContaining('de nouveau disponible'), findsOneWidget);
  });

  testWidgets('a refusal before any transfer reads « Refusé le » with « Non précisée » when no reason was given',
      (tester) async {
    final refused = FixtureEarningsRepository(payouts: [
      payout(status: 'REJECTED', rejectedAt: '2026-09-03T10:00:00.000Z'),
    ]);
    await _pump(tester, refused);
    await _reveal(tester, 'Refusé le');
    expect(find.text('Refusé le'), findsOneWidget);
    expect(find.text('Échec le'), findsNothing);
    expect(find.text('Non précisée'), findsOneWidget);
  });

  testWidgets('loading is a static skeleton, not a spinner', (tester) async {
    final gate = Completer<void>();
    final repo = FixtureEarningsRepository(payouts: [payout()])
      ..hold = gate.future;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [earningsRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp(
            theme: AppTheme.lightTheme,
            home: const PayoutDetailScreen(payoutId: 'payout-1')),
      ),
    );
    await tester.pump();
    expect(find.byType(PayoutDetailSkeleton), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    gate.complete();
    await tester.pump();
    await tester.pump();
    expect(find.byType(PayoutDetailSkeleton), findsNothing);
    expect(find.text('63.000 FC'), findsOneWidget);
  });

  for (final width in [320.0, 360.0, 412.0]) {
    for (final scale in [1.0, 1.5]) {
      testWidgets('detail fits $width at $scale×', (tester) async {
        final repo = FixtureEarningsRepository(payouts: [
          payout(
            amountFc: 12345678,
            status: 'COMPLETED',
            approvedAt: '2026-09-03T10:00:00.000Z',
            processingAt: '2026-09-04T09:30:00.000Z',
            processedAt: '2026-09-04T14:53:00.000Z',
            reference: 'MPESA-REFERENCE-VERY-LONG-20260904-000001',
          ),
        ]);
        await _pump(tester, repo, size: Size(width, 740), textScale: scale);
        expect(find.text('Payé'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  group('payoutEvents', () {
    test('never invents a step and sorts by time', () {
      final p = PayoutModel(
        id: 'x',
        amountCDF: '100',
        status: 'PROCESSING',
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        requestedAt: '2026-09-02T08:00:00.000Z',
        approvedAt: '2026-09-03T08:00:00.000Z',
        processingAt: '2026-09-04T08:00:00.000Z',
        // A stale processedAt on a non-completed row is ignored.
        processedAt: '2026-09-05T08:00:00.000Z',
        createdAt: '2026-09-02T08:00:00.000Z',
      );
      expect(payoutEvents(p).map((e) => e.label).toList(),
          ['Demandé le', 'Approuvé le', 'Virement lancé le']);
    });

    test('the seller detail JSON may carry admin ids; the model ignores them',
        () {
      final p = PayoutModel.fromJson({
        'id': 'x',
        'amountCDF': '6300000',
        'status': 'APPROVED',
        'payoutMethod': 'M_PESA',
        'payoutPhone': '+243970000001',
        'requestedAt': '2026-09-02T08:00:00.000Z',
        'approvedAt': '2026-09-03T08:00:00.000Z',
        'approvedById': 'admin-uuid',
        'approvedBy': {'firstName': 'Admin', 'lastName': 'Teka'},
        'createdAt': '2026-09-02T08:00:00.000Z',
      });
      expect(p.approvedAtDate, DateTime.utc(2026, 9, 3, 8));
      expect(p.processingAtDate, isNull);
      expect(p.rejectedAtDate, isNull);
      expect(payoutEvents(p).length, 2);
    });
  });
}
