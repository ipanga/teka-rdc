import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/features/checkout/data/models/checkout_model.dart';

// Inputs are built via jsonDecode to mirror Dio's decoded response.data
// (Map<String, dynamic> at every level) — matching production exactly.
Map<String, dynamic> decode(String s) => jsonDecode(s) as Map<String, dynamic>;

void main() {
  group('CheckoutQuote (delivery-fee preview parity)', () {
    test('parses the unwrapped quote payload from /v1/checkout/quote', () {
      // The repository unwraps the envelope's `data` before fromJson — this is
      // the shape it passes in.
      final q = CheckoutQuote.fromJson(decode('''
        {
          "deliveryAddressId": "40000000-0000-0000-0000-000000000001",
          "subtotalCDF": "3000000",
          "deliveryFeeCDF": "1800000",
          "totalCDF": "4800000",
          "sellerQuotes": []
        }'''));
      expect(q.subtotalCDF, '3000000');
      expect(q.deliveryFeeCDF, '1800000');
      expect(q.totalCDF, '4800000');
    });

    test('total displayed = cart subtotal + previewed delivery fee', () {
      // Mirrors the checkout_screen computation: BigInt centimes, no float drift.
      const cartSubtotalCDF = '3000000';
      final q = CheckoutQuote.fromJson(decode(
          '{"subtotalCDF":"3000000","deliveryFeeCDF":"1800000","totalCDF":"4800000"}'));
      final displayedTotal =
          (BigInt.parse(cartSubtotalCDF) + BigInt.parse(q.deliveryFeeCDF))
              .toString();
      // Equals the server-computed totalCDF — preview parity by construction.
      expect(displayedTotal, q.totalCDF);
    });

    test('defaults missing fields to 0 rather than throwing', () {
      final q = CheckoutQuote.fromJson(decode('{}'));
      expect(q.subtotalCDF, '0');
      expect(q.deliveryFeeCDF, '0');
      expect(q.totalCDF, '0');
    });

    test('deliveryAvailable: parses false, defaults true when absent', () {
      final blocked = CheckoutQuote.fromJson(decode(
          '{"subtotalCDF":"3000000","deliveryFeeCDF":"0","totalCDF":"3000000","deliveryAvailable":false}'));
      expect(blocked.deliveryAvailable, isFalse);
      // Older API responses omit the flag — default to available (no false-block).
      final legacy = CheckoutQuote.fromJson(decode('{}'));
      expect(legacy.deliveryAvailable, isTrue);
    });
  });
}
