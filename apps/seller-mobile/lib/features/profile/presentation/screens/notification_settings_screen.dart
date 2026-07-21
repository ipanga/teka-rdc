import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/push/push_service.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../data/profile_repository.dart';

class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  NotificationPrefs? _prefs;
  AuthorizationStatus? _osStatus;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final prefs =
          await ref.read(profileRepositoryProvider).getNotificationPrefs();
      // Read the actual OS permission so the UI never claims notifications are
      // on while the phone has them blocked. Best-effort — a failure just
      // leaves the banner hidden.
      final osStatus = await PushService.instance.getPermissionStatus();
      if (!mounted) return;
      setState(() {
        _prefs = prefs;
        _osStatus = osStatus;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger vos préférences.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Prompts for permission when it hasn't been decided yet, then refreshes the
  /// banner. On iOS a prior denial can't be re-prompted — the banner then tells
  /// the seller to enable notifications in the phone settings.
  Future<void> _requestOsPermission() async {
    await PushService.instance.requestPermission();
    final osStatus = await PushService.instance.getPermissionStatus();
    if (!mounted) return;
    setState(() => _osStatus = osStatus);
  }

  Future<void> _update({
    bool? smsOrderUpdates,
    bool? smsBroadcasts,
  }) async {
    final previous = _prefs;
    setState(() {
      _prefs = NotificationPrefs(
        smsOrderUpdates: smsOrderUpdates ?? previous?.smsOrderUpdates ?? true,
        smsBroadcasts: smsBroadcasts ?? previous?.smsBroadcasts ?? true,
      );
      _saving = true;
    });
    try {
      final next =
          await ref.read(profileRepositoryProvider).updateNotificationPrefs(
                smsOrderUpdates: smsOrderUpdates,
                smsBroadcasts: smsBroadcasts,
              );
      if (!mounted) return;
      setState(() => _prefs = next);
    } catch (_) {
      if (!mounted) return;
      setState(() => _prefs = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Erreur lors de la mise à jour'),
          backgroundColor: TekaColors.destructive,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(fallbackLocation: '/profile'),
        title: const Text('Notifications'),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return _ErrorState(message: _error!, onRetry: _load);
    }

    final prefs = _prefs ??
        const NotificationPrefs(
          smsOrderUpdates: true,
          smsBroadcasts: true,
        );

    final osBlocked = _osStatus == AuthorizationStatus.denied;
    final osUndetermined = _osStatus == AuthorizationStatus.notDetermined;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // OS-level permission truth: if the phone blocks notifications, no
        // in-app toggle can deliver a push — say so instead of implying they
        // work. If undecided, offer to ask for permission.
        if (osBlocked) ...[
          _OsPermissionBanner(
            blocked: true,
            onAction: null,
          ),
          const SizedBox(height: 16),
        ] else if (osUndetermined) ...[
          _OsPermissionBanner(
            blocked: false,
            onAction: _requestOsPermission,
          ),
          const SizedBox(height: 16),
        ],
        const _NoticeCard(
          icon: Icons.info_outline_rounded,
          text:
              'Les alertes critiques liées aux commandes peuvent rester nécessaires pour assurer la livraison.',
        ),
        const SizedBox(height: 16),
        _PreferenceTile(
          title: 'Mises à jour de commande',
          subtitle: 'Nouvelles commandes, préparation, collecte et livraison',
          icon: Icons.local_shipping_outlined,
          value: prefs.smsOrderUpdates,
          enabled: !_saving,
          onChanged: (value) => _update(smsOrderUpdates: value),
        ),
        const SizedBox(height: 10),
        _PreferenceTile(
          title: 'Annonces et promotions',
          subtitle: "Messages envoyés par l'équipe Teka RDC",
          icon: Icons.campaign_outlined,
          value: prefs.smsBroadcasts,
          enabled: !_saving,
          onChanged: (value) => _update(smsBroadcasts: value),
        ),
      ],
    );
  }
}

class _PreferenceTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  const _PreferenceTile({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: TekaColors.border),
      ),
      child: SwitchListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        secondary: Icon(icon, color: TekaColors.tekaRed),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(subtitle),
        value: value,
        onChanged: enabled ? onChanged : null,
      ),
    );
  }
}

class _OsPermissionBanner extends StatelessWidget {
  /// true = OS has denied notifications (nothing to tap — guide to settings);
  /// false = not yet decided (offer to request permission).
  final bool blocked;
  final VoidCallback? onAction;

  const _OsPermissionBanner({required this.blocked, required this.onAction});

  @override
  Widget build(BuildContext context) {
    final color = blocked ? TekaColors.destructive : TekaColors.warning;
    final text = blocked
        ? 'Les notifications sont désactivées dans les réglages de votre '
            'téléphone. Réactivez-les dans Réglages › Notifications pour '
            'recevoir les alertes de commande.'
        : "Autorisez les notifications pour être prévenu des nouvelles "
            'commandes en temps réel.';

    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.30)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  blocked
                      ? Icons.notifications_off_outlined
                      : Icons.notifications_active_outlined,
                  color: color,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    text,
                    style: const TextStyle(
                      color: TekaColors.foreground,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
            if (onAction != null) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(
                  onPressed: onAction,
                  child: const Text('Activer les notifications'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _NoticeCard extends StatelessWidget {
  final IconData icon;
  final String text;

  const _NoticeCard({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: TekaColors.tekaRed.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(icon, color: TekaColors.tekaRed),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(
                  color: TekaColors.foreground,
                  height: 1.35,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                color: TekaColors.tekaRed, size: 42),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: TekaColors.mutedForeground),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ),
      ),
    );
  }
}
