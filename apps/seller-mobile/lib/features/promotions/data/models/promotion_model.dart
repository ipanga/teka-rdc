class PromotionProduct {
  final String id;
  final Map<String, String> title;

  const PromotionProduct({
    required this.id,
    required this.title,
  });

  String getLocalizedTitle(String locale) {
    return title[locale] ?? title['fr'] ?? title.values.firstOrNull ?? '';
  }

  factory PromotionProduct.fromJson(Map<String, dynamic> json) {
    final titleRaw = json['title'];
    Map<String, String> titleMap;
    if (titleRaw is Map) {
      titleMap = titleRaw.map((k, v) => MapEntry(k.toString(), v.toString()));
    } else if (titleRaw is String) {
      titleMap = {'fr': titleRaw};
    } else {
      titleMap = {'fr': ''};
    }

    return PromotionProduct(
      id: json['id'] as String? ?? '',
      title: titleMap,
    );
  }
}

class PromotionModel {
  final String id;
  final String type;
  final Map<String, String> title;
  final Map<String, String>? description;
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

  String getLocalizedTitle(String locale) {
    return title[locale] ?? title['fr'] ?? title.values.firstOrNull ?? '';
  }

  String? getLocalizedDescription(String locale) {
    if (description == null || description!.isEmpty) return null;
    return description![locale] ??
        description!['fr'] ??
        description!.values.firstOrNull;
  }

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
    Map<String, String> parseTranslatable(dynamic raw) {
      if (raw is Map) {
        return raw.map((k, v) => MapEntry(k.toString(), v.toString()));
      } else if (raw is String) {
        return {'fr': raw};
      }
      return {'fr': ''};
    }

    final descRaw = json['description'];
    Map<String, String>? descMap;
    if (descRaw is Map && descRaw.isNotEmpty) {
      descMap = descRaw.map((k, v) => MapEntry(k.toString(), v.toString()));
    } else if (descRaw is String && descRaw.isNotEmpty) {
      descMap = {'fr': descRaw};
    }

    final productRaw = json['product'] as Map<String, dynamic>?;

    return PromotionModel(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? 'PROMOTION',
      title: parseTranslatable(json['title']),
      description: descMap,
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
