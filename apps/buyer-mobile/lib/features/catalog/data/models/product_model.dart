import '../../../../core/constants/stock.dart';

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

  Map<String, dynamic> toJson() => {
        'id': id,
        'url': url,
        'thumbnailUrl': thumbnailUrl,
        'displayOrder': displayOrder,
      };
}

class BrowseProductModel {
  final String id;
  final String title;
  final String priceCDF;
  final String? priceUSD;
  // Optional seller-set promotional price (centimes string). Effective price =
  // discountPriceCDF when valid (< priceCDF), else priceCDF.
  final String? discountPriceCDF;
  final String? discountPriceUSD;
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
  // Total delivered units. NOT shown publicly (removed 2026-07-26) — kept on
  // the model because it is the API's popularity sort key.
  final int unitsSold;
  // Rating social proof — stars render only when totalReviews > 0.
  final double avgRating;
  final int totalReviews;
  // Brand label, shown above the title on the card when present.
  final String? brandName;

  const BrowseProductModel({
    required this.id,
    required this.title,
    required this.priceCDF,
    this.priceUSD,
    this.discountPriceCDF,
    this.discountPriceUSD,
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
    this.unitsSold = 0,
    this.avgRating = 0,
    this.totalReviews = 0,
    this.brandName,
  });

  factory BrowseProductModel.fromJson(Map<String, dynamic> json) {
    return BrowseProductModel(
      id: json['id'] as String,
      title: json['title']?.toString() ?? '',
      priceCDF: json['priceCDF']?.toString() ?? '0',
      priceUSD: json['priceUSD']?.toString(),
      discountPriceCDF: json['discountPriceCDF']?.toString(),
      discountPriceUSD: json['discountPriceUSD']?.toString(),
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
      unitsSold: json['unitsSold'] as int? ?? 0,
      avgRating: (json['avgRating'] as num?)?.toDouble() ?? 0,
      totalReviews: json['totalReviews'] as int? ?? 0,
      brandName: (json['brand'] as Map<String, dynamic>?)?['name'] as String?,
    );
  }

  // `<= kLowStockThreshold`, not `< 5`: mobile previously disagreed with
  // buyer-web (which used <= 5), so a product with exactly 5 left showed as
  // low stock on the web and normal on mobile.
  bool get isLowStock => stockStatusFor(quantity) == StockStatus.lowStock;
  bool get isOutOfStock => stockStatusFor(quantity) == StockStatus.outOfStock;

  /// Whether a valid seller-set promotion is active (discount < regular price).
  bool get hasDiscount {
    final p = int.tryParse(priceCDF) ?? 0;
    final d = int.tryParse(discountPriceCDF ?? '') ?? 0;
    return p > 0 && d > 0 && d < p;
  }

  /// Effective (charged) centimes — the promo when valid, else the regular price.
  String get effectivePriceCDF => hasDiscount ? discountPriceCDF! : priceCDF;

  /// Discount percentage (0 when no promotion).
  int get discountPct {
    if (!hasDiscount) return 0;
    final p = int.tryParse(priceCDF) ?? 0;
    final d = int.tryParse(discountPriceCDF!) ?? 0;
    return ((p - d) / p * 100).round();
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'priceCDF': priceCDF,
        'priceUSD': priceUSD,
        'condition': condition,
        'quantity': quantity,
        'image': image?.toJson(),
        'seller': seller.toJson(),
        'categoryId': categoryId,
        'slug': slug,
        'shortCode': shortCode,
        'cityId': cityId,
        'citySlug': citySlug,
        'cityName': cityName,
        'unitsSold': unitsSold,
      };

  /// Build the lightweight card model from a PDP detail (for recently-viewed).
  factory BrowseProductModel.fromDetail(ProductDetailModel d) {
    return BrowseProductModel(
      id: d.id,
      title: d.title,
      priceCDF: d.priceCDF,
      priceUSD: d.priceUSD,
      condition: d.condition,
      quantity: d.quantity,
      image: d.images.isNotEmpty ? d.images.first : null,
      seller: d.seller,
      categoryId: d.category?.id,
      slug: d.slug,
      shortCode: d.shortCode,
      cityId: d.cityId,
      citySlug: d.citySlug,
      cityName: d.cityName,
      unitsSold: d.unitsSold,
    );
  }
}

/// Public seller shape. `verified` / `official` are derived by the API
/// (verificationStatus == VERIFIED; platform seller id) and are never inferred
/// here from the name or the account approval. Absent keys (older cached
/// payloads) read as false — nothing is ever shown by default.
class BrowseProductSeller {
  final String? id;
  final String? businessName;
  final bool verified;
  final bool official;

  const BrowseProductSeller({
    this.id,
    this.businessName,
    this.verified = false,
    this.official = false,
  });

  factory BrowseProductSeller.fromJson(Map<String, dynamic> json) {
    return BrowseProductSeller(
      id: json['id'] as String?,
      businessName: json['businessName'] as String?,
      verified: json['verified'] == true,
      official: json['official'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'businessName': businessName,
        'verified': verified,
        'official': official,
      };
}

class ProductDetailModel {
  final String id;
  final String title;
  final String? description;
  final String priceCDF;
  final String? priceUSD;
  final String? discountPriceCDF;
  final String? discountPriceUSD;
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
  final int unitsSold;

  const ProductDetailModel({
    required this.id,
    required this.title,
    this.description,
    required this.priceCDF,
    this.priceUSD,
    this.discountPriceCDF,
    this.discountPriceUSD,
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
    this.unitsSold = 0,
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
      discountPriceCDF: json['discountPriceCDF']?.toString(),
      discountPriceUSD: json['discountPriceUSD']?.toString(),
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
      unitsSold: json['unitsSold'] as int? ?? 0,
    );
  }

  // `<= kLowStockThreshold`, not `< 5`: mobile previously disagreed with
  // buyer-web (which used <= 5), so a product with exactly 5 left showed as
  // low stock on the web and normal on mobile.
  bool get isLowStock => stockStatusFor(quantity) == StockStatus.lowStock;
  bool get isOutOfStock => stockStatusFor(quantity) == StockStatus.outOfStock;

  bool get hasDiscount {
    final p = int.tryParse(priceCDF) ?? 0;
    final d = int.tryParse(discountPriceCDF ?? '') ?? 0;
    return p > 0 && d > 0 && d < p;
  }

  String get effectivePriceCDF => hasDiscount ? discountPriceCDF! : priceCDF;

  int get discountPct {
    if (!hasDiscount) return 0;
    final p = int.tryParse(priceCDF) ?? 0;
    final d = int.tryParse(discountPriceCDF!) ?? 0;
    return ((p - d) / p * 100).round();
  }

  /// Savings in centimes (0 when no promotion).
  int get savingsCentimes {
    if (!hasDiscount) return 0;
    return (int.tryParse(priceCDF) ?? 0) -
        (int.tryParse(discountPriceCDF!) ?? 0);
  }
}

class ProductSpecification {
  /// Human label ("Taille"). The API flattens `attribute.name` onto the spec;
  /// the nested fallback below keeps this model working against an API
  /// deployed before that change, where `name` was simply absent and every
  /// label rendered blank.
  final String name;
  final String value;

  const ProductSpecification({required this.name, required this.value});

  bool get isRenderable => name.isNotEmpty && value.isNotEmpty;

  factory ProductSpecification.fromJson(Map<String, dynamic> json) {
    final attribute = json['attribute'];
    final nestedName = attribute is Map<String, dynamic>
        ? attribute['name']?.toString()
        : null;
    return ProductSpecification(
      name: (json['name']?.toString().trim().isNotEmpty ?? false)
          ? json['name'].toString().trim()
          : (nestedName?.trim() ?? ''),
      value: json['value']?.toString().trim() ?? '',
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
