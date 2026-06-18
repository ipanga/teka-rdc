import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'notification_model.dart';

class NotificationsPage {
  final List<NotificationModel> items;
  final int unread;
  final int total;
  final int page;
  final int limit;

  const NotificationsPage({
    required this.items,
    required this.unread,
    required this.total,
    required this.page,
    required this.limit,
  });

  bool get hasMore => page * limit < total;
}

class NotificationsRepository {
  final Dio _dio;

  NotificationsRepository(this._dio);

  Future<NotificationsPage> getNotifications({
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get(
      '/v1/seller/notifications',
      queryParameters: {'page': page, 'limit': limit},
    );
    final data = response.data;
    final itemsRaw = data['data'] as List<dynamic>? ?? [];
    final meta = data['meta'] as Map<String, dynamic>? ?? {};
    return NotificationsPage(
      items: itemsRaw
          .map((e) => NotificationModel.fromJson(e as Map<String, dynamic>))
          .toList(),
      unread: meta['unread'] as int? ?? 0,
      total: meta['total'] as int? ?? itemsRaw.length,
      page: meta['page'] as int? ?? page,
      limit: meta['limit'] as int? ?? limit,
    );
  }

  Future<int> getUnreadCount() async {
    final response = await _dio.get('/v1/seller/notifications/unread-count');
    final data = response.data['data'] as Map<String, dynamic>? ?? {};
    return data['unread'] as int? ?? 0;
  }

  Future<void> markRead(String id) async {
    await _dio.patch('/v1/seller/notifications/$id/read');
  }

  Future<void> markAllRead() async {
    await _dio.patch('/v1/seller/notifications/read-all');
  }
}

final notificationsRepositoryProvider =
    Provider<NotificationsRepository>((ref) {
  return NotificationsRepository(ref.read(dioProvider));
});
