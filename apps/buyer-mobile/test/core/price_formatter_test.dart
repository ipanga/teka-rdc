import 'package:flutter_test/flutter_test.dart';
import 'package:buyer_mobile/core/utils/price_formatter.dart';

void main() {
  group('formatCDF — dot thousand separators + FC', () {
    test('groups thousands with dots, no decimals', () {
      expect(formatCDF('95000'), '950 FC'); // 950 — no separator
      expect(formatCDF('120000'), '1.200 FC');
      expect(formatCDF('1250000'), '12.500 FC');
      expect(formatCDF('5295700'), '52.957 FC');
      expect(formatCDF('125000000'), '1.250.000 FC');
    });
    test('zero / invalid → "0 FC"', () {
      expect(formatCDF('0'), '0 FC');
      expect(formatCDF('not-a-number'), '0 FC');
    });
  });

  group('formatUSD — dot thousands, comma decimals, \$US', () {
    test('formats cents', () {
      expect(formatUSD('120'), '1,20 \$US');
      expect(formatUSD('2550'), '25,50 \$US');
      expect(formatUSD('125075'), '1.250,75 \$US');
    });
  });

  group('discountPercent', () {
    test('rounds correctly and defends invalid input', () {
      expect(discountPercent('10000', '8000'), 20);
      expect(discountPercent('10000', null), 0);
      expect(discountPercent('10000', '12000'), 0); // discount >= price
    });
  });
}
