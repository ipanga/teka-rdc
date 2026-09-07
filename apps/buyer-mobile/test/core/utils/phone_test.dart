// One phone rule on every surface (PR D2, 2026-09-07). Mirror of the shared
// TypeScript helper pinned by apps/api/src/addresses/dto/create-address.dto.spec.ts —
// the two tables must agree.
import 'package:buyer_mobile/core/utils/phone.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const canonical = {
    '990000001': '+243990000001',
    '0990000001': '+243990000001',
    '+243990000001': '+243990000001',
    '243990000001': '+243990000001',
    '00243990000001': '+243990000001',
    '+243 99 000 00 01': '+243990000001',
    '099-000-00-01': '+243990000001',
    '(099) 000.00.01': '+243990000001',
    '  0810000001  ': '+243810000001',
    '+243 81 000 00 01': '+243810000001',
  };
  canonical.forEach((input, expected) {
    test('$input → $expected', () => expect(normalizeDrcPhone(input), expected));
  });

  const rejected = [
    '', '   ', '99000000', '9900000012', '09900000012', '+24499000000',
    '0790000001', '+243790000001', 'abc', '09900000O1', '+243990000001x',
  ];
  for (final input in rejected) {
    test('rejects "$input"', () => expect(normalizeDrcPhone(input), isNull));
  }

  test('equivalent inputs produce the identical stored value', () {
    final values = {
      normalizeDrcPhone('0990000001'),
      normalizeDrcPhone('+243 99 000 00 01'),
      normalizeDrcPhone('00243990000001'),
      normalizeDrcPhone('099 000 00 01'),
    };
    expect(values, {'+243990000001'});
  });
}
