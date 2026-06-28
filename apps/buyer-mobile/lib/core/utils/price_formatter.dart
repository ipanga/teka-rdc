/// Group an integer's digits with '.' as the thousand separator — the DRC
/// convention for francs (52957 -> "52.957"). Input is the absolute integer
/// part as a digit string. Mirrors the web `@teka/shared` formatter.
String _groupThousands(String intDigits) {
  final buf = StringBuffer();
  final n = intDigits.length;
  for (var i = 0; i < n; i++) {
    if (i > 0 && (n - i) % 3 == 0) buf.write('.');
    buf.write(intDigits[i]);
  }
  return buf.toString();
}

/// Format a price in centimes (string) as the user-facing franc string:
/// '.' thousand separators, no decimals, " FC" (how DRC users say the franc).
/// Example: "5295700" (centimes) -> "52.957 FC".
String formatCDF(String centimes) {
  final n = int.tryParse(centimes) ?? 0;
  final fc = (n / 100).round();
  final sign = fc < 0 ? '-' : '';
  return '$sign${_groupThousands(fc.abs().toString())} FC';
}

/// Discount percentage from regular + promotional centimes strings:
/// round((price - discount) / price * 100). Returns 0 when there is no valid
/// promotion (the API guarantees 0 < discount < price; this is defensive).
int discountPercent(String priceCDF, String? discountPriceCDF) {
  if (discountPriceCDF == null) return 0;
  final price = int.tryParse(priceCDF) ?? 0;
  final discount = int.tryParse(discountPriceCDF) ?? 0;
  if (price <= 0 || !(discount > 0 && discount < price)) return 0;
  return ((price - discount) / price * 100).round();
}

/// Format a price in cents (string) as a French-style USD string: '.'
/// thousands, ',' decimals, two fraction digits, " $US".
/// Example: "125075" (cents) -> "1.250,75 $US".
String formatUSD(String cents) {
  final n = int.tryParse(cents) ?? 0;
  final usd = n / 100;
  final sign = usd < 0 ? '-' : '';
  final parts = usd.abs().toStringAsFixed(2).split('.');
  return '$sign${_groupThousands(parts[0])},${parts[1]} \$US';
}
