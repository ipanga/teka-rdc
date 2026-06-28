/// Shared price formatting for seller-mobile — mirrors buyer-mobile / the web
/// `@teka/shared` formatter so amounts read identically across the platform.

/// Group an integer's digits with '.' as the thousand separator — the DRC
/// convention for francs (195000 -> "195.000"). Input is the absolute integer
/// part as a digit string.
String _groupThousands(String intDigits) {
  final buf = StringBuffer();
  final n = intDigits.length;
  for (var i = 0; i < n; i++) {
    if (i > 0 && (n - i) % 3 == 0) buf.write('.');
    buf.write(intDigits[i]);
  }
  return buf.toString();
}

/// Format a MAJOR-unit franc amount (already divided from centimes) as a
/// dot-grouped number string WITHOUT a currency label — callers append " FC".
/// Replaces the old `NumberFormat('#,###', 'fr')` (space separators).
/// Example: 195000 -> "195.000".
String formatFcNumber(num? value) {
  final v = (value ?? 0).round();
  final sign = v < 0 ? '-' : '';
  return '$sign${_groupThousands(v.abs().toString())}';
}

/// Format CDF **centimes** (string) as the full franc string: '.' thousands,
/// no decimals, " FC". Example: "5295700" -> "52.957 FC".
String formatCDF(String centimes) {
  final n = int.tryParse(centimes) ?? 0;
  return '${formatFcNumber(n / 100)} FC';
}

/// Format USD **cents** (string) French-style: '.' thousands, ',' decimals,
/// " $US". Example: "125075" -> "1.250,75 $US".
String formatUSD(String cents) {
  final n = int.tryParse(cents) ?? 0;
  final usd = n / 100;
  final sign = usd < 0 ? '-' : '';
  final parts = usd.abs().toStringAsFixed(2).split('.');
  return '$sign${_groupThousands(parts[0])},${parts[1]} \$US';
}
