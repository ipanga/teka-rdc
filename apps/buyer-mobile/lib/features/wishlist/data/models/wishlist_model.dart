class WishlistItemModel {
  final String id;
  final String productId;
  final String createdAt;
  final WishlistProductModel? product;

  const WishlistItemModel({
    required this.id,
    required this.productId,
    required this.createdAt,
    this.product,
  });

  factory WishlistItemModel.fromJson(Map<String, dynamic> json) {
    return WishlistItemModel(
      id: json['id'] as String,
      productId: json['productId'] as String? ?? '',
      createdAt: json['createdAt']?.toString() ?? '',
      product: json['product'] != null
          ? WishlistProductModel.fromJson(
              json['product'] as Map<String, dynamic>)
          : null,
    );
  }
}

class WishlistProductModel {
  final String id;
  final Map<String, dynamic> title;
  final String priceCDF;
  final String? priceUSD;
  final String condition;
  final int quantity;
  final String? image;
  final WishlistSellerModel? seller;
  final double? avgRating;
  final int? totalReviews;

  const WishlistProductModel({
    required this.id,
    required this.title,
    required this.priceCDF,
    this.priceUSD,
    required this.condition,
    required this.quantity,
    this.image,
    this.seller,
    this.avgRating,
    this.totalReviews,
  });

  factory WishlistProductModel.fromJson(Map<String, dynamic> json) {
    // Handle image: could be a string URL or an object with 'url'
    String? imageUrl;
    if (json['image'] is String) {
      imageUrl = json['image'] as String;
    } else if (json['image'] is Map) {
      imageUrl = (json['image'] as Map)['url'] as String?;
    } else if (json['images'] is List && (json['images'] as List).isNotEmpty) {
      final firstImage = (json['images'] as List).first;
      if (firstImage is Map) {
        imageUrl = firstImage['url'] as String?;
      } else if (firstImage is String) {
        imageUrl = firstImage;
      }
    }

    return WishlistProductModel(
      id: json['id'] as String,
      title: json['title'] is Map
          ? Map<String, dynamic>.from(json['title'] as Map)
          : {'fr': json['title']?.toString() ?? ''},
      priceCDF: json['priceCDF']?.toString() ?? '0',
      priceUSD: json['priceUSD']?.toString(),
      condition: json['condition'] as String? ?? 'NEW',
      quantity: json['quantity'] as int? ?? 0,
      image: imageUrl,
      seller: json['seller'] != null
          ? WishlistSellerModel.fromJson(
              json['seller'] as Map<String, dynamic>)
          : null,
      avgRating: json['avgRating'] is num
          ? (json['avgRating'] as num).toDouble()
          : double.tryParse(json['avgRating']?.toString() ?? ''),
      totalReviews: json['totalReviews'] as int?,
    );
  }

  String localizedTitle(String locale) {
    return title[locale] as String? ??
        title['fr'] as String? ??
        title['en'] as String? ??
        '';
  }

  bool get isOutOfStock => quantity <= 0;
}

class WishlistSellerModel {
  final String? businessName;

  const WishlistSellerModel({this.businessName});

  factory WishlistSellerModel.fromJson(Map<String, dynamic> json) {
    return WishlistSellerModel(
      businessName: json['businessName'] as String?,
    );
  }
}
