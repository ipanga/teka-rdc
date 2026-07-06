import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_states.dart';
import '../../data/profile_repository.dart';

class SecurityScreen extends ConsumerStatefulWidget {
  const SecurityScreen({super.key});

  @override
  ConsumerState<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends ConsumerState<SecurityScreen> {
  List<SessionDto>? _sessions;
  bool _loading = true;
  String? _error;
  String? _action;

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
      final list = await ref.read(profileRepositoryProvider).listSessions();
      if (!mounted) return;
      setState(() => _sessions = list);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Impossible de charger les appareils connectés.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _revokeSession(String id) async {
    setState(() => _action = id);
    try {
      await ref.read(profileRepositoryProvider).revokeSession(id);
      if (!mounted) return;
      setState(() => _sessions = _sessions?.where((s) => s.id != id).toList());
      _toast('Appareil déconnecté');
    } catch (_) {
      if (!mounted) return;
      _toast('Impossible de déconnecter cet appareil', error: true);
    } finally {
      if (mounted) setState(() => _action = null);
    }
  }

  Future<void> _revokeAllOtherSessions() async {
    setState(() => _action = 'all');
    try {
      await ref.read(profileRepositoryProvider).revokeAllOtherSessions();
      if (!mounted) return;
      setState(() => _sessions = _sessions?.where((s) => s.current).toList());
      _toast('Autres appareils déconnectés');
    } catch (_) {
      if (!mounted) return;
      _toast('Impossible de déconnecter les autres appareils', error: true);
    } finally {
      if (mounted) setState(() => _action = null);
    }
  }

  void _toast(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? TekaColors.destructive : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(),
        title: const Text('Gestion du compte'),
      ),
      body: RefreshIndicator(
        color: TekaColors.tekaRed,
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _sessions == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return AppErrorState(message: _error, onRetry: _load);
    }

    final sessions = _sessions ?? const <SessionDto>[];
    final hasOthers = sessions.any((session) => !session.current);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SecurityNotice(),
        const SizedBox(height: 16),
        Row(
          children: [
            const Expanded(
              child: Text(
                'Appareils connectés',
                style: TextStyle(
                  color: TekaColors.foreground,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            if (hasOthers)
              TextButton(
                onPressed: _action == null ? _revokeAllOtherSessions : null,
                child: Text(
                  _action == 'all'
                      ? 'Déconnexion...'
                      : 'Déconnecter les autres',
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (sessions.isEmpty)
          const AppEmptyState(
            icon: Icons.devices_other_outlined,
            title: 'Aucun autre appareil connecté',
            message:
                'Votre session actuelle reste protégée par votre numéro WhatsApp.',
          )
        else
          DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: TekaColors.border),
            ),
            child: Column(
              children: [
                for (var i = 0; i < sessions.length; i++) ...[
                  if (i > 0) const Divider(height: 1),
                  _SessionTile(
                    session: sessions[i],
                    busy: _action == sessions[i].id,
                    disabled: _action != null,
                    onRevoke: () => _revokeSession(sessions[i].id),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _SecurityNotice extends StatelessWidget {
  const _SecurityNotice();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: TekaColors.surfaceMuted,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: TekaColors.border),
      ),
      child: const Padding(
        padding: EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(Icons.verified_user_outlined, color: TekaColors.tekaRed),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Déconnectez les appareils que vous ne reconnaissez pas.',
                style: TextStyle(height: 1.35),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SessionTile extends StatelessWidget {
  final SessionDto session;
  final bool busy;
  final bool disabled;
  final VoidCallback onRevoke;

  const _SessionTile({
    required this.session,
    required this.busy,
    required this.disabled,
    required this.onRevoke,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      leading: const Icon(Icons.devices_other_outlined),
      title: Row(
        children: [
          Expanded(
            child: Text(
              session.ipAddress != null
                  ? 'IP ${session.ipAddress}'
                  : 'IP inconnue',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          if (session.current)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: TekaColors.tekaRedSubtle,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'Cet appareil',
                style: TextStyle(
                  color: TekaColors.tekaRed,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
      subtitle: Text('Connecté le ${_formatDate(session.createdAt)}'),
      trailing: session.current
          ? null
          : TextButton(
              onPressed: disabled ? null : onRevoke,
              child: Text(busy ? 'Déconnexion...' : 'Déconnecter'),
            ),
    );
  }

  String _formatDate(DateTime date) {
    String two(int value) => value.toString().padLeft(2, '0');
    return '${two(date.day)}/${two(date.month)}/${date.year} ${two(date.hour)}:${two(date.minute)}';
  }
}
