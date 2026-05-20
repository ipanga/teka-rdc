class PromotionProduct {
  final String id;
  final String title;

  const PromotionProduct({
    required this.id,
    required this.title,
  });

  factory PromotionProduct.fromJson(Map<String, dynamic> json) {
    return PromotionProduct(
      id: json['id'] as String? ?? '',
      title: json['title']?.toString() ?? '',
    );
  }
}

class PromotionModel {
  final String id;
  final String type;
  final String title;
  final String? description;
  final int? discountPercent;
  final String? discountCDF;
  final String status;
  final String startsAt;
  final String endsAt;
  final String? productId;
  final String? rejectionReason;
  final String createdAt;
  final PromotionProduct? product;

  const PromotionModel({
    required this.id,
    required this.type,
    required this.title,
    this.description,
    this.discountPercent,
    this.discountCDF,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    this.productId,
    this.rejectionReason,
    required this.createdAt,
    this.product,
  });

  DateTime get startsAtDate => DateTime.parse(startsAt);
  DateTime get endsAtDate => DateTime.parse(endsAt);
  DateTime get createdAtDate => DateTime.parse(createdAt);

  bool get canCancel =>
      status == 'PENDING_APPROVAL' || status == 'DRAFT';

  /// Display discount in CDF (convert from centimes string)
  int? get discountCDFDisplay {
    if (discountCDF == null) return null;
    final centimes = int.tryParse(discountCDF!) ?? 0;
    return centimes ~/ 100;
  }

  factory PromotionModel.fromJson(Map<String, dynamic> json) {
    final descStr = json['description']?.toString();
    final productRaw = json['product'] as Map<String, dynamic>?;

    return PromotionModel(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? 'PROMOTION',
      title: json['title']?.toString() ?? '',
      description: descStr != null && descStr.isNotEmpty ? descStr : null,
      discountPercent: json['discountPercent'] as int?,
      discountCDF: json['discountCDF']?.toString(),
      status: json['status'] as String? ?? 'DRAFT',
      startsAt:
          json['startsAt'] as String? ?? DateTime.now().toIso8601String(),
      endsAt: json['endsAt'] as String? ?? DateTime.now().toIso8601String(),
      productId: json['productId'] as String?,
      rejectionReason: json['rejectionReason'] as String?,
      createdAt:
          json['createdAt'] as String? ?? DateTime.now().toIso8601String(),
      product:
          productRaw != null ? PromotionProduct.fromJson(productRaw) : null,
    );
  }
}
