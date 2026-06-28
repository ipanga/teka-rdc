import 'package:intl/intl.dart';

/// Format a price in centimes (string) to a human-readable franc string.
/// The user-facing label is **FC** (how DRC users refer to the franc), not the
/// ISO "CDF". Example: "150000" (centimes) -> "1 500 FC".
String formatCDF(String centimes) {
  final amount = int.tryParse(centimes) ?? 0;
  final cdf = amount / 100;
  final formatter = NumberFormat.currency(
    locale: 'fr_CD',
    symbol: 'FC',
    decimalDigits: 0,
  );
  return formatter.format(cdf);
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
