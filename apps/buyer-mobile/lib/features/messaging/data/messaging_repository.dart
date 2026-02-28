import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/conversation_model.dart';

class MessagingRepository {
  final Dio _dio;

  MessagingRepository(this._dio);

  Future<List<ConversationModel>> getConversations({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get(
      '/v1/conversations',
      queryParameters: {
        'page': page,
        'limit': limit,
      },
    );
    final responseData = response.data;

    final List<dynamic> rawList;
    if (responseData is Map && responseData['data'] != null) {
      rawList = responseData['data'] as List;
    } else if (responseData is List) {
      rawList = responseData;
    } else {
      rawList = [];
    }

    return rawList
        .map((e) => ConversationModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<MessageModel>> getMessages(
    String conversationId, {
    String? before,
    int limit = 30,
  }) async {
    final queryParams = <String, dynamic>{
      'limit': limit,
    };
    if (before != null && before.isNotEmpty) {
      queryParams['before'] = before;
    }

    final response = await _dio.get(
      '/v1/conversations/$conversationId/messages',
      queryParameters: queryParams,
    );
    final responseData = response.data;

    final List<dynamic> rawList;
    if (responseData is Map && responseData['data'] != null) {
      rawList = responseData['data'] as List;
    } else if (responseData is List) {
      rawList = responseData;
    } else {
      rawList = [];
    }

    return rawList
        .map((e) => MessageModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<MessageModel> sendMessage({
    String? conversationId,
    String? sellerId,
    required String content,
  }) async {
    final data = <String, dynamic>{
      'content': content,
    };
    if (conversationId != null && conversationId.isNotEmpty) {
      data['conversationId'] = conversationId;
    }
    if (sellerId != null && sellerId.isNotEmpty) {
      data['sellerId'] = sellerId;
    }

    final response = await _dio.post('/v1/messages', data: data);
    final responseData = response.data;

    final Map<String, dynamic> messageJson;
    if (responseData is Map && responseData['data'] != null) {
      messageJson = responseData['data'] as Map<String, dynamic>;
    } else if (responseData is Map) {
      messageJson = Map<String, dynamic>.from(responseData);
    } else {
      throw Exception('Invalid message response');
    }

    return MessageModel.fromJson(messageJson);
  }

  Future<void> markAsRead(String conversationId) async {
    await _dio.post('/v1/conversations/$conversationId/read');
  }

  Future<int> getUnreadCount() async {
    try {
      final response = await _dio.get('/v1/messages/unread-count');
      final responseData = response.data;

      if (responseData is Map && responseData['data'] != null) {
        final data = responseData['data'];
        if (data is Map) {
          return data['count'] as int? ?? 0;
        }
        if (data is int) return data;
      }
      if (responseData is Map && responseData['count'] != null) {
        return responseData['count'] as int? ?? 0;
      }
      return 0;
    } catch (_) {
      return 0;
    }
  }
}

final messagingRepositoryProvider = Provider<MessagingRepository>((ref) {
  return MessagingRepository(ref.read(dioProvider));
});
