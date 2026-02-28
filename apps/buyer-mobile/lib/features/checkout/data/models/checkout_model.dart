class CheckoutRequest {
  final String deliveryAddressId;
  final String paymentMethod;
  final String idempotencyKey;
  final String? buyerNote;
  final String? mobileMoneyProvider;
  final String? payerPhone;

  const CheckoutRequest({
    required this.deliveryAddressId,
    required this.paymentMethod,
    required this.idempotencyKey,
    this.buyerNote,
    this.mobileMoneyProvider,
    this.payerPhone,
  });

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{
      'deliveryAddressId': deliveryAddressId,
      'paymentMethod': paymentMethod,
      'idempotencyKey': idempotencyKey,
    };
    if (buyerNote != null && buyerNote!.isNotEmpty) {
      json['buyerNote'] = buyerNote;
    }
    if (mobileMoneyProvider != null && mobileMoneyProvider!.isNotEmpty) {
      json['mobileMoneyProvider'] = mobileMoneyProvider;
    }
    if (payerPhone != null && payerPhone!.isNotEmpty) {
      json['payerPhone'] = payerPhone;
    }
    return json;
  }
}

class CheckoutResponse {
  final List<CheckoutOrderModel> orders;
  final String? checkoutGroupId;
  final bool paymentPending;

  const CheckoutResponse({
    required this.orders,
    this.checkoutGroupId,
    this.paymentPending = false,
  });

  factory CheckoutResponse.fromJson(Map<String, dynamic> json) {
    return CheckoutResponse(
      orders: json['orders'] != null
          ? (json['orders'] as List)
              .map((e) =>
                  CheckoutOrderModel.fromJson(e as Map<String, dynamic>))
              .toList()
          : [],
      checkoutGroupId: json['checkoutGroupId'] as String?,
      paymentPending: json['paymentPending'] as bool? ?? false,
    );
  }
}

class CheckoutOrderModel {
  final String id;
  final String orderNumber;
  final String status;
  final String paymentMethod;
  final String totalCDF;
  final String? totalUSD;
  final int itemCount;
  final bool paymentPending;
  final List<String>? externalReferences;

  const CheckoutOrderModel({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentMethod,
    required this.totalCDF,
    this.totalUSD,
    required this.itemCount,
    this.paymentPending = false,
    this.externalReferences,
  });

  factory CheckoutOrderModel.fromJson(Map<String, dynamic> json) {
    return CheckoutOrderModel(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as String? ?? '',
      status: json['status'] as String? ?? 'PENDING',
      paymentMethod: json['paymentMethod'] as String? ?? '',
      totalCDF: json['totalCDF']?.toString() ?? '0',
      totalUSD: json['totalUSD']?.toString(),
      itemCount: json['itemCount'] as int? ?? 0,
      paymentPending: json['paymentPending'] as bool? ?? false,
      externalReferences: json['externalReferences'] != null
          ? (json['externalReferences'] as List)
              .map((e) => e.toString())
              .toList()
          : null,
    );
  }
}

class AddressModel {
  final String id;
  final String? label;
  final String? recipientName;
  final String? recipientPhone;
  final String? province;
  final String? town;
  final String? neighborhood;
  final String? avenue;
  final String? details;
  final bool isDefault;

  const AddressModel({
    required this.id,
    this.label,
    this.recipientName,
    this.recipientPhone,
    this.province,
    this.town,
    this.neighborhood,
    this.avenue,
    this.details,
    this.isDefault = false,
  });

  factory AddressModel.fromJson(Map<String, dynamic> json) {
    return AddressModel(
      id: json['id'] as String,
      label: json['label'] as String?,
      recipientName: json['recipientName'] as String?,
      recipientPhone: json['recipientPhone'] as String?,
      province: json['province'] as String?,
      town: json['town'] as String?,
      neighborhood: json['neighborhood'] as String?,
      avenue: json['avenue'] as String?,
      details: json['details'] as String?,
      isDefault: json['isDefault'] as bool? ?? false,
    );
  }

  String get displayAddress {
    final parts = <String>[];
    if (avenue != null && avenue!.isNotEmpty) parts.add(avenue!);
    if (neighborhood != null && neighborhood!.isNotEmpty) {
      parts.add(neighborhood!);
    }
    if (town != null && town!.isNotEmpty) parts.add(town!);
    if (province != null && province!.isNotEmpty) parts.add(province!);
    return parts.join(', ');
  }

  String get displayRecipient {
    final parts = <String>[];
    if (recipientName != null && recipientName!.isNotEmpty) {
      parts.add(recipientName!);
    }
    if (recipientPhone != null && recipientPhone!.isNotEmpty) {
      parts.add(recipientPhone!);
    }
    return parts.join(' - ');
  }
}
