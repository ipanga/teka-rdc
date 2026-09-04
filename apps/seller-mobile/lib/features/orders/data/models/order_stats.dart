/// Exact global counts from GET /v1/sellers/orders/stats, never a list page.
class SellerOrderStats {
  final int pending;
  final int confirmed;
  final int processing;

  const SellerOrderStats(
      {this.pending = 0, this.confirmed = 0, this.processing = 0});

  factory SellerOrderStats.fromJson(Map<String, dynamic> json) {
    final counts = json['byStatus'] as Map<String, dynamic>;
    return SellerOrderStats(
      pending: counts['PENDING'] as int? ?? 0,
      confirmed: counts['CONFIRMED'] as int? ?? 0,
      processing: counts['PROCESSING'] as int? ?? 0,
    );
  }

  int get requiredActions => pending + confirmed + processing;
}
