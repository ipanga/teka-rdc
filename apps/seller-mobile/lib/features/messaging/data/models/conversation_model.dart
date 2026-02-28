class ConversationPartyModel {
  final String id;
  final String firstName;
  final String lastName;
  final String? avatar;

  const ConversationPartyModel({
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

  factory ConversationPartyModel.fromJson(Map<String, dynamic> json) {
    return ConversationPartyModel(
      id: json['id'] as String? ?? '',
      firstName: json['firstName'] as String? ?? '',
      lastName: json['lastName'] as String? ?? '',
      avatar: json['avatar'] as String?,
    );
  }
}

class ConversationModel {
  final String id;
  final String buyerId;
  final String sellerId;
  final String? lastMessageAt;
  final ConversationPartyModel? otherParty;
  final MessageModel? lastMessage;
  final int unreadCount;

  const ConversationModel({
    required this.id,
    required this.buyerId,
    required this.sellerId,
    this.lastMessageAt,
    this.otherParty,
    this.lastMessage,
    this.unreadCount = 0,
  });

  DateTime? get lastMessageAtDate =>
      lastMessageAt != null ? DateTime.parse(lastMessageAt!) : null;

  factory ConversationModel.fromJson(Map<String, dynamic> json) {
    final otherPartyRaw = json['otherParty'] as Map<String, dynamic>?;
    final lastMessageRaw = json['lastMessage'] as Map<String, dynamic>?;

    return ConversationModel(
      id: json['id'] as String? ?? '',
      buyerId: json['buyerId'] as String? ?? '',
      sellerId: json['sellerId'] as String? ?? '',
      lastMessageAt: json['lastMessageAt'] as String?,
      otherParty: otherPartyRaw != null
          ? ConversationPartyModel.fromJson(otherPartyRaw)
          : null,
      lastMessage:
          lastMessageRaw != null ? MessageModel.fromJson(lastMessageRaw) : null,
      unreadCount: json['unreadCount'] as int? ?? 0,
    );
  }
}

class MessageModel {
  final String id;
  final String conversationId;
  final String senderId;
  final String content;
  final String? readAt;
  final String createdAt;

  const MessageModel({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.content,
    this.readAt,
    required this.createdAt,
  });

  DateTime get createdAtDate => DateTime.parse(createdAt);
  bool get isRead => readAt != null;

  factory MessageModel.fromJson(Map<String, dynamic> json) {
    return MessageModel(
      id: json['id'] as String? ?? '',
      conversationId: json['conversationId'] as String? ?? '',
      senderId: json['senderId'] as String? ?? '',
      content: json['content'] as String? ?? '',
      readAt: json['readAt'] as String?,
      createdAt:
          json['createdAt'] as String? ?? DateTime.now().toIso8601String(),
    );
  }
}
