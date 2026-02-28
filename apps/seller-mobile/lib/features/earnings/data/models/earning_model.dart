class SellerWallet {
  final String balanceCDF;
  final String totalEarnedCDF;
  final String totalCommissionCDF;
  final String pendingPayoutCDF;

  const SellerWallet({
    required this.balanceCDF,
    required this.totalEarnedCDF,
    required this.totalCommissionCDF,
    required this.pendingPayoutCDF,
  });

  int get balanceCDFDisplay {
    final centimes = int.tryParse(balanceCDF) ?? 0;
    return centimes ~/ 100;
  }

  int get totalEarnedCDFDisplay {
    final centimes = int.tryParse(totalEarnedCDF) ?? 0;
    return centimes ~/ 100;
  }

  int get totalCommissionCDFDisplay {
    final centimes = int.tryParse(totalCommissionCDF) ?? 0;
    return centimes ~/ 100;
  }

  int get pendingPayoutCDFDisplay {
    final centimes = int.tryParse(pendingPayoutCDF) ?? 0;
    return centimes ~/ 100;
  }

  factory SellerWallet.fromJson(Map<String, dynamic> json) {
    return SellerWallet(
      balanceCDF: json['balanceCDF']?.toString() ?? '0',
      totalEarnedCDF: json['totalEarnedCDF']?.toString() ?? '0',
      totalCommissionCDF: json['totalCommissionCDF']?.toString() ?? '0',
      pendingPayoutCDF: json['pendingPayoutCDF']?.toString() ?? '0',
    );
  }
}

class SellerEarningModel {
  final String id;
  final String orderId;
  final String grossAmountCDF;
  final String commissionCDF;
  final String netAmountCDF;
  final String commissionRate;
  final bool isPaid;
  final String? orderNumber;
  final String createdAt;

  const SellerEarningModel({
    required this.id,
    required this.orderId,
    required this.grossAmountCDF,
    required this.commissionCDF,
    required this.netAmountCDF,
    required this.commissionRate,
    required this.isPaid,
    this.orderNumber,
    required this.createdAt,
  });

  int get grossAmountCDFDisplay {
    final centimes = int.tryParse(grossAmountCDF) ?? 0;
    return centimes ~/ 100;
  }

  int get commissionCDFDisplay {
    final centimes = int.tryParse(commissionCDF) ?? 0;
    return centimes ~/ 100;
  }

  int get netAmountCDFDisplay {
    final centimes = int.tryParse(netAmountCDF) ?? 0;
    return centimes ~/ 100;
  }

  double get commissionRateDisplay {
    return double.tryParse(commissionRate) ?? 0;
  }

  DateTime get createdAtDate {
    return DateTime.parse(createdAt);
  }

  factory SellerEarningModel.fromJson(Map<String, dynamic> json) {
    // Try to get order number from nested order object or direct field
    String? orderNumber;
    final orderRaw = json['order'] as Map<String, dynamic>?;
    if (json['orderNumber'] is String) {
      orderNumber = json['orderNumber'] as String;
    } else if (orderRaw != null && orderRaw['orderNumber'] is String) {
      orderNumber = orderRaw['orderNumber'] as String;
    }

    return SellerEarningModel(
      id: json['id'] as String? ?? '',
      orderId: json['orderId'] as String? ?? '',
      grossAmountCDF: json['grossAmountCDF']?.toString() ?? '0',
      commissionCDF: json['commissionCDF']?.toString() ?? '0',
      netAmountCDF: json['netAmountCDF']?.toString() ?? '0',
      commissionRate: json['commissionRate']?.toString() ?? '0',
      isPaid: json['isPaid'] as bool? ?? false,
      orderNumber: orderNumber,
      createdAt:
          json['createdAt'] as String? ?? DateTime.now().toIso8601String(),
    );
  }
}

class PayoutModel {
  final String id;
  final String amountCDF;
  final String status;
  final String payoutMethod;
  final String payoutPhone;
  final String? rejectionReason;
  final String requestedAt;
  final String? processedAt;
  final String createdAt;

  const PayoutModel({
    required this.id,
    required this.amountCDF,
    required this.status,
    required this.payoutMethod,
    required this.payoutPhone,
    this.rejectionReason,
    required this.requestedAt,
    this.processedAt,
    required this.createdAt,
  });

  int get amountCDFDisplay {
    final centimes = int.tryParse(amountCDF) ?? 0;
    return centimes ~/ 100;
  }

  DateTime get requestedAtDate {
    return DateTime.parse(requestedAt);
  }

  DateTime? get processedAtDate {
    if (processedAt == null) return null;
    return DateTime.parse(processedAt!);
  }

  DateTime get createdAtDate {
    return DateTime.parse(createdAt);
  }

  factory PayoutModel.fromJson(Map<String, dynamic> json) {
    return PayoutModel(
      id: json['id'] as String? ?? '',
      amountCDF: json['amountCDF']?.toString() ?? '0',
      status: json['status'] as String? ?? 'REQUESTED',
      payoutMethod: json['payoutMethod'] as String? ?? '',
      payoutPhone: json['payoutPhone'] as String? ?? '',
      rejectionReason: json['rejectionReason'] as String?,
      requestedAt: json['requestedAt'] as String? ??
          json['createdAt'] as String? ??
          DateTime.now().toIso8601String(),
      processedAt: json['processedAt'] as String?,
      createdAt:
          json['createdAt'] as String? ?? DateTime.now().toIso8601String(),
    );
  }
}
