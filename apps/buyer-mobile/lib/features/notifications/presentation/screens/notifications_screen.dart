import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../providers/notifications_provider.dart';

/// Notification Center opened from the home AppBar bell. Lists the buyer's
/// in-app notifications (admin broadcasts, product promos, …) with read/unread
/// state; tapping marks read + deep-links a product notification to the PDP.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  String _timeAgo(DateTime d) {
    final min = DateTime.now().difference(d).inMinutes;
    if (min < 1) return "a l'instant";
    if (min < 60) return 'il y a $min min';
    final h = min ~/ 60;
    if (h < 24) return 'il y a $h h';
    return 'il y a ${h ~/ 24} j';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(notificationsProvider);
    final notifier = ref.read(notificationsProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (state.unreadCount > 0)
            TextButton(
              onPressed: () {
                notifier.markAllRead();
                ref.invalidate(notificationUnreadCountProvider);
              },
              child: const Text('Tout lire'),
            ),
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
                Text(
                  state.error ?? 'Aucune notification',
                  style: const TextStyle(
                    color: TekaColors.mutedForeground,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Vous recevrez ici les mises a jour de vos commandes, '
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

    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: state.items.length,
      separatorBuilder: (_, __) =>
          const Divider(height: 1, color: TekaColors.border),
      itemBuilder: (context, index) {
        final n = state.items[index];
        return Material(
          color: n.isRead
              ? Colors.transparent
              : TekaColors.tekaRed.withValues(alpha: 0.05),
          child: InkWell(
            onTap: () {
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
