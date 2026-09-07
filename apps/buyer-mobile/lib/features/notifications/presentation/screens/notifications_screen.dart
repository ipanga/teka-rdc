import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_bar_actions.dart';
import '../../../../core/widgets/app_states.dart';
import '../providers/notifications_provider.dart';

/// Notification Center opened from the home AppBar bell. Lists the buyer's
/// in-app notifications (admin broadcasts, product promos, …) with read/unread
/// state; tapping marks read + deep-links a product notification to the PDP.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Refresh on entry (PR D, 2026-09-06): the notifier loads once when it is
    // created and the feed used to stay as it was for the rest of the
    // session, however many pushes arrived in between.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(notificationsProvider.notifier).refreshOnOpen();
      ref.invalidate(notificationUnreadCountProvider);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// App brought back to the front while this screen is showing: reload
  /// (one GET) — the badge is handled app-wide by the resume hook.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      ref.read(notificationsProvider.notifier).refreshOnOpen();
    }
  }

  String _timeAgo(DateTime d) {
    final min = DateTime.now().difference(d).inMinutes;
    if (min < 1) return "à l'instant";
    if (min < 60) return 'il y a $min min';
    final h = min ~/ 60;
    if (h < 24) return 'il y a $h h';
    return 'il y a ${h ~/ 24} j';
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationsProvider);
    final notifier = ref.read(notificationsProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        // Opened from the home/profile bell (push) and from FCM taps (deep
        // link, stack-replacing) — AdaptiveLeading keeps an exit in both cases.
        leading: const AdaptiveLeading(),
        title: const Text('Notifications'),
        actions: [
          if (state.unreadCount > 0)
            TekaAppBarTextAction(
              label: 'Tout lire',
              onPressed: () {
                notifier.markAllRead();
                ref.invalidate(notificationUnreadCountProvider);
              },
            ),
          const SizedBox(width: 12),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: notifier.refresh,
        child: _body(context, ref, state, notifier),
      ),
    );
  }

  Widget _body(
    BuildContext context,
    WidgetRef ref,
    NotificationsState state,
    NotificationsNotifier notifier,
  ) {
    if (state.isLoading && state.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    // Nothing loaded and the load failed: a real error state with a retry
    // (it used to be rendered as the empty state's caption, with no way to
    // try again).
    if (state.items.isEmpty && state.error != null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 40),
          AppErrorState(message: state.error, onRetry: notifier.refresh),
        ],
      );
    }
    if (state.items.isEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 60),
                const Icon(Icons.notifications_none_rounded,
                    size: 72, color: TekaColors.mutedForeground),
                const SizedBox(height: 16),
                const Text(
                  'Aucune notification',
                  style: TextStyle(
                    color: TekaColors.mutedForeground,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Vous recevrez ici les mises à jour de vos commandes, '
                  'les promotions et les annonces de Teka RDC.',
                  style: TextStyle(
                      color: TekaColors.mutedForeground, fontSize: 13),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ],
      );
    }

    // A failed refresh with items on screen: keep the list, say so on top.
    final hasInlineError = state.error != null;
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: state.items.length + (hasInlineError ? 1 : 0),
      separatorBuilder: (_, __) =>
          const Divider(height: 1, color: TekaColors.border),
      itemBuilder: (context, index) {
        if (hasInlineError && index == 0) {
          return _InlineRefreshError(
            message: state.error!,
            onRetry: notifier.refresh,
          );
        }
        final n = state.items[index - (hasInlineError ? 1 : 0)];
        return Material(
          color: n.isRead
              ? Colors.transparent
              : TekaColors.tekaRed.withValues(alpha: 0.05),
          child: InkWell(
            onTap: () {
              const PosthogAnalytics().capture('notification_opened',
                  properties: {'notificationId': n.id, 'type': n.type});
              notifier.markRead(n.id);
              ref.invalidate(notificationUnreadCountProvider);
              final path = n.deepLinkPath;
              if (path != null) context.push(path);
            },
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (!n.isRead)
                    Container(
                      margin: const EdgeInsets.only(top: 5, right: 10),
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: TekaColors.tekaRed,
                        shape: BoxShape.circle,
                      ),
                    ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          n.title,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            color: TekaColors.foreground,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          n.body,
                          style: const TextStyle(
                            color: TekaColors.mutedForeground,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _timeAgo(n.createdAt),
                          style: const TextStyle(
                            color: TekaColors.mutedForeground,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _InlineRefreshError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _InlineRefreshError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('notifications-inline-error'),
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TekaColors.destructive.withValues(alpha: 0.06),
        border: Border.all(color: TekaColors.destructive.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, size: 18, color: TekaColors.destructive),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 13, color: TekaColors.foreground),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Réessayer')),
        ],
      ),
    );
  }
}
