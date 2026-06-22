import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../data/notification_model.dart';
import '../../data/notifications_repository.dart';

class NotificationsState {
  final List<NotificationModel> items;
  final int unread;
  final bool isLoading;
  final String? error;

  const NotificationsState({
    this.items = const [],
    this.unread = 0,
    this.isLoading = false,
    this.error,
  });

  NotificationsState copyWith({
    List<NotificationModel>? items,
    int? unread,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return NotificationsState(
      items: items ?? this.items,
      unread: unread ?? this.unread,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class NotificationsNotifier extends StateNotifier<NotificationsState> {
  final NotificationsRepository _repo;

  NotificationsNotifier(this._repo) : super(const NotificationsState()) {
    load();
  }

  Future<void> load() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final page = await _repo.getNotifications(page: 1, limit: 30);
      if (!mounted) return;
      state = state.copyWith(
        items: page.items,
        unread: page.unread,
        isLoading: false,
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(isLoading: false, error: friendlyErrorMessage(e));
    }
  }

  Future<void> markRead(String id) async {
    NotificationModel? target;
    for (final n in state.items) {
      if (n.id == id) {
        target = n;
        break;
      }
    }
    if (target == null || target.isRead) return;

    // Optimistic: flip read + decrement the badge, then fire the request.
    state = state.copyWith(
      items: [
        for (final n in state.items)
          n.id == id ? n.copyWith(readAt: DateTime.now()) : n,
      ],
      unread: state.unread > 0 ? state.unread - 1 : 0,
    );
    try {
      await _repo.markRead(id);
    } catch (_) {
      // Non-critical — the next load() reconciles.
    }
  }

  Future<void> markAllRead() async {
    if (state.unread == 0) return;
    state = state.copyWith(
      items: [
        for (final n in state.items)
          n.isRead ? n : n.copyWith(readAt: DateTime.now()),
      ],
      unread: 0,
    );
    try {
      await _repo.markAllRead();
    } catch (_) {
      // Non-critical — the next load() reconciles.
    }
  }
}

final notificationsProvider =
    StateNotifierProvider<NotificationsNotifier, NotificationsState>((ref) {
  return NotificationsNotifier(ref.read(notificationsRepositoryProvider));
});
