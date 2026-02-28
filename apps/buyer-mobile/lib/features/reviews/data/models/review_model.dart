class ReviewModel {
  final String id;
  final String productId;
  final String buyerId;
  final String orderId;
  final int rating;
  final String? text;
  final String status;
  final String createdAt;
  final ReviewBuyerModel? buyer;

  const ReviewModel({
    required this.id,
    required this.productId,
    required this.buyerId,
    required this.orderId,
    required this.rating,
    this.text,
    required this.status,
    required this.createdAt,
    this.buyer,
  });

  factory ReviewModel.fromJson(Map<String, dynamic> json) {
    return ReviewModel(
      id: json['id'] as String,
      productId: json['productId'] as String? ?? '',
      buyerId: json['buyerId'] as String? ?? '',
      orderId: json['orderId'] as String? ?? '',
      rating: json['rating'] as int? ?? 0,
      text: json['text'] as String?,
      status: json['status'] as String? ?? 'APPROVED',
      createdAt: json['createdAt']?.toString() ?? '',
      buyer: json['buyer'] != null
          ? ReviewBuyerModel.fromJson(json['buyer'] as Map<String, dynamic>)
          : null,
    );
  }
}

class ReviewBuyerModel {
  final String id;
  final String? firstName;
  final String? lastName;
  final String? avatar;

  const ReviewBuyerModel({
    required this.id,
    this.firstName,
    this.lastName,
    this.avatar,
  });

  factory ReviewBuyerModel.fromJson(Map<String, dynamic> json) {
    return ReviewBuyerModel(
      id: json['id'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      avatar: json['avatar'] as String?,
    );
  }

  String get displayName {
    final parts = <String>[];
    if (firstName != null && firstName!.isNotEmpty) parts.add(firstName!);
    if (lastName != null && lastName!.isNotEmpty) parts.add(lastName!);
    return parts.isNotEmpty ? parts.join(' ') : 'Acheteur';
  }
}

class ReviewStatsModel {
  final double avgRating;
  final int totalReviews;
  final Map<int, int> distribution;

  const ReviewStatsModel({
    required this.avgRating,
    required this.totalReviews,
    required this.distribution,
  });

  factory ReviewStatsModel.fromJson(Map<String, dynamic> json) {
    final rawDist = json['distribution'];
    final Map<int, int> dist = {};

    if (rawDist is Map) {
      for (final entry in rawDist.entries) {
        final key = int.tryParse(entry.key.toString());
        final value = entry.value is int
            ? entry.value as int
            : int.tryParse(entry.value.toString()) ?? 0;
        if (key != null) {
          dist[key] = value;
        }
      }
    }

    // Ensure all 1-5 keys exist
    for (var i = 1; i <= 5; i++) {
      dist.putIfAbsent(i, () => 0);
    }

    return ReviewStatsModel(
      avgRating: (json['avgRating'] is num
              ? (json['avgRating'] as num).toDouble()
              : double.tryParse(json['avgRating']?.toString() ?? '0')) ??
          0.0,
      totalReviews: json['totalReviews'] as int? ?? 0,
      distribution: dist,
    );
  }
}

class CanReviewModel {
  final bool canReview;
  final String? reason;
  final String? orderId;

  const CanReviewModel({
    required this.canReview,
    this.reason,
    this.orderId,
  });

  factory CanReviewModel.fromJson(Map<String, dynamic> json) {
    return CanReviewModel(
      canReview: json['canReview'] as bool? ?? false,
      reason: json['reason'] as String?,
      orderId: json['orderId'] as String?,
    );
  }
}
