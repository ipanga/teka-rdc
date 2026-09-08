/// Exact global counts from GET /v1/sellers/orders/stats, never a list page.
class SellerOrderStats {
  final int pending;
  final int confirmed;
  final int processing;

  /// Prepared and waiting for Teka to collect: tracked on the dashboard,
  /// but no longer the seller's action (`docs/order-workflow.md`).
  final int readyForPickup;

  const SellerOrderStats({
    this.pending = 0,
    this.confirmed = 0,
    this.processing = 0,
    this.readyForPickup = 0,
  });

  factory SellerOrderStats.fromJson(Map<String, dynamic> json) {
    final counts = json['byStatus'] as Map<String, dynamic>;
    return SellerOrderStats(
      pending: counts['PENDING'] as int? ?? 0,
      confirmed: counts['CONFIRMED'] as int? ?? 0,
      processing: counts['PROCESSING'] as int? ?? 0,
      readyForPickup: counts['READY_FOR_TEKA_PICKUP'] as int? ?? 0,
    );
  }

  /// The three statuses the seller drives (Action Center + Commandes badge).
  int get requiredActions => pending + confirmed + processing;
}
