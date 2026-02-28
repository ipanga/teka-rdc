class ConversationModel {
  final String id;
  final String buyerId;
  final String sellerId;
  final String? lastMessageAt;
  final ConversationPartyModel? otherParty;
  final String? lastMessage;
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

  factory ConversationModel.fromJson(Map<String, dynamic> json) {
    return ConversationModel(
      id: json['id'] as String,
      buyerId: json['buyerId'] as String? ?? '',
      sellerId: json['sellerId'] as String? ?? '',
      lastMessageAt: json['lastMessageAt']?.toString(),
      otherParty: json['otherParty'] != null
          ? ConversationPartyModel.fromJson(
              json['otherParty'] as Map<String, dynamic>)
          : null,
      lastMessage: json['lastMessage'] as String?,
      unreadCount: json['unreadCount'] as int? ?? 0,
    );
  }
}

class ConversationPartyModel {
  final String id;
  final String? firstName;
  final String? lastName;
  final String? avatar;
  final ConversationSellerProfile? sellerProfile;

  const ConversationPartyModel({
    required this.id,
    this.firstName,
    this.lastName,
    this.avatar,
    this.sellerProfile,
  });

  factory ConversationPartyModel.fromJson(Map<String, dynamic> json) {
    return ConversationPartyModel(
      id: json['id'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      avatar: json['avatar'] as String?,
      sellerProfile: json['sellerProfile'] != null
          ? ConversationSellerProfile.fromJson(
              json['sellerProfile'] as Map<String, dynamic>)
          : null,
    );
  }

  String get displayName {
    if (sellerProfile?.businessName != null &&
        sellerProfile!.businessName!.isNotEmpty) {
      return sellerProfile!.businessName!;
    }
    final parts = <String>[];
    if (firstName != null && firstName!.isNotEmpty) parts.add(firstName!);
    if (lastName != null && lastName!.isNotEmpty) parts.add(lastName!);
    return parts.isNotEmpty ? parts.join(' ') : 'Vendeur';
  }
}

class ConversationSellerProfile {
  final String? businessName;

  const ConversationSellerProfile({this.businessName});

  factory ConversationSellerProfile.fromJson(Map<String, dynamic> json) {
    return ConversationSellerProfile(
      businessName: json['businessName'] as String?,
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

  factory MessageModel.fromJson(Map<String, dynamic> json) {
    return MessageModel(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String? ?? '',
      senderId: json['senderId'] as String? ?? '',
      content: json['content'] as String? ?? '',
      readAt: json['readAt']?.toString(),
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }

  bool get isRead => readAt != null;
}
