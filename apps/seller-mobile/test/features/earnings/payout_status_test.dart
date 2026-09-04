import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/earnings/presentation/payout_status.dart';

void main() {
  test('approval is never worded as payment; only COMPLETED reads « Payé »', () {
    expect(PayoutStatusUi.of('APPROVED').label.toLowerCase(), isNot(contains('payé')));
    expect(PayoutStatusUi.of('PROCESSING').label.toLowerCase(), isNot(contains('payé')));
    expect(PayoutStatusUi.of('completed').label, 'Payé');
    expect(PayoutStatusUi.of('REJECTED').hint, contains('de nouveau disponible'));
    expect(PayoutStatusUi.of('WHATEVER').label, 'WHATEVER');
  });

  test('payout methods read as the operators the seller knows', () {
    expect(payoutMethodLabel('M_PESA'), 'M-Pesa (Vodacom)');
    expect(payoutMethodLabel('AIRTEL_MONEY'), 'Airtel Money');
    expect(payoutMethodLabel('ORANGE_MONEY'), 'Orange Money');
    expect(payoutMethodLabel('CASH'), 'CASH');
  });
}
