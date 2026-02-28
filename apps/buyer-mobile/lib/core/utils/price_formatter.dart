import 'package:intl/intl.dart';

/// Format a price in centimes (string) to a human-readable CDF string.
/// Example: "150000" (centimes) -> "1 500 CDF"
String formatCDF(String centimes) {
  final amount = int.tryParse(centimes) ?? 0;
  final cdf = amount / 100;
  final formatter = NumberFormat.currency(
    locale: 'fr_CD',
    symbol: 'CDF',
    decimalDigits: 0,
  );
  return formatter.format(cdf);
}

/// Format a price in centimes (string) to a human-readable USD string.
/// Example: "1500" (cents) -> "15,00 USD"
String formatUSD(String cents) {
  final amount = int.tryParse(cents) ?? 0;
  final usd = amount / 100;
  final formatter = NumberFormat.currency(
    locale: 'fr',
    symbol: 'USD',
    decimalDigits: 2,
  );
  return formatter.format(usd);
}
