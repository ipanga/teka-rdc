class ProductImageModel {
  final String id;
  final String url;
  final String? thumbnailUrl;
  final int displayOrder;

  const ProductImageModel({
    required this.id,
    required this.url,
    this.thumbnailUrl,
    this.displayOrder = 0,
  });

  factory ProductImageModel.fromJson(Map<String, dynamic> json) {
    return ProductImageModel(
      id: json['id'] as String,
      url: json['url'] as String,
      thumbnailUrl: json['thumbnailUrl'] as String?,
      displayOrder: json['displayOrder'] as int? ?? 0,
    );
  }
}

class BrowseProductModel {
  final String id;
  final String title;
  final String priceCDF;
  final String? priceUSD;
  final String condition;
  final int quantity;
  final ProductImageModel? image;
  final BrowseProductSeller seller;
  final String? categoryId;
  // City-first URL fields (API 2026-06-06). Mobile resolves products by UUID,
  // so these are informational/future-proofing (city display, deep-link
  // building) — kept in sync with the buyer-web BrowseProduct shape.
  final String? slug;
  final String? shortCode;
  final String? cityId;
  final String? citySlug;
  final String? cityName;

  const BrowseProductModel({
    required this.id,
    required this.title,
    required this.priceCDF,
    this.priceUSD,
    required this.condition,
    required this.quantity,
    this.image,
    required this.seller,
    this.categoryId,
    this.slug,
    this.shortCode,
    this.cityId,
    this.citySlug,
    this.cityName,
  });

  factory BrowseProductModel.fromJson(Map<String, dynamic> json) {
    return BrowseProductModel(
      id: json['id'] as String,
      title: json['title']?.toString() ?? '',
      priceCDF: json['priceCDF']?.toString() ?? '0',
      priceUSD: json['priceUSD']?.toString(),
      condition: json['condition'] as String? ?? 'NEW',
      quantity: json['quantity'] as int? ?? 0,
      image: json['image'] != null
          ? ProductImageModel.fromJson(json['image'] as Map<String, dynamic>)
          : null,
      seller: BrowseProductSeller.fromJson(
        json['seller'] as Map<String, dynamic>? ?? {},
      ),
      categoryId: json['categoryId'] as String?,
      slug: json['slug'] as String?,
      shortCode: json['shortCode'] as String?,
      cityId: json['cityId'] as String?,
      citySlug: json['citySlug'] as String?,
      cityName: json['cityName'] as String?,
    );
  }

  bool get isLowStock => quantity > 0 && quantity < 5;
  bool get isOutOfStock => quantity <= 0;
}

class BrowseProductSeller {
  final String? id;
  final String? businessName;

  const BrowseProductSeller({this.id, this.businessName});

  factory BrowseProductSeller.fromJson(Map<String, dynamic> json) {
    return BrowseProductSeller(
      id: json['id'] as String?,
      businessName: json['businessName'] as String?,
    );
  }
}

class ProductDetailModel {
  final String id;
  final String title;
  final String? description;
  final String priceCDF;
  final String? priceUSD;
  final String condition;
  final int quantity;
  final List<ProductImageModel> images;
  final List<ProductSpecification> specifications;
  final BrowseProductSeller seller;
  final ProductCategory? category;
  final List<BreadcrumbItem> breadcrumb;
  // City-first URL fields (API 2026-06-06). The detail endpoint returns `city`
  // as a nested object ({id, slug, name, province}) plus top-level slug /
  // shortCode / cityId. Mobile resolves by UUID; these are informational.
  final String? slug;
  final String? shortCode;
  final String? cityId;
  final String? citySlug;
  final String? cityName;

  const ProductDetailModel({
    required this.id,
    required this.title,
    this.description,
    required this.priceCDF,
    this.priceUSD,
    required this.condition,
    required this.quantity,
    this.images = const [],
    this.specifications = const [],
    required this.seller,
    this.category,
    this.breadcrumb = const [],
    this.slug,
    this.shortCode,
    this.cityId,
    this.citySlug,
    this.cityName,
  });

  factory ProductDetailModel.fromJson(Map<String, dynamic> json) {
    // Detail carries city as a nested object; fall back to flat fields if a
    // future response flattens it (parity-safe with the list shape).
    final city = json['city'] as Map<String, dynamic>?;
    return ProductDetailModel(
      id: json['id'] as String,
      title: json['title']?.toString() ?? '',
      description: json['description']?.toString(),
      priceCDF: json['priceCDF']?.toString() ?? '0',
      priceUSD: json['priceUSD']?.toString(),
      condition: json['condition'] as String? ?? 'NEW',
      quantity: json['quantity'] as int? ?? 0,
      images: json['images'] != null
          ? (json['images'] as List)
              .map((e) => ProductImageModel.fromJson(e as Map<String, dynamic>))
              .toList()
          : [],
      specifications: json['specifications'] != null
          ? (json['specifications'] as List)
              .map((e) =>
                  ProductSpecification.fromJson(e as Map<String, dynamic>))
              .toList()
          : [],
      seller: BrowseProductSeller.fromJson(
        json['seller'] as Map<String, dynamic>? ?? {},
      ),
      category: json['category'] != null
          ? ProductCategory.fromJson(json['category'] as Map<String, dynamic>)
          : null,
      breadcrumb: json['breadcrumb'] != null
          ? (json['breadcrumb'] as List)
              .map((e) => BreadcrumbItem.fromJson(e as Map<String, dynamic>))
              .toList()
          : [],
      slug: json['slug'] as String?,
      shortCode: json['shortCode'] as String?,
      cityId: json['cityId'] as String?,
      citySlug: (city?['slug'] ?? json['citySlug']) as String?,
      cityName: (city?['name'] ?? json['cityName']) as String?,
    );
  }

  bool get isLowStock => quantity > 0 && quantity < 5;
  bool get isOutOfStock => quantity <= 0;
}

class ProductSpecification {
  final String name;
  final String value;

  const ProductSpecification({required this.name, required this.value});

  factory ProductSpecification.fromJson(Map<String, dynamic> json) {
    return ProductSpecification(
      name: json['name']?.toString() ?? '',
      value: json['value']?.toString() ?? '',
    );
  }
}

class ProductCategory {
  final String id;
  final String name;

  const ProductCategory({required this.id, required this.name});

  factory ProductCategory.fromJson(Map<String, dynamic> json) {
    return ProductCategory(
      id: json['id'] as String,
      name: json['name']?.toString() ?? '',
    );
  }
}

class BreadcrumbItem {
  final String id;
  final String name;

  const BreadcrumbItem({required this.id, required this.name});

  factory BreadcrumbItem.fromJson(Map<String, dynamic> json) {
    return BreadcrumbItem(
      id: json['id'] as String,
      name: json['name']?.toString() ?? '',
    );
  }
}

class PaginationMeta {
  final String? nextCursor;
  final bool hasMore;
  final int total;

  const PaginationMeta({
    this.nextCursor,
    this.hasMore = false,
    this.total = 0,
  });

  factory PaginationMeta.fromJson(Map<String, dynamic> json) {
    return PaginationMeta(
      nextCursor: json['nextCursor'] as String?,
      hasMore: json['hasMore'] as bool? ?? false,
      total: json['total'] as int? ?? 0,
    );
  }
}
