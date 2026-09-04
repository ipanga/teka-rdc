import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/earnings/data/earnings_repository.dart';
import 'package:seller_mobile/features/earnings/data/models/earning_model.dart';
import 'package:seller_mobile/features/earnings/presentation/screens/payout_detail_screen.dart';

const _pay = '0f1e2d3c-4b5a-4c6d-8e7f-90a1b2c3d4e5';

class _Repo extends EarningsRepository {
  _Repo({this.payout}) : super(Dio());
  final PayoutModel? payout;
  final requested = <String>[];

  @override
  Future<PayoutModel> getPayout(String payoutId) async {
    requested.add(payoutId);
    if (payout != null) return payout!;
    // Shape of the API's French 4xx envelope — passed through verbatim
    // by dio_error_messages (Rule 15).
    throw DioException(
      requestOptions: RequestOptions(path: '/v1/sellers/payouts/$payoutId'),
      type: DioExceptionType.badResponse,
      response: Response(
        requestOptions: RequestOptions(path: '/v1/sellers/payouts/$payoutId'),
        statusCode: 404,
        data: {
          'success': false,
          'error': {
            'status': 404,
            'message': 'Ce virement est introuvable ou ne vous appartient pas.',
          },
        },
      ),
    );
  }
}

Future<void> _pump(WidgetTester tester, EarningsRepository repo) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [earningsRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp(
        theme: AppTheme.lightTheme,
        home: const PayoutDetailScreen(payoutId: _pay),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  testWidgets('a paid payout shows « Payé », the amount, the reference and the paid date',
      (tester) async {
    final repo = _Repo(
      payout: const PayoutModel(
        id: _pay,
        amountCDF: '6300000',
        status: 'COMPLETED',
        payoutMethod: 'M_PESA',
        payoutPhone: '+243970000001',
        externalReference: 'MPESA-QA-20260904-001',
        requestedAt: '2026-02-27T12:00:00.000Z',
        processedAt: '2026-09-04T14:53:13.000Z',
        createdAt: '2026-02-27T12:00:00.000Z',
      ),
    );
    await _pump(tester, repo);

    expect(repo.requested, [_pay]); // loaded by id, never from the list
    expect(find.text('Payé'), findsOneWidget);
    expect(find.textContaining('63.000 FC'), findsOneWidget);
    expect(find.text('MPESA-QA-20260904-001'), findsOneWidget);
    expect(find.text('Payé le'), findsOneWidget);
    expect(find.textContaining('M-Pesa (Vodacom)'), findsOneWidget);
    expect(find.text('Voir tous mes virements'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a rejected payout shows the reason and the balance note', (tester) async {
    final repo = _Repo(
      payout: const PayoutModel(
        id: _pay,
        amountCDF: '500000',
        status: 'REJECTED',
        payoutMethod: 'AIRTEL_MONEY',
        payoutPhone: '+243990000001',
        rejectionReason: 'Numéro Mobile Money invalide',
        requestedAt: '2026-09-01T09:00:00.000Z',
        createdAt: '2026-09-01T09:00:00.000Z',
      ),
    );
    await _pump(tester, repo);
    expect(find.text('Refusé / échec'), findsOneWidget);
    expect(find.text('Numéro Mobile Money invalide'), findsOneWidget);
    expect(find.textContaining('de nouveau disponible'), findsOneWidget);
  });

  testWidgets('a payout the seller does not own (or a deleted / stale id) shows the API 404 verbatim, with a way out',
      (tester) async {
    final repo = _Repo();
    await _pump(tester, repo);
    expect(find.text('Ce virement est introuvable ou ne vous appartient pas.'),
        findsOneWidget);
    expect(find.text('Réessayer'), findsOneWidget);
    expect(find.text('Voir tous mes virements'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
