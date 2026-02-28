class ProductImageModel {
  final String id;
  final String url;
  final String? thumbnailUrl;
  final int displayOrder;
  final String? cloudinaryId;

  const ProductImageModel({
    required this.id,
    required this.url,
    this.thumbnailUrl,
    required this.displayOrder,
    this.cloudinaryId,
  });

  factory ProductImageModel.fromJson(Map<String, dynamic> json) {
    return ProductImageModel(
      id: json['id'] as String,
      url: json['url'] as String,
      thumbnailUrl: json['thumbnailUrl'] as String?,
      displayOrder: json['displayOrder'] as int? ?? 0,
      cloudinaryId: json['cloudinaryId'] as String?,
    );
  }
}

class CategoryModel {
  final String id;
  final Map<String, String> name;
  final String? emoji;
  final List<CategoryModel> subcategories;

  const CategoryModel({
    required this.id,
    required this.name,
    this.emoji,
    this.subcategories = const [],
  });

  String getLocalizedName(String locale) {
    return name[locale] ?? name['fr'] ?? name.values.firstOrNull ?? '';
  }

  factory CategoryModel.fromJson(Map<String, dynamic> json) {
    final nameRaw = json['name'];
    Map<String, String> nameMap;
    if (nameRaw is Map) {
      nameMap = nameRaw.map((k, v) => MapEntry(k.toString(), v.toString()));
    } else if (nameRaw is String) {
      nameMap = {'fr': nameRaw};
    } else {
      nameMap = {'fr': ''};
    }

    final subcategoriesRaw = json['subcategories'] as List<dynamic>?;
    final subcategories = subcategoriesRaw
            ?.map((e) => CategoryModel.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];

    return CategoryModel(
      id: json['id'] as String,
      name: nameMap,
      emoji: json['emoji'] as String?,
      subcategories: subcategories,
    );
  }
}

class ProductSpecificationModel {
  final String? attributeId;
  final String? attributeName;
  final String value;

  const ProductSpecificationModel({
    this.attributeId,
    this.attributeName,
    required this.value,
  });

  factory ProductSpecificationModel.fromJson(Map<String, dynamic> json) {
    final attrNameRaw = json['attributeName'] ?? json['attribute']?['name'];
    String? attrName;
    if (attrNameRaw is Map) {
      attrName = (attrNameRaw['fr'] ?? attrNameRaw.values.firstOrNull)?.toString();
    } else if (attrNameRaw is String) {
      attrName = attrNameRaw;
    }

    return ProductSpecificationModel(
      attributeId: json['attributeId'] as String?,
      attributeName: attrName,
      value: json['value'] as String? ?? '',
    );
  }
}

enum ProductCondition { newItem, used }

enum ProductStatus { draft, pendingReview, active, rejected, archived }

ProductStatus parseProductStatus(String? status) {
  switch (status?.toUpperCase()) {
    case 'DRAFT':
      return ProductStatus.draft;
    case 'PENDING_REVIEW':
      return ProductStatus.pendingReview;
    case 'ACTIVE':
      return ProductStatus.active;
    case 'REJECTED':
      return ProductStatus.rejected;
    case 'ARCHIVED':
      return ProductStatus.archived;
    default:
      return ProductStatus.draft;
  }
}

String productStatusToApi(ProductStatus status) {
  switch (status) {
    case ProductStatus.draft:
      return 'DRAFT';
    case ProductStatus.pendingReview:
      return 'PENDING_REVIEW';
    case ProductStatus.active:
      return 'ACTIVE';
    case ProductStatus.rejected:
      return 'REJECTED';
    case ProductStatus.archived:
      return 'ARCHIVED';
  }
}

ProductCondition parseProductCondition(String? condition) {
  switch (condition?.toUpperCase()) {
    case 'USED':
      return ProductCondition.used;
    case 'NEW':
    default:
      return ProductCondition.newItem;
  }
}

String productConditionToApi(ProductCondition condition) {
  switch (condition) {
    case ProductCondition.newItem:
      return 'NEW';
    case ProductCondition.used:
      return 'USED';
  }
}

class SellerProductModel {
  final String id;
  final Map<String, String> title;
  final Map<String, String> description;
  final String categoryId;
  final String priceCDF;
  final String? priceUSD;
  final int quantity;
  final ProductCondition condition;
  final ProductStatus status;
  final String? rejectionReason;
  final List<ProductImageModel> images;
  final List<ProductSpecificationModel> specifications;
  final CategoryModel? category;
  final DateTime createdAt;
  final DateTime? updatedAt;

  const SellerProductModel({
    required this.id,
    required this.title,
    required this.description,
    required this.categoryId,
    required this.priceCDF,
    this.priceUSD,
    required this.quantity,
    required this.condition,
    required this.status,
    this.rejectionReason,
    this.images = const [],
    this.specifications = const [],
    this.category,
    required this.createdAt,
    this.updatedAt,
  });

  String getLocalizedTitle(String locale) {
    return title[locale] ?? title['fr'] ?? title.values.firstOrNull ?? '';
  }

  String getLocalizedDescription(String locale) {
    return description[locale] ??
        description['fr'] ??
        description.values.firstOrNull ??
        '';
  }

  /// Display price in CDF (convert from centimes string)
  int get priceCDFDisplay {
    final centimes = int.tryParse(priceCDF) ?? 0;
    return centimes ~/ 100;
  }

  /// Display price in USD (convert from centimes string)
  double? get priceUSDDisplay {
    if (priceUSD == null) return null;
    final centimes = int.tryParse(priceUSD!) ?? 0;
    return centimes / 100;
  }

  String? get coverImageUrl {
    if (images.isEmpty) return null;
    final sorted = List<ProductImageModel>.from(images)
      ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
    return sorted.first.url;
  }

  factory SellerProductModel.fromJson(Map<String, dynamic> json) {
    Map<String, String> parseTranslatable(dynamic raw) {
      if (raw is Map) {
        return raw.map((k, v) => MapEntry(k.toString(), v.toString()));
      } else if (raw is String) {
        return {'fr': raw};
      }
      return {'fr': ''};
    }

    final imagesRaw = json['images'] as List<dynamic>?;
    final images = imagesRaw
            ?.map((e) => ProductImageModel.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];

    final specsRaw = json['specifications'] as List<dynamic>?;
    final specifications = specsRaw
            ?.map((e) =>
                ProductSpecificationModel.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];

    final categoryRaw = json['category'] as Map<String, dynamic>?;

    return SellerProductModel(
      id: json['id'] as String,
      title: parseTranslatable(json['title']),
      description: parseTranslatable(json['description']),
      categoryId: json['categoryId'] as String? ?? '',
      priceCDF: json['priceCDF']?.toString() ?? '0',
      priceUSD: json['priceUSD']?.toString(),
      quantity: json['quantity'] as int? ?? 0,
      condition: parseProductCondition(json['condition'] as String?),
      status: parseProductStatus(json['status'] as String?),
      rejectionReason: json['rejectionReason'] as String?,
      images: images,
      specifications: specifications,
      category:
          categoryRaw != null ? CategoryModel.fromJson(categoryRaw) : null,
      createdAt: DateTime.parse(
          json['createdAt'] as String? ?? DateTime.now().toIso8601String()),
      updatedAt: json['updatedAt'] != null
          ? DateTime.parse(json['updatedAt'] as String)
          : null,
    );
  }
}
