import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/conversation_model.dart';

class PaginatedConversationsResponse {
  final List<ConversationModel> items;
  final int total;
  final int page;
  final int limit;

  const PaginatedConversationsResponse({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  bool get hasMore => page * limit < total;
}

class MessagingRepository {
  final Dio _dio;

  MessagingRepository(this._dio);

  Future<PaginatedConversationsResponse> getConversations({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get(
      '/v1/conversations',
      queryParameters: {'page': page, 'limit': limit},
    );
    final data = response.data;
    final itemsRaw = data['data'] as List<dynamic>? ?? [];
    final meta = data['meta'] as Map<String, dynamic>? ?? {};

    final items = itemsRaw
        .map((e) => ConversationModel.fromJson(e as Map<String, dynamic>))
        .toList();

    return PaginatedConversationsResponse(
      items: items,
      total: meta['total'] as int? ?? items.length,
      page: meta['page'] as int? ?? page,
      limit: meta['limit'] as int? ?? limit,
    );
  }

  Future<List<MessageModel>> getMessages(
    String conversationId, {
    String? before,
    int limit = 30,
  }) async {
    final queryParams = <String, dynamic>{'limit': limit};
    if (before != null) {
      queryParams['before'] = before;
    }

    final response = await _dio.get(
      '/v1/conversations/$conversationId/messages',
      queryParameters: queryParams,
    );
    final data = response.data;
    final itemsRaw = data['data'] as List<dynamic>? ?? [];

    return itemsRaw
        .map((e) => MessageModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<MessageModel> sendMessage({
    required String conversationId,
    required String content,
  }) async {
    final response = await _dio.post(
      '/v1/messages',
      data: {
        'conversationId': conversationId,
        'content': content,
      },
    );
    return MessageModel.fromJson(
        response.data['data'] as Map<String, dynamic>);
  }

  Future<void> markAsRead(String conversationId) async {
    await _dio.post('/v1/conversations/$conversationId/read');
  }

  Future<int> getUnreadCount() async {
    final response = await _dio.get('/v1/messages/unread-count');
    final data = response.data['data'];
    if (data is Map<String, dynamic>) {
      return data['count'] as int? ?? 0;
    }
    if (data is int) return data;
    return 0;
  }
}

final messagingRepositoryProvider = Provider<MessagingRepository>((ref) {
  return MessagingRepository(ref.read(dioProvider));
});
