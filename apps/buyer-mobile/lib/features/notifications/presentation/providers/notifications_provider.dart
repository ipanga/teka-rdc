import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/models/notification_model.dart';
import '../../data/notifications_repository.dart';

class NotificationsState {
  final List<NotificationModel> items;
  final bool isLoading;
  final String? error;

  const NotificationsState({
    this.items = const [],
    this.isLoading = false,
    this.error,
  });

  int get unreadCount => items.where((n) => !n.isRead).length;

  NotificationsState copyWith({
    List<NotificationModel>? items,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return NotificationsState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class NotificationsNotifier extends StateNotifier<NotificationsState> {
  final NotificationsRepository _repository;

  NotificationsNotifier(this._repository)
      : super(const NotificationsState(isLoading: true)) {
    loadNotifications();
  }

  Future<void> loadNotifications() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.getNotifications();
      state = state.copyWith(items: result.items, isLoading: false);
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        error: 'Une erreur est survenue. Veuillez réessayer.',
      );
    }
  }

  Future<void> refresh() => loadNotifications();

  /// Session ended (A4): the feed is per account.
  void reset() {
    state = const NotificationsState();
  }

  Future<void> markRead(String id) async {
    state = state.copyWith(
      items: [
        for (final n in state.items)
          n.id == id ? n.copyWith(readAt: DateTime.now()) : n,
      ],
    );
    try {
      await _repository.markRead(id);
    } catch (_) {
      // optimistic — a failed mark-read self-heals on next reload.
    }
  }

  Future<void> markAllRead() async {
    state = state.copyWith(
      items: [
        for (final n in state.items)
          n.isRead ? n : n.copyWith(readAt: DateTime.now()),
      ],
    );
    try {
      await _repository.markAllRead();
    } catch (_) {}
  }
}

final notificationsProvider =
    StateNotifierProvider<NotificationsNotifier, NotificationsState>((ref) {
  final notifier =
      NotificationsNotifier(ref.read(notificationsRepositoryProvider));
  // Account-scoped (A4): clear on logout, reload for the next account.
  ref.listen<AuthState>(authProvider, (prev, next) {
    final wasAuthed = prev?.status == AuthStatus.authenticated;
    final isAuthed = next.status == AuthStatus.authenticated;
    if (!isAuthed && wasAuthed) {
      notifier.reset();
    } else if (isAuthed && !wasAuthed && prev != null) {
      notifier.loadNotifications();
    }
  });
  return notifier;
});

/// Unread count for the home AppBar bell badge. Watched only when the buyer is
/// authenticated (the caller guards). Refresh by invalidating this provider.
final notificationUnreadCountProvider = FutureProvider<int>((ref) async {
  // Re-evaluated on every session change so a badge never carries over from
  // the previous account (A4); guests have no feed.
  final status = ref.watch(authProvider.select((s) => s.status));
  if (status != AuthStatus.authenticated) return 0;
  final repo = ref.read(notificationsRepositoryProvider);
  return repo.getUnreadCount();
});
