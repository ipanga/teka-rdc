import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/models/notification_model.dart';
import '../../data/notifications_repository.dart';

class NotificationsState {
  final List<NotificationModel> items;
  final bool isLoading;

  /// Last load failure (French, connectivity-aware). With items already
  /// loaded it is shown inline and the list stays; with none it is the
  /// screen's error state with a retry.
  final String? error;

  /// True once a load has completed (success or failure) in this session —
  /// distinguishes « Aucune notification » from « not loaded yet ».
  final bool hasLoaded;

  const NotificationsState({
    this.items = const [],
    this.isLoading = false,
    this.error,
    this.hasLoaded = false,
  });

  int get unreadCount => items.where((n) => !n.isRead).length;

  NotificationsState copyWith({
    List<NotificationModel>? items,
    bool? isLoading,
    String? error,
    bool? hasLoaded,
    bool clearError = false,
  }) {
    return NotificationsState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
      hasLoaded: hasLoaded ?? this.hasLoaded,
    );
  }
}

class NotificationsNotifier extends StateNotifier<NotificationsState> {
  final NotificationsRepository _repository;

  NotificationsNotifier(this._repository)
      : super(const NotificationsState(isLoading: true)) {
    loadNotifications();
  }

  /// Loads (or reloads) the feed. Items already on screen stay visible while
  /// the request runs and are KEPT on failure; the failure message is set
  /// alongside them (PR D, 2026-09-06 — a failed refresh used to leave a
  /// bare « Une erreur est survenue » with no retry and no list).
  Future<void> loadNotifications() async {
    // A reload asked for while one is running (a push arriving as the screen
    // opens, a sign-in right after creation) is coalesced into ONE more load
    // after the current one — never dropped, never duplicated.
    if (_inFlight) {
      _reloadRequested = true;
      return;
    }
    _inFlight = true;
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.getNotifications();
      if (!mounted) return;
      state = state.copyWith(
        items: result.items,
        isLoading: false,
        hasLoaded: true,
      );
    } on DioException catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        hasLoaded: true,
        error: extractDioErrorMessage(e),
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        hasLoaded: true,
        error: friendlyErrorMessage(e),
      );
    } finally {
      _inFlight = false;
      if (_reloadRequested && mounted) {
        _reloadRequested = false;
        // ignore: discarded_futures
        loadNotifications();
      }
    }
  }

  bool _inFlight = false;
  bool _reloadRequested = false;

  Future<void> refresh() => loadNotifications();

  /// The Notification Center was just opened (or came back to the front).
  /// The feed is per account and changes server-side while the app is open,
  /// so it is refreshed on every entry — the smallest reliable trigger short
  /// of polling. A load already in flight is not duplicated.
  Future<void> refreshOnOpen() => loadNotifications();

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
