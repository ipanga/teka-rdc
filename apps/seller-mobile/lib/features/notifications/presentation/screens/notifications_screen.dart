import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../data/notification_model.dart';
import '../providers/notifications_provider.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  String _timeAgoFr(DateTime created) {
    final mins = DateTime.now().difference(created).inMinutes;
    if (mins < 1) return "à l'instant";
    if (mins < 60) return 'il y a $mins min';
    final h = mins ~/ 60;
    if (h < 24) return 'il y a $h h';
    return 'il y a ${h ~/ 24} j';
  }

  IconData _iconFor(NotificationModel n) {
    switch (n.type) {
      case 'PRODUCT_APPROVED':
        return Icons.check_circle_outline;
      case 'PRODUCT_REJECTED':
        return Icons.cancel_outlined;
      case 'ORDER':
        return Icons.receipt_long;
      default:
        return Icons.notifications_outlined;
    }
  }

  Color _colorFor(NotificationModel n) {
    switch (n.type) {
      case 'PRODUCT_APPROVED':
        return TekaColors.success;
      case 'PRODUCT_REJECTED':
        return TekaColors.tekaRed;
      case 'ORDER':
        return TekaColors.tekaRed;
      default:
        return TekaColors.mutedForeground;
    }
  }

  void _onTap(BuildContext context, WidgetRef ref, NotificationModel n) {
    ref.read(notificationsProvider.notifier).markRead(n.id);
    if (n.entityType == 'product' && n.entityId != null) {
      context.push('/products/${n.entityId}');
    } else if (n.entityType == 'order' && n.entityId != null) {
      context.push('/orders/${n.entityId}');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(notificationsProvider);

    return Scaffold(
      appBar: AppBar(
        // Opened from the dashboard bell (push) and from FCM taps (deep link,
        // stack-replacing) — AdaptiveLeading keeps an exit in both cases.
        leading: const AdaptiveLeading(),
        title: const Text("Notifications"),
        actions: [
          if (state.unread > 0)
            IconButton(
              tooltip: "Tout marquer comme lu",
              onPressed: () =>
                  ref.read(notificationsProvider.notifier).markAllRead(),
              icon: const Icon(Icons.done_all),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(notificationsProvider.notifier).load(),
        child: state.isLoading && state.items.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : state.error != null && state.items.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      const SizedBox(height: 80),
                      const Icon(Icons.error_outline,
                          size: 48, color: TekaColors.destructive),
                      const SizedBox(height: 12),
                      Text(
                        state.error!,
                        textAlign: TextAlign.center,
                        style:
                            const TextStyle(color: TekaColors.mutedForeground),
                      ),
                      const SizedBox(height: 16),
                      OutlinedButton.icon(
                        onPressed: () =>
                            ref.read(notificationsProvider.notifier).load(),
                        icon: const Icon(Icons.refresh),
                        label: const Text("Réessayer"),
                      ),
                    ],
                  )
                : state.items.isEmpty
                    ? ListView(
                        children: [
                          const SizedBox(height: 120),
                          Icon(
                            Icons.notifications_none,
                            size: 56,
                            color: TekaColors.mutedForeground,
                          ),
                          const SizedBox(height: 12),
                          Center(
                            child: Text(
                              "Aucune notification",
                              style: const TextStyle(
                                color: TekaColors.mutedForeground,
                              ),
                            ),
                          ),
                        ],
                      )
                    : NotificationListener<ScrollNotification>(
                        onNotification: (notification) {
                          if (notification is ScrollEndNotification &&
                              notification.metrics.extentAfter < 200) {
                            ref.read(notificationsProvider.notifier).loadMore();
                          }
                          return false;
                        },
                        child: ListView.separated(
                          itemCount: state.items.length +
                              (state.isLoadingMore || state.error != null
                                  ? 1
                                  : 0),
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            if (index == state.items.length) {
                              if (state.isLoadingMore) {
                                return const Padding(
                                  padding: EdgeInsets.all(16),
                                  child: Center(
                                      child: CircularProgressIndicator()),
                                );
                              }
                              return Padding(
                                padding: const EdgeInsets.all(12),
                                child: OutlinedButton.icon(
                                  onPressed: () => ref
                                      .read(notificationsProvider.notifier)
                                      .loadMore(),
                                  icon: const Icon(Icons.refresh),
                                  label: const Text(
                                      "Réessayer de charger la suite"),
                                ),
                              );
                            }
                            final n = state.items[index];
                            return ListTile(
                              tileColor: n.isRead
                                  ? null
                                  : TekaColors.tekaRed.withValues(alpha: 0.04),
                              leading: CircleAvatar(
                                backgroundColor:
                                    _colorFor(n).withValues(alpha: 0.12),
                                child: Icon(_iconFor(n), color: _colorFor(n)),
                              ),
                              title: Text(
                                n.title,
                                style: TextStyle(
                                  fontWeight: n.isRead
                                      ? FontWeight.w500
                                      : FontWeight.w700,
                                ),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(n.body),
                                  const SizedBox(height: 4),
                                  Text(
                                    _timeAgoFr(n.createdAt),
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: TekaColors.mutedForeground,
                                    ),
                                  ),
                                ],
                              ),
                              trailing: n.isRead
                                  ? null
                                  : Container(
                                      width: 10,
                                      height: 10,
                                      decoration: const BoxDecoration(
                                        color: TekaColors.tekaRed,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                              isThreeLine: true,
                              onTap: () => _onTap(context, ref, n),
                            );
                          },
                        )),
      ),
    );
  }
}
