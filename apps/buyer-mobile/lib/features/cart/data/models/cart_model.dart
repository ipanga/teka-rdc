class CartModel {
  final String id;
  final String userId;
  final List<CartItemModel> items;
  final String createdAt;

  /// `totalCDF` as computed by the API (`CartService.serializeCart`: the
  /// promotional price when one is set, else the regular price, × quantity).
  /// This is the number the server will charge; the client-side sum in
  /// [totalCDF] exists only for optimistic updates and the offline snapshot.
  final String? serverTotalCDF;

  const CartModel({
    required this.id,
    required this.userId,
    this.items = const [],
    required this.createdAt,
    this.serverTotalCDF,
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
      serverTotalCDF: json['totalCDF']?.toString(),
    );
  }

  int get totalItems =>
      items.fold(0, (sum, item) => sum + item.quantity);

  /// Total in CDF centimes as a BigInt string: the API's figure when the
  /// payload carried one, else the same rule applied locally.
  String get totalCDF => serverTotalCDF ?? computeEffectiveTotalCDF(items);
}

/// Sum of `effectiveCDF × quantity` — the one place the client applies the
/// API's pricing rule (see [CartItemProduct.effectiveCDF]). BigInt so a large
/// cart never overflows on 32-bit platforms.
String computeEffectiveTotalCDF(List<CartItemModel> items) {
  var total = BigInt.zero;
  for (final item in items) {
    final unit = BigInt.tryParse(item.product.effectiveCDF) ?? BigInt.zero;
    total += unit * BigInt.from(item.quantity);
  }
  return total.toString();
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

  /// Line total at the charged (effective) unit price.
  String get subtotalCDF {
    final unitPrice = BigInt.tryParse(product.effectiveCDF) ?? BigInt.zero;
    return (unitPrice * BigInt.from(quantity)).toString();
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
  ///
  /// Mirrors the API, which charges `discountPriceCDF ?? priceCDF` and only
  /// ever stores a promo with `0 < discount < price`
  /// (`ProductsService.validateDiscount`). The extra range check here is
  /// defensive for stale cached payloads; it never widens the rule.
  String get effectiveCDF => hasDiscount ? discountPriceCDF! : priceCDF;
}
