class CartModel {
  final String id;
  final String userId;
  final List<CartItemModel> items;
  final String createdAt;

  const CartModel({
    required this.id,
    required this.userId,
    this.items = const [],
    required this.createdAt,
  });

  factory CartModel.fromJson(Map<String, dynamic> json) {
    return CartModel(
      id: json['id'] as String,
      userId: json['userId'] as String,
      items: json['items'] != null
          ? (json['items'] as List)
              .map((e) => CartItemModel.fromJson(e as Map<String, dynamic>))
              .toList()
          : [],
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }

  int get totalItems =>
      items.fold(0, (sum, item) => sum + item.quantity);

  /// Total in CDF centimes as BigInt string
  String get totalCDF {
    final total = items.fold<int>(
      0,
      (sum, item) =>
          sum +
          (int.tryParse(item.product.effectiveCDF) ?? 0) * item.quantity,
    );
    return total.toString();
  }
}

class CartItemModel {
  final String id;
  final String productId;
  final int quantity;
  final CartItemProduct product;

  const CartItemModel({
    required this.id,
    required this.productId,
    required this.quantity,
    required this.product,
  });

  factory CartItemModel.fromJson(Map<String, dynamic> json) {
    return CartItemModel(
      id: json['id'] as String,
      productId: json['productId'] as String,
      quantity: json['quantity'] as int? ?? 1,
      product: CartItemProduct.fromJson(
        json['product'] as Map<String, dynamic>? ?? {},
      ),
    );
  }

  String get subtotalCDF {
    final unitPrice = int.tryParse(product.effectiveCDF) ?? 0;
    return (unitPrice * quantity).toString();
  }
}

class CartItemProduct {
  final String title;
  final String priceCDF;
  final String? priceUSD;
  final String? discountPriceCDF;
  final int quantity; // stock quantity
  final String? thumbnailUrl;
  final String? sellerId;
  final String? sellerName;

  const CartItemProduct({
    required this.title,
    required this.priceCDF,
    this.priceUSD,
    this.discountPriceCDF,
    this.quantity = 0,
    this.thumbnailUrl,
    this.sellerId,
    this.sellerName,
  });

  factory CartItemProduct.fromJson(Map<String, dynamic> json) {
    return CartItemProduct(
      title: json['title']?.toString() ?? '',
      priceCDF: json['priceCDF']?.toString() ?? '0',
      priceUSD: json['priceUSD']?.toString(),
      discountPriceCDF: json['discountPriceCDF']?.toString(),
      quantity: json['quantity'] as int? ?? 0,
      thumbnailUrl: json['thumbnailUrl'] as String?,
      sellerId: json['sellerId'] as String?,
      sellerName: json['sellerName'] as String?,
    );
  }

  bool get hasDiscount {
    final p = int.tryParse(priceCDF) ?? 0;
    final d = int.tryParse(discountPriceCDF ?? '') ?? 0;
    return p > 0 && d > 0 && d < p;
  }

  /// Effective (charged) centimes — promo when valid, else the regular price.
  String get effectiveCDF => hasDiscount ? discountPriceCDF! : priceCDF;
}
