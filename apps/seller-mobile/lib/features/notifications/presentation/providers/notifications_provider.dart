import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/notification_model.dart';
import '../../data/notifications_repository.dart';

class NotificationsState {
  final List<NotificationModel> items;
  final int unread;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;
  final int page;
  final int total;
  final int limit;

  const NotificationsState({
    this.items = const [],
    this.unread = 0,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
    this.page = 1,
    this.total = 0,
    this.limit = 30,
  });

  bool get hasMore => page * limit < total;

  NotificationsState copyWith({
    List<NotificationModel>? items,
    int? unread,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    int? page,
    int? total,
    int? limit,
    bool clearError = false,
  }) {
    return NotificationsState(
      items: items ?? this.items,
      unread: unread ?? this.unread,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
      page: page ?? this.page,
      total: total ?? this.total,
      limit: limit ?? this.limit,
    );
  }
}

class NotificationsNotifier extends StateNotifier<NotificationsState> {
  final NotificationsRepository _repo;

  // Starts loading and does NOT auto-fetch. The first load is driven by
  // `notificationsProvider` once auth resolves — firing in the constructor races
  // token restoration on cold start (no bearer → 401 → the Centre de
  // notifications shows an error/empty feed until reload). See
  // sellerProductsProvider / dashboardStatsProvider.
  NotificationsNotifier(this._repo)
      : super(const NotificationsState(isLoading: true));

  Future<void> load() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final page = await _repo.getNotifications(page: 1, limit: state.limit);
      if (!mounted) return;
      state = state.copyWith(
        items: page.items,
        unread: page.unread,
        isLoading: false,
        page: page.page,
        total: page.total,
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(isLoading: false, error: friendlyErrorMessage(e));
    }
  }

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore) return;
    state = state.copyWith(isLoadingMore: true, clearError: true);
    try {
      final page = await _repo.getNotifications(
        page: state.page + 1,
        limit: state.limit,
      );
      if (!mounted) return;
      state = state.copyWith(
        items: [...state.items, ...page.items],
        unread: page.unread,
        isLoadingMore: false,
        page: page.page,
        total: page.total,
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoadingMore: false,
        error: friendlyErrorMessage(e),
      );
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
  final notifier =
      NotificationsNotifier(ref.read(notificationsRepositoryProvider));
  // Load off auth status, not the constructor — see sellerProductsProvider.
  // This is the most likely cause of the "empty Centre de notifications": the
  // feed fetched during an unauthenticated startup and cached an empty/error
  // result that never refreshed.
  ref.listen<AuthStatus>(authProvider.select((s) => s.status), (prev, next) {
    if (next == AuthStatus.authenticated && prev != AuthStatus.authenticated) {
      notifier.load();
    }
  }, fireImmediately: true);
  return notifier;
});
