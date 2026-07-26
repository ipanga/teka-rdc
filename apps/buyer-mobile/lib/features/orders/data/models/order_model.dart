class OrderModel {
  final String id;
  final String orderNumber;
  final String status;
  final String paymentMethod;
  final String paymentStatus;
  final String totalCDF;
  final String? totalUSD;
  final String subtotalCDF;
  final String? subtotalUSD;
  final String deliveryFeeCDF;
  final String? deliveryFeeUSD;
  final String? buyerNote;
  final String createdAt;
  final String? deliveredAt;
  final OrderSellerModel? seller;
  final List<OrderItemModel> items;
  final OrderAddressModel? deliveryAddress;
  final List<OrderStatusLogModel> statusLogs;
  final int itemCount;

  const OrderModel({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.totalCDF,
    this.totalUSD,
    required this.subtotalCDF,
    this.subtotalUSD,
    required this.deliveryFeeCDF,
    this.deliveryFeeUSD,
    this.buyerNote,
    required this.createdAt,
    this.deliveredAt,
    this.seller,
    this.items = const [],
    this.deliveryAddress,
    this.statusLogs = const [],
    required this.itemCount,
  });

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    return OrderModel(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as String? ?? '',
      status: json['status'] as String? ?? 'PENDING',
      paymentMethod: json['paymentMethod'] as String? ?? '',
      paymentStatus: json['paymentStatus'] as String? ?? 'PENDING',
      totalCDF: json['totalCDF']?.toString() ?? '0',
      totalUSD: json['totalUSD']?.toString(),
      subtotalCDF: json['subtotalCDF']?.toString() ?? '0',
      subtotalUSD: json['subtotalUSD']?.toString(),
      deliveryFeeCDF: json['deliveryFeeCDF']?.toString() ?? '0',
      deliveryFeeUSD: json['deliveryFeeUSD']?.toString(),
      buyerNote: json['buyerNote'] as String?,
      createdAt: json['createdAt']?.toString() ?? '',
      deliveredAt: json['deliveredAt']?.toString(),
      seller: json['seller'] != null
          ? OrderSellerModel.fromJson(json['seller'] as Map<String, dynamic>)
          : null,
      items: json['items'] != null
          ? (json['items'] as List)
              .map((e) => OrderItemModel.fromJson(e as Map<String, dynamic>))
              .toList()
          : [],
      deliveryAddress: json['deliveryAddress'] != null
          ? OrderAddressModel.fromJson(
              json['deliveryAddress'] as Map<String, dynamic>)
          : null,
      statusLogs: json['statusLogs'] != null
          ? (json['statusLogs'] as List)
              .map((e) =>
                  OrderStatusLogModel.fromJson(e as Map<String, dynamic>))
              .toList()
          : [],
      itemCount: json['itemCount'] as int? ??
          (json['items'] != null ? (json['items'] as List).length : 0),
    );
  }
}

class OrderItemModel {
  final String id;
  final String productId;
  final String productTitle;
  final String? productImage;
  final int quantity;
  final String unitPriceCDF;
  final String? unitPriceUSD;
  final String totalCDF;
  final String? totalUSD;
  // Live product link fields (from items[].product). shortCode → canonical PDP
  // identifier; status drives availability. Snapshots above stay authoritative.
  final String? productShortCode;
  final String? productStatus;

  const OrderItemModel({
    required this.id,
    required this.productId,
    required this.productTitle,
    this.productImage,
    required this.quantity,
    required this.unitPriceCDF,
    this.unitPriceUSD,
    required this.totalCDF,
    this.totalUSD,
    this.productShortCode,
    this.productStatus,
  });

  /// Identifier to open the PDP (`/products/:id`) — **display only**.
  /// Prefers the canonical shortCode so the route matches the public web URL.
  /// Null when the product is no longer available.
  ///
  /// Never pass this to an API: reviews and wishlist endpoints are
  /// `ParseUUIDPipe` and reject a shortCode with a 400. Use [productReviewId]
  /// (or the PDP's resolved `product.id`) for anything API-bound.
  String? get productLinkId {
    if (productStatus != null && productStatus != 'ACTIVE') return null;
    return productShortCode ?? (productId.isNotEmpty ? productId : null);
  }

  /// The product's uuid, for API-bound navigation such as the rating screen
  /// (`/products/:id/reviews`). Null when the order item predates the
  /// `productId` field or the product is unavailable.
  String? get productReviewId {
    if (productStatus != null && productStatus != 'ACTIVE') return null;
    return productId.isNotEmpty ? productId : null;
  }

  factory OrderItemModel.fromJson(Map<String, dynamic> json) {
    final product = json['product'] as Map<String, dynamic>?;
    return OrderItemModel(
      id: json['id'] as String,
      productId: json['productId'] as String? ?? '',
      productTitle: json['productTitle']?.toString() ?? '',
      productImage: json['productImage'] as String?,
      quantity: json['quantity'] as int? ?? 1,
      unitPriceCDF: json['unitPriceCDF']?.toString() ?? '0',
      unitPriceUSD: json['unitPriceUSD']?.toString(),
      totalCDF: json['totalCDF']?.toString() ?? '0',
      totalUSD: json['totalUSD']?.toString(),
      productShortCode: product?['shortCode'] as String?,
      productStatus: product?['status'] as String?,
    );
  }
}

class OrderSellerModel {
  final String id;
  final String? firstName;
  final String? lastName;
  final String? phone;
  final SellerProfileModel? sellerProfile;

  const OrderSellerModel({
    required this.id,
    this.firstName,
    this.lastName,
    this.phone,
    this.sellerProfile,
  });

  factory OrderSellerModel.fromJson(Map<String, dynamic> json) {
    return OrderSellerModel(
      id: json['id'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      phone: json['phone'] as String?,
      sellerProfile: json['sellerProfile'] != null
          ? SellerProfileModel.fromJson(
              json['sellerProfile'] as Map<String, dynamic>)
          : null,
    );
  }
}

class SellerProfileModel {
  final String? businessName;
  final String? location;

  const SellerProfileModel({
    this.businessName,
    this.location,
  });

  factory SellerProfileModel.fromJson(Map<String, dynamic> json) {
    return SellerProfileModel(
      businessName: json['businessName'] as String?,
      location: json['location'] as String?,
    );
  }
}

class OrderAddressModel {
  final String? label;
  final String province;
  final String town;
  final String neighborhood;
  final String? avenue;
  final String? reference;
  final String? recipientName;
  final String? recipientPhone;

  const OrderAddressModel({
    this.label,
    required this.province,
    required this.town,
    required this.neighborhood,
    this.avenue,
    this.reference,
    this.recipientName,
    this.recipientPhone,
  });

  factory OrderAddressModel.fromJson(Map<String, dynamic> json) {
    return OrderAddressModel(
      label: json['label'] as String?,
      province: json['province'] as String? ?? '',
      town: json['town'] as String? ?? '',
      neighborhood: json['neighborhood'] as String? ?? '',
      avenue: json['avenue'] as String?,
      reference: json['reference'] as String?,
      recipientName: json['recipientName'] as String?,
      recipientPhone: json['recipientPhone'] as String?,
    );
  }

  String get displayAddress {
    final parts = <String>[];
    if (avenue != null && avenue!.isNotEmpty) parts.add(avenue!);
    if (neighborhood.isNotEmpty) parts.add(neighborhood);
    if (town.isNotEmpty) parts.add(town);
    if (province.isNotEmpty) parts.add(province);
    return parts.join(', ');
  }
}

class OrderStatusLogModel {
  final String id;
  final String? fromStatus;
  final String toStatus;
  final String? note;
  final String createdAt;

  const OrderStatusLogModel({
    required this.id,
    this.fromStatus,
    required this.toStatus,
    this.note,
    required this.createdAt,
  });

  factory OrderStatusLogModel.fromJson(Map<String, dynamic> json) {
    return OrderStatusLogModel(
      id: json['id'] as String,
      fromStatus: json['fromStatus'] as String?,
      toStatus: json['toStatus'] as String? ?? '',
      note: json['note'] as String?,
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }
}
