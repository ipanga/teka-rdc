import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_states.dart';
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
      if (!mounted) return;
      setState(() => _prefs = prefs);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger vos préférences.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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
        leading: const AdaptiveLeading(),
        title: const Text('Notifications'),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return AppErrorState(message: _error, onRetry: _load);
    }

    final prefs = _prefs ??
        const NotificationPrefs(
          smsOrderUpdates: true,
          smsBroadcasts: true,
        );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _NoticeCard(
          icon: Icons.info_outline_rounded,
          text:
              'Les codes WhatsApp de connexion restent toujours envoyés pour protéger votre compte.',
        ),
        const SizedBox(height: 16),
        _PreferenceTile(
          title: 'Mises à jour de commande',
          subtitle: 'Confirmation, préparation, livraison et annulation',
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

class _NoticeCard extends StatelessWidget {
  final IconData icon;
  final String text;

  const _NoticeCard({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: TekaColors.tekaRedSubtle,
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
