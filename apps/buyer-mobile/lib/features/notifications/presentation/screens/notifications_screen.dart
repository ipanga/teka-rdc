import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';

/// Notification centre opened from the home AppBar bell. Today it shows an
/// informative empty state — order updates, promotions and broadcasts are
/// delivered via push (FCM) + email; there is no in-app notification feed
/// endpoint yet. The screen + bell exist so the surface (and a future unread
/// badge) have a home once a feed API lands; see `docs/push-notifications.md`.
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.notifications_none_rounded,
                  size: 80, color: TekaColors.mutedForeground),
              const SizedBox(height: 16),
              Text(
                'Aucune notification',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: TekaColors.mutedForeground,
                      fontWeight: FontWeight.w600,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Vous recevrez ici les mises a jour de vos commandes, '
                'les promotions et les annonces de Teka RDC.',
                style:
                    TextStyle(color: TekaColors.mutedForeground, fontSize: 13),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
