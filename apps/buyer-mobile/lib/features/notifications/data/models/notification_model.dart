/// A buyer in-app notification (the Notification Center feed). Mirrors the API
/// UserNotification shape returned by GET /v1/notifications.
class NotificationModel {
  final String id;
  final String type;
  final String title;
  final String body;
  final String? entityType;
  final String? entityId;
  final DateTime? readAt;
  final DateTime createdAt;

  const NotificationModel({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.entityType,
    this.entityId,
    this.readAt,
    required this.createdAt,
  });

  bool get isRead => readAt != null;

  /// go_router path to open when tapped: a product notification → the PDP
  /// (resolved by id); anything else stays on the center.
  String? get deepLinkPath {
    if ((type == 'PRODUCT_PROMO' || entityType == 'product') &&
        entityId != null &&
        entityId!.isNotEmpty) {
      return '/products/$entityId';
    }
    return null;
  }

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    return NotificationModel(
      id: json['id'] as String,
      type: json['type']?.toString() ?? 'BROADCAST',
      title: json['title']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      entityType: json['entityType'] as String?,
      entityId: json['entityId']?.toString(),
      readAt: json['readAt'] != null
          ? DateTime.tryParse(json['readAt'].toString())
          : null,
      createdAt:
          DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
              DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  NotificationModel copyWith({DateTime? readAt}) {
    return NotificationModel(
      id: id,
      type: type,
      title: title,
      body: body,
      entityType: entityType,
      entityId: entityId,
      readAt: readAt ?? this.readAt,
      createdAt: createdAt,
    );
  }
}
