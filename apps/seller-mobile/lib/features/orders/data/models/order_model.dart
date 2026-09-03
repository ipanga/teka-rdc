enum OrderStatus {
  pending,
  confirmed,
  processing,
  readyForTekaPickup,
  receivedAtTeka,
  shipped,
  outForDelivery,
  delivered,
  cancelled,
  returned,
}

OrderStatus parseOrderStatus(String? status) {
  switch (status?.toUpperCase()) {
    case 'PENDING':
      return OrderStatus.pending;
    case 'CONFIRMED':
      return OrderStatus.confirmed;
    case 'PROCESSING':
      return OrderStatus.processing;
    case 'READY_FOR_TEKA_PICKUP':
      return OrderStatus.readyForTekaPickup;
    case 'RECEIVED_AT_TEKA':
      return OrderStatus.receivedAtTeka;
    case 'SHIPPED':
      return OrderStatus.shipped;
    case 'OUT_FOR_DELIVERY':
      return OrderStatus.outForDelivery;
    case 'DELIVERED':
      return OrderStatus.delivered;
    case 'CANCELLED':
      return OrderStatus.cancelled;
    case 'RETURNED':
      return OrderStatus.returned;
    default:
      return OrderStatus.pending;
  }
}

String orderStatusToApi(OrderStatus status) {
  switch (status) {
    case OrderStatus.pending:
      return 'PENDING';
    case OrderStatus.confirmed:
      return 'CONFIRMED';
    case OrderStatus.processing:
      return 'PROCESSING';
    case OrderStatus.readyForTekaPickup:
      return 'READY_FOR_TEKA_PICKUP';
    case OrderStatus.receivedAtTeka:
      return 'RECEIVED_AT_TEKA';
    case OrderStatus.shipped:
      return 'SHIPPED';
    case OrderStatus.outForDelivery:
      return 'OUT_FOR_DELIVERY';
    case OrderStatus.delivered:
      return 'DELIVERED';
    case OrderStatus.cancelled:
      return 'CANCELLED';
    case OrderStatus.returned:
      return 'RETURNED';
  }
}

class OrderBuyerModel {
  final String id;
  final String firstName;
  final String lastName;
  final String phone;

  const OrderBuyerModel({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.phone,
  });

  String get fullName => '$firstName $lastName';

  factory OrderBuyerModel.fromJson(Map<String, dynamic> json) {
    return OrderBuyerModel(
      id: json['id'] as String? ?? '',
      firstName: json['firstName'] as String? ?? '',
      lastName: json['lastName'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
    );
  }
}

class OrderAddressModel {
  final String? town;
  final String? neighborhood;
  final String? avenue;
  final String? reference;
  final String? recipientName;
  final String? recipientPhone;

  const OrderAddressModel({
    this.town,
    this.neighborhood,
    this.avenue,
    this.reference,
    this.recipientName,
    this.recipientPhone,
  });

  String get formattedAddress {
    final parts = <String>[];
    if (avenue != null && avenue!.isNotEmpty) parts.add(avenue!);
    if (neighborhood != null && neighborhood!.isNotEmpty) {
      parts.add(neighborhood!);
    }
    if (town != null && town!.isNotEmpty) parts.add(town!);
    return parts.join(', ');
  }

  factory OrderAddressModel.fromJson(Map<String, dynamic> json) {
    // Handle nested town/neighborhood objects
    String? townName;
    final townRaw = json['town'];
    if (townRaw is Map<String, dynamic>) {
      townName = townRaw['name']?.toString();
    } else if (townRaw is String) {
      townName = townRaw;
    }

    String? neighborhoodName;
    final neighborhoodRaw = json['neighborhood'];
    if (neighborhoodRaw is Map<String, dynamic>) {
      neighborhoodName = neighborhoodRaw['name']?.toString();
    } else if (neighborhoodRaw is String) {
      neighborhoodName = neighborhoodRaw;
    }

    return OrderAddressModel(
      town: townName,
      neighborhood: neighborhoodName,
      avenue: json['avenue'] as String?,
      reference: json['reference'] as String?,
      recipientName: json['recipientName'] as String?,
      recipientPhone: json['recipientPhone'] as String?,
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
  final String totalCDF;

  const OrderItemModel({
    required this.id,
    required this.productId,
    required this.productTitle,
    this.productImage,
    required this.quantity,
    required this.unitPriceCDF,
    required this.totalCDF,
  });

  int get unitPriceCDFDisplay {
    final centimes = int.tryParse(unitPriceCDF) ?? 0;
    return centimes ~/ 100;
  }

  int get totalCDFDisplay {
    final centimes = int.tryParse(totalCDF) ?? 0;
    return centimes ~/ 100;
  }

  factory OrderItemModel.fromJson(Map<String, dynamic> json) {
    // Try to extract product title from nested product object or direct field.
    // Both are plain strings post-monolingual refactor (May 2026).
    final productRaw = json['product'] as Map<String, dynamic>?;
    final titleStr =
        (json['productTitle'] ?? productRaw?['title'])?.toString() ?? '';
    final imageRaw = json['productImage'] ?? productRaw?['coverImageUrl'];

    // Try to get image from product images array
    String? imageUrl;
    if (imageRaw is String) {
      imageUrl = imageRaw;
    } else if (productRaw != null && productRaw['images'] is List) {
      final images = productRaw['images'] as List;
      if (images.isNotEmpty) {
        final firstImage = images.first;
        if (firstImage is Map<String, dynamic>) {
          imageUrl = firstImage['url'] as String? ??
              firstImage['thumbnailUrl'] as String?;
        }
      }
    }

    return OrderItemModel(
      id: json['id'] as String? ?? '',
      productId:
          json['productId'] as String? ?? productRaw?['id'] as String? ?? '',
      productTitle: titleStr,
      productImage: imageUrl,
      quantity: json['quantity'] as int? ?? 1,
      unitPriceCDF: json['unitPriceCDF']?.toString() ??
          json['unitPrice']?.toString() ??
          '0',
      totalCDF:
          json['totalCDF']?.toString() ?? json['total']?.toString() ?? '0',
    );
  }
}

class OrderStatusLogModel {
  final String id;
  final String? fromStatus;
  final String toStatus;
  final String? note;
  final DateTime createdAt;

  const OrderStatusLogModel({
    required this.id,
    this.fromStatus,
    required this.toStatus,
    this.note,
    required this.createdAt,
  });

  OrderStatus get toOrderStatus => parseOrderStatus(toStatus);
  OrderStatus? get fromOrderStatus =>
      fromStatus != null ? parseOrderStatus(fromStatus) : null;

  factory OrderStatusLogModel.fromJson(Map<String, dynamic> json) {
    return OrderStatusLogModel(
      id: json['id'] as String? ?? '',
      fromStatus: json['fromStatus'] as String?,
      toStatus: json['toStatus'] as String? ?? 'PENDING',
      note: json['note'] as String?,
      createdAt: DateTime.parse(
          json['createdAt'] as String? ?? DateTime.now().toIso8601String()),
    );
  }
}

class SellerOrderModel {
  final String id;
  final String orderNumber;
  final OrderStatus status;
  final String? paymentMethod;
  final String? paymentStatus;
  final String totalCDF;
  final String? totalUSD;
  final String subtotalCDF;
  final String deliveryFeeCDF;
  final DateTime createdAt;
  final OrderBuyerModel? buyer;
  final int itemCount;
  final List<OrderItemModel> items;
  final OrderAddressModel? deliveryAddress;
  final List<OrderStatusLogModel> statusLogs;
  final String? buyerNote;
  final OrderFinancials? financials;

  const SellerOrderModel({
    required this.id,
    required this.orderNumber,
    required this.status,
    this.paymentMethod,
    this.paymentStatus,
    required this.totalCDF,
    this.totalUSD,
    required this.subtotalCDF,
    required this.deliveryFeeCDF,
    required this.createdAt,
    this.buyer,
    required this.itemCount,
    this.items = const [],
    this.deliveryAddress,
    this.statusLogs = const [],
    this.buyerNote,
    this.financials,
  });

  int get totalCDFDisplay {
    final centimes = int.tryParse(totalCDF) ?? 0;
    return centimes ~/ 100;
  }

  double? get totalUSDDisplay {
    if (totalUSD == null) return null;
    final centimes = int.tryParse(totalUSD!) ?? 0;
    return centimes / 100;
  }

  int get subtotalCDFDisplay {
    final centimes = int.tryParse(subtotalCDF) ?? 0;
    return centimes ~/ 100;
  }

  int get deliveryFeeCDFDisplay {
    final centimes = int.tryParse(deliveryFeeCDF) ?? 0;
    return centimes ~/ 100;
  }

  factory SellerOrderModel.fromJson(Map<String, dynamic> json) {
    final itemsRaw = json['items'] as List<dynamic>?;
    final items = itemsRaw
            ?.map((e) => OrderItemModel.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];

    final statusLogsRaw = json['statusLogs'] as List<dynamic>?;
    final statusLogs = statusLogsRaw
            ?.map(
                (e) => OrderStatusLogModel.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    // Sort status logs by date
    statusLogs.sort((a, b) => a.createdAt.compareTo(b.createdAt));

    final buyerRaw = json['buyer'] as Map<String, dynamic>?;
    final addressRaw = json['deliveryAddress'] as Map<String, dynamic>? ??
        json['address'] as Map<String, dynamic>?;

    return SellerOrderModel(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as String? ?? '',
      status: parseOrderStatus(json['status'] as String?),
      paymentMethod: json['paymentMethod'] as String?,
      paymentStatus: json['paymentStatus'] as String?,
      totalCDF: json['totalCDF']?.toString() ?? '0',
      totalUSD: json['totalUSD']?.toString(),
      subtotalCDF: json['subtotalCDF']?.toString() ??
          json['subtotal']?.toString() ??
          '0',
      deliveryFeeCDF: json['deliveryFeeCDF']?.toString() ??
          json['deliveryFee']?.toString() ??
          '0',
      createdAt: DateTime.parse(
          json['createdAt'] as String? ?? DateTime.now().toIso8601String()),
      buyer: buyerRaw != null ? OrderBuyerModel.fromJson(buyerRaw) : null,
      itemCount: json['itemCount'] as int? ??
          json['_count']?['items'] as int? ??
          items.length,
      items: items,
      deliveryAddress:
          addressRaw != null ? OrderAddressModel.fromJson(addressRaw) : null,
      statusLogs: statusLogs,
      buyerNote: json['buyerNote'] as String? ?? json['note'] as String?,
      financials: json['financials'] is Map<String, dynamic>
          ? OrderFinancials.fromJson(json['financials'] as Map<String, dynamic>)
          : null,
    );
  }
}

/// Seller revenue breakdown for an order: gross (subtotal), Teka commission,
/// and the net "à recevoir". `isFinal` once delivered (persisted earning);
/// otherwise a projection from the current rate. All *CDF are centimes strings.
class OrderFinancials {
  final String grossCDF;
  final String commissionCDF;
  final String netCDF;
  final String commissionRate; // decimal string, e.g. "0.1"
  final bool isFinal;

  const OrderFinancials({
    required this.grossCDF,
    required this.commissionCDF,
    required this.netCDF,
    required this.commissionRate,
    required this.isFinal,
  });

  /// Commission percentage for display, e.g. 0.1 -> 10.
  int get commissionPercent =>
      ((double.tryParse(commissionRate) ?? 0) * 100).round();

  factory OrderFinancials.fromJson(Map<String, dynamic> json) {
    return OrderFinancials(
      grossCDF: json['grossCDF']?.toString() ?? '0',
      commissionCDF: json['commissionCDF']?.toString() ?? '0',
      netCDF: json['netCDF']?.toString() ?? '0',
      commissionRate: json['commissionRate']?.toString() ?? '0',
      isFinal: json['isFinal'] as bool? ?? false,
    );
  }
}

/// Unknown route filters mean all items, never an arbitrary actionable status.
OrderStatus? orderStatusFromQuery(String? value) {
  for (final status in OrderStatus.values) {
    if (orderStatusToApi(status) == value) return status;
  }
  return null;
}
