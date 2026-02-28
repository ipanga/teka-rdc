class ReviewBuyerModel {
  final String id;
  final String firstName;
  final String lastName;
  final String? avatar;

  const ReviewBuyerModel({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.avatar,
  });

  String get fullName => '$firstName $lastName';

  String get initials {
    final first = firstName.isNotEmpty ? firstName[0].toUpperCase() : '';
    final last = lastName.isNotEmpty ? lastName[0].toUpperCase() : '';
    return '$first$last';
  }

  factory ReviewBuyerModel.fromJson(Map<String, dynamic> json) {
    return ReviewBuyerModel(
      id: json['id'] as String? ?? '',
      firstName: json['firstName'] as String? ?? '',
      lastName: json['lastName'] as String? ?? '',
      avatar: json['avatar'] as String?,
    );
  }
}

class ReviewModel {
  final String id;
  final String productId;
  final String buyerId;
  final int rating;
  final String? text;
  final String status;
  final String createdAt;
  final ReviewBuyerModel? buyer;

  const ReviewModel({
    required this.id,
    required this.productId,
    required this.buyerId,
    required this.rating,
    this.text,
    required this.status,
    required this.createdAt,
    this.buyer,
  });

  DateTime get createdAtDate => DateTime.parse(createdAt);

  factory ReviewModel.fromJson(Map<String, dynamic> json) {
    final buyerRaw = json['buyer'] as Map<String, dynamic>?;

    return ReviewModel(
      id: json['id'] as String? ?? '',
      productId: json['productId'] as String? ?? '',
      buyerId: json['buyerId'] as String? ?? '',
      rating: json['rating'] as int? ?? 0,
      text: json['text'] as String?,
      status: json['status'] as String? ?? 'APPROVED',
      createdAt:
          json['createdAt'] as String? ?? DateTime.now().toIso8601String(),
      buyer: buyerRaw != null ? ReviewBuyerModel.fromJson(buyerRaw) : null,
    );
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
    final distRaw = json['distribution'];
    final Map<int, int> distribution = {};

    if (distRaw is Map) {
      for (final entry in distRaw.entries) {
        final key = int.tryParse(entry.key.toString());
        final value = entry.value is int
            ? entry.value as int
            : int.tryParse(entry.value.toString()) ?? 0;
        if (key != null) {
          distribution[key] = value;
        }
      }
    }

    // Ensure all ratings 1-5 are present
    for (int i = 1; i <= 5; i++) {
      distribution.putIfAbsent(i, () => 0);
    }

    return ReviewStatsModel(
      avgRating: (json['avgRating'] is num)
          ? (json['avgRating'] as num).toDouble()
          : double.tryParse(json['avgRating']?.toString() ?? '0') ?? 0.0,
      totalReviews: json['totalReviews'] as int? ?? 0,
      distribution: distribution,
    );
  }
}
