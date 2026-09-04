class SellerWallet {
  final String balanceCDF;
  final String pendingCDF;
  final String totalEarnedCDF;
  final String totalCommissionCDF;
  final String pendingPayoutCDF;

  const SellerWallet({
    required this.balanceCDF,
    this.pendingCDF = '0',
    required this.totalEarnedCDF,
    required this.totalCommissionCDF,
    required this.pendingPayoutCDF,
  });

  int get balanceCDFDisplay {
    final centimes = int.tryParse(balanceCDF) ?? 0;
    return centimes ~/ 100;
  }

  /// Held inside the 2-day return window (not yet withdrawable).
  int get pendingCDFDisplay {
    final centimes = int.tryParse(pendingCDF) ?? 0;
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
      pendingCDF: json['pendingCDF']?.toString() ?? '0',
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
  /// API-derived: HELD | AVAILABLE | RESERVED | PAID | REVERSED (null on
  /// older API responses → fall back to [isPaid]).
  final String? state;
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
    this.state,
    this.orderNumber,
    required this.createdAt,
  });

  /// Effective state, for labels: the API's word when present, else the
  /// historical paid / not-paid split.
  String get effectiveState {
    const known = {'HELD', 'AVAILABLE', 'RESERVED', 'PAID', 'REVERSED'};
    final s = state?.toUpperCase();
    if (s != null && known.contains(s)) return s;
    return isPaid ? 'PAID' : 'AVAILABLE';
  }

  /// "0.0825" → "8,25 %", "0.1" → "10 %" (defect 12: "0%" was shown).
  String get commissionRatePercentLabel {
    final s = commissionRate.trim();
    if (!RegExp(r'^\d+(\.\d+)?$').hasMatch(s)) return '—';
    final parts = s.split('.');
    final frac = (parts.length > 1 ? parts[1] : '');
    final units = int.parse(parts[0]) * 10000 +
        int.parse('${frac}0000'.substring(0, 4));
    final whole = units ~/ 100;
    final hundredths = units % 100;
    if (hundredths == 0) return '$whole %';
    final h = hundredths.toString().padLeft(2, '0').replaceAll(RegExp(r'0$'), '');
    return '$whole,$h %';
  }

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
      state: json['state']?.toString(),
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
  final String? externalReference;
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
    this.externalReference,
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
      externalReference: json['externalReference'] as String?,
      requestedAt: json['requestedAt'] as String? ??
          json['createdAt'] as String? ??
          DateTime.now().toIso8601String(),
      processedAt: json['processedAt'] as String?,
      createdAt:
          json['createdAt'] as String? ?? DateTime.now().toIso8601String(),
    );
  }
}

/// Seller's saved reusable payout destination (B1).
class SellerPayoutMethod {
  final String? payoutMethod;
  final String? payoutPhone;

  const SellerPayoutMethod({this.payoutMethod, this.payoutPhone});

  factory SellerPayoutMethod.fromJson(Map<String, dynamic> json) {
    return SellerPayoutMethod(
      payoutMethod: json['payoutMethod'] as String?,
      payoutPhone: json['payoutPhone'] as String?,
    );
  }
}
