import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/theme/teka_colors.dart';
import 'package:seller_mobile/features/earnings/data/models/earning_model.dart';
import 'package:seller_mobile/features/earnings/presentation/payout_status.dart';
import 'package:seller_mobile/features/earnings/presentation/providers/earnings_provider.dart';
import 'package:seller_mobile/features/earnings/presentation/screens/request_payout_screen.dart';

import '../../support/seller_earnings_fixtures.dart';

void main() {
  group('maskPhone', () {
    test('keeps the operator prefix and the last three digits', () {
      expect(maskPhone('+243970000001'), '+243 97• ••• 001');
      expect(maskPhone('+243812345678'), '+243 81• ••• 678');
    });
    test('leaves an unexpected value untouched', () {
      expect(maskPhone('0970'), '0970');
      expect(maskPhone(''), '');
    });
  });

  group('validatePayoutPhone', () {
    test('accepts +243 + 9 digits only', () {
      expect(validatePayoutPhone('+243970000001'), isNull);
      expect(validatePayoutPhone(' +243970000001 '), isNull);
      expect(validatePayoutPhone(''), isNotNull);
      expect(validatePayoutPhone('0970000001'), isNotNull);
      expect(validatePayoutPhone('+24397000000'), isNotNull);
      expect(validatePayoutPhone('+2439700000012'), isNotNull);
      expect(validatePayoutPhone('+243 970 000 001'), isNotNull);
    });
  });

  group('status vocabulary', () {
    test('only COMPLETED reads « Payé »; approval is never worded as payment', () {
      expect(PayoutStatusUi.of('COMPLETED').label, 'Payé');
      for (final s in ['REQUESTED', 'APPROVED', 'PROCESSING', 'REJECTED']) {
        expect(PayoutStatusUi.of(s).label, isNot('Payé'));
      }
      expect(PayoutStatusUi.of('APPROVED').hint, contains("n'a pas encore été envoyé"));
    });
    test('open states are the three the API refuses a second request on', () {
      expect(PayoutStatusUi.isOpen('requested'), isTrue);
      expect(PayoutStatusUi.isOpen('APPROVED'), isTrue);
      expect(PayoutStatusUi.isOpen('PROCESSING'), isTrue);
      expect(PayoutStatusUi.isOpen('COMPLETED'), isFalse);
      expect(PayoutStatusUi.isOpen('REJECTED'), isFalse);
    });
    test('tones are foreground tokens; brand red on no state', () {
      final colours = [
        for (final s in ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED'])
          PayoutStatusUi.of(s).color,
        for (final s in ['HELD', 'AVAILABLE', 'RESERVED', 'PAID', 'REVERSED'])
          EarningStateUi.of(s).color,
      ];
      expect(colours, isNot(contains(TekaColors.tekaRed)));
      expect(colours, isNot(contains(TekaColors.warning)));
      expect(colours, isNot(contains(TekaColors.success)));
      expect(colours, isNot(contains(TekaColors.destructive)));
      expect(EarningStateUi.of('RESERVED').color, TekaColors.infoForeground);
      expect(EarningStateUi.of('AVAILABLE').color, TekaColors.successForeground);
      expect(EarningStateUi.of('PAID').color, TekaColors.neutralForeground);
    });
  });

  group('EarningsState.openPayout', () {
    test('is the first open payout in the list, none when all are settled', () {
      final open = EarningsState(payouts: [
        payout(id: 'done', status: 'COMPLETED'),
        payout(id: 'open', status: 'approved'),
        payout(id: 'old', status: 'REQUESTED'),
      ]);
      expect(open.openPayout!.id, 'open');
      final settled = EarningsState(payouts: [
        payout(id: 'done', status: 'COMPLETED'),
        payout(id: 'no', status: 'REJECTED'),
      ]);
      expect(settled.openPayout, isNull);
      expect(const EarningsState().openPayout, isNull);
    });

    test('walletError clears on the next successful wallet', () {
      final s = const EarningsState().copyWith(walletError: 'Hors ligne');
      expect(s.walletError, 'Hors ligne');
      final ok = s.copyWith(wallet: wallet(), clearWalletError: true);
      expect(ok.walletError, isNull);
      expect(ok.wallet, isA<SellerWallet>());
    });
  });
}
