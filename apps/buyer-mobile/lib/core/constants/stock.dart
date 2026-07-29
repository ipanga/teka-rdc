/// Public stock availability.
///
/// Buyers never see an exact remaining quantity — only a coarse state. The
/// number stays internal, where it is still authoritative for the quantity
/// stepper's ceiling and for all server-side validation (cart limits, checkout,
/// overselling prevention).
///
/// TODO(stock-status-server-owned): this threshold is a CLIENT-side rule, so it
/// has to exist twice — here for Flutter and as `LOW_STOCK_THRESHOLD` in
/// `packages/shared/src/constants/product.ts` for the three Next.js apps. A
/// TypeScript constant cannot be shared with Dart. The real fix is for the API
/// to derive and return a `stockStatus` field, after which BOTH copies are
/// deleted. That is an API contract change and is deliberately out of scope.
/// **Until then, keep this value and the TS one in sync.**
const int kLowStockThreshold = 5;

/// Coarse, publicly displayable stock state. Never carries a quantity.
enum StockStatus { inStock, lowStock, outOfStock }

/// Maps an internal quantity to the state buyers are allowed to see.
StockStatus stockStatusFor(int quantity) {
  if (quantity <= 0) return StockStatus.outOfStock;
  if (quantity <= kLowStockThreshold) return StockStatus.lowStock;
  return StockStatus.inStock;
}

/// The only stock copy buyers should ever see.
String stockStatusLabel(StockStatus status) {
  switch (status) {
    case StockStatus.outOfStock:
      return 'Rupture de stock';
    case StockStatus.lowStock:
      return 'Stock limité';
    case StockStatus.inStock:
      return 'En stock';
  }
}
