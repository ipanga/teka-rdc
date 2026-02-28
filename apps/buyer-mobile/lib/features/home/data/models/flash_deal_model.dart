class FlashDealProduct {
  final String id;
  final Map<String, String> title;
  final String priceCDF; // BigInt as string (centimes)
  final List<String> imageUrls;

  const FlashDealProduct({
    required this.id,
    required this.title,
    required this.priceCDF,
    this.imageUrls = const [],
  });

  factory FlashDealProduct.fromJson(Map<String, dynamic> json) {
    // Parse images: could be a list of objects with 'url' or a list of strings
    final List<String> urls = [];
    final rawImages = json['images'];
    if (rawImages is List) {
      for (final img in rawImages) {
        if (img is Map && img['url'] != null) {
          urls.add(img['url'] as String);
        } else if (img is String) {
          urls.add(img);
        }
      }
    }

    return FlashDealProduct(
      id: json['id'] as String,
      title: _parseTranslationMap(json['title']),
      priceCDF: json['priceCDF']?.toString() ?? '0',
      imageUrls: urls,
    );
  }

  String localizedTitle(String locale) {
    return title[locale] ?? title['fr'] ?? title['en'] ?? '';
  }

  String? get firstImageUrl => imageUrls.isNotEmpty ? imageUrls.first : null;

  static Map<String, String> _parseTranslationMap(dynamic value) {
    if (value is Map) {
      return value.map((k, v) => MapEntry(k.toString(), v?.toString() ?? ''));
    }
    if (value is String) {
      return {'fr': value};
    }
    return {'fr': ''};
  }
}

class FlashDealModel {
  final String id;
  final Map<String, String> title;
  final int? discountPercent;
  final String? discountCDF; // BigInt as string (centimes)
  final String startsAt;
  final String endsAt;
  final FlashDealProduct product;

  const FlashDealModel({
    required this.id,
    required this.title,
    this.discountPercent,
    this.discountCDF,
    required this.startsAt,
    required this.endsAt,
    required this.product,
  });

  factory FlashDealModel.fromJson(Map<String, dynamic> json) {
    return FlashDealModel(
      id: json['id'] as String,
      title: _parseTranslationMap(json['title']),
      discountPercent: json['discountPercent'] as int?,
      discountCDF: json['discountCDF']?.toString(),
      startsAt: json['startsAt']?.toString() ?? '',
      endsAt: json['endsAt']?.toString() ?? '',
      product: FlashDealProduct.fromJson(
        json['product'] as Map<String, dynamic>? ?? {},
      ),
    );
  }

  String localizedTitle(String locale) {
    return title[locale] ?? title['fr'] ?? title['en'] ?? '';
  }

  /// Whether this deal is currently active
  bool get isActive {
    final now = DateTime.now();
    final start = DateTime.tryParse(startsAt);
    final end = DateTime.tryParse(endsAt);
    if (start == null || end == null) return false;
    return now.isAfter(start) && now.isBefore(end);
  }

  /// Duration remaining until the deal ends
  Duration get timeRemaining {
    final end = DateTime.tryParse(endsAt);
    if (end == null) return Duration.zero;
    final remaining = end.difference(DateTime.now());
    return remaining.isNegative ? Duration.zero : remaining;
  }

  /// Compute discounted price in centimes
  int get discountedPriceCentimes {
    final original = int.tryParse(product.priceCDF) ?? 0;
    if (discountPercent != null && discountPercent! > 0) {
      return (original * (100 - discountPercent!) / 100).round();
    }
    if (discountCDF != null) {
      final discount = int.tryParse(discountCDF!) ?? 0;
      final result = original - discount;
      return result > 0 ? result : 0;
    }
    return original;
  }

  static Map<String, String> _parseTranslationMap(dynamic value) {
    if (value is Map) {
      return value.map((k, v) => MapEntry(k.toString(), v?.toString() ?? ''));
    }
    if (value is String) {
      return {'fr': value};
    }
    return {'fr': ''};
  }
}
