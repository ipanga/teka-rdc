import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'models/notification_model.dart';

/// Buyer Notification Center API. All calls go through the shared Dio chain
/// (Rule 15 — never bypass api_client.dart). Mark-read calls are idempotent
/// server-side. Endpoints are JWT-protected (the auth interceptor attaches the
/// bearer); the Notification Center is auth-only.
class NotificationsRepository {
  final Dio _dio;
  NotificationsRepository(this._dio);

  Future<({List<NotificationModel> items, int unread})> getNotifications({
    int page = 1,
    int limit = 50,
  }) async {
    final res = await _dio.get(
      '/v1/notifications',
      queryParameters: {'page': page, 'limit': limit},
    );
    final body = res.data;
    // Envelope: { success, data: [...], meta: { unread, total, ... } }
    final Map<String, dynamic>? envelope =
        body is Map ? Map<String, dynamic>.from(body) : null;
    final rawList = (envelope?['data'] as List?) ?? const [];
    final meta = (envelope?['meta'] as Map?)?.cast<String, dynamic>();
    final unread = (meta?['unread'] as num?)?.toInt() ?? 0;
    return (
      items: rawList
          .map((e) => NotificationModel.fromJson(e as Map<String, dynamic>))
          .toList(growable: false),
      unread: unread,
    );
  }

  Future<int> getUnreadCount() async {
    final res = await _dio.get('/v1/notifications/unread-count');
    final body = res.data;
    final data = body is Map ? body['data'] : null;
    if (data is Map && data['unread'] is num) {
      return (data['unread'] as num).toInt();
    }
    return 0;
  }

  Future<void> markRead(String id) async {
    await _dio.patch('/v1/notifications/$id/read');
  }

  Future<void> markAllRead() async {
    await _dio.patch('/v1/notifications/read-all');
  }
}

final notificationsRepositoryProvider =
    Provider<NotificationsRepository>((ref) {
  return NotificationsRepository(ref.read(dioProvider));
});
