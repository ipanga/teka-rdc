import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/earnings/data/models/earning_model.dart';
import 'package:seller_mobile/features/earnings/presentation/payout_status.dart';

SellerEarningModel _e({String rate = '0.1', bool isPaid = false, String? state}) =>
    SellerEarningModel(
      id: 'e1', orderId: 'o1', grossAmountCDF: '1000000', commissionCDF: '100000',
      netAmountCDF: '900000', commissionRate: rate, isPaid: isPaid, state: state,
      createdAt: '2026-09-04T10:00:00.000Z',
    );

void main() {
  test('commission rate renders as a French percent (defect 12: "0%" was shown for 10 %)', () {
    expect(_e(rate: '0.1').commissionRatePercentLabel, '10 %');
    expect(_e(rate: '0.1000').commissionRatePercentLabel, '10 %');
    expect(_e(rate: '0.0825').commissionRatePercentLabel, '8,25 %');
    expect(_e(rate: '0').commissionRatePercentLabel, '0 %');
    expect(_e(rate: 'abc').commissionRatePercentLabel, '—');
  });

  test('state comes from the API, with the historical isPaid fallback for older responses', () {
    expect(_e(state: 'HELD').effectiveState, 'HELD');
    expect(EarningStateUi.of(_e(state: 'HELD').effectiveState).label, 'En attente (retour possible)');
    expect(EarningStateUi.of(_e(state: 'RESERVED').effectiveState).label, 'Réservé (virement en cours)');
    expect(EarningStateUi.of(_e(state: 'REVERSED').effectiveState).label, 'Annulé');
    expect(_e(isPaid: true).effectiveState, 'PAID');
    expect(_e(state: 'bogus').effectiveState, 'AVAILABLE');
  });

  test('fromJson reads the additive state and tolerates its absence', () {
    final withState = SellerEarningModel.fromJson({'id': 'e', 'commissionRate': '0.1', 'state': 'HELD'});
    expect(withState.state, 'HELD');
    final without = SellerEarningModel.fromJson({'id': 'e', 'commissionRate': '0.1', 'isPaid': true});
    expect(without.effectiveState, 'PAID');
  });
}
