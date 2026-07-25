import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../data/profile_repository.dart';

class SecurityScreen extends ConsumerStatefulWidget {
  const SecurityScreen({super.key});

  @override
  ConsumerState<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends ConsumerState<SecurityScreen> {
  final _currentPasswordCtrl = TextEditingController();
  final _newPasswordCtrl = TextEditingController();
  final _confirmPasswordCtrl = TextEditingController();

  List<SessionDto>? _sessions;
  bool _loading = true;
  bool _changingPassword = false;
  String? _error;
  String? _sessionAction;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _currentPasswordCtrl.dispose();
    _newPasswordCtrl.dispose();
    _confirmPasswordCtrl.dispose();
    super.dispose();
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

  Future<void> _changePassword() async {
    if (_currentPasswordCtrl.text.isEmpty || _newPasswordCtrl.text.length < 8) {
      _toast('Le nouveau mot de passe doit contenir au moins 8 caractères.',
          error: true);
      return;
    }
    if (_newPasswordCtrl.text != _confirmPasswordCtrl.text) {
      _toast('Les deux mots de passe ne correspondent pas', error: true);
      return;
    }

    setState(() => _changingPassword = true);
    try {
      await ref.read(profileRepositoryProvider).changePassword(
            currentPassword: _currentPasswordCtrl.text,
            newPassword: _newPasswordCtrl.text,
          );
      _currentPasswordCtrl.clear();
      _newPasswordCtrl.clear();
      _confirmPasswordCtrl.clear();
      _toast(
        'Mot de passe modifié. Les autres appareils ont été déconnectés.',
      );
      await _load();
    } catch (_) {
      if (!mounted) return;
      _toast('Erreur lors de la modification du mot de passe', error: true);
    } finally {
      if (mounted) setState(() => _changingPassword = false);
    }
  }

  Future<void> _revokeSession(String id) async {
    setState(() => _sessionAction = id);
    try {
      await ref.read(profileRepositoryProvider).revokeSession(id);
      if (!mounted) return;
      setState(() => _sessions = _sessions?.where((s) => s.id != id).toList());
      _toast('Appareil déconnecté');
    } catch (_) {
      if (!mounted) return;
      _toast('Impossible de déconnecter cet appareil', error: true);
    } finally {
      if (mounted) setState(() => _sessionAction = null);
    }
  }

  Future<void> _revokeAllOtherSessions() async {
    setState(() => _sessionAction = 'all');
    try {
      await ref.read(profileRepositoryProvider).revokeAllOtherSessions();
      if (!mounted) return;
      setState(() => _sessions = _sessions?.where((s) => s.current).toList());
      _toast('Autres appareils déconnectés');
    } catch (_) {
      if (!mounted) return;
      _toast('Impossible de déconnecter les autres appareils', error: true);
    } finally {
      if (mounted) setState(() => _sessionAction = null);
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
        leading: const AdaptiveLeading(fallbackLocation: '/profile'),
        title: const Text('Sécurité du compte'),
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
      return _ErrorState(message: _error!, onRetry: _load);
    }

    final sessions = _sessions ?? const <SessionDto>[];
    final hasOthers = sessions.any((session) => !session.current);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _PasswordCard(
          currentPasswordCtrl: _currentPasswordCtrl,
          newPasswordCtrl: _newPasswordCtrl,
          confirmPasswordCtrl: _confirmPasswordCtrl,
          changingPassword: _changingPassword,
          onSubmit: _changePassword,
        ),
        const SizedBox(height: 18),
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
                onPressed:
                    _sessionAction == null ? _revokeAllOtherSessions : null,
                child: Text(
                  _sessionAction == 'all'
                      ? 'Déconnexion...'
                      : 'Déconnecter les autres',
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (sessions.isEmpty)
          const _EmptyState(
            icon: Icons.devices_other_outlined,
            title: 'Aucun autre appareil connecté',
            message: 'Votre session actuelle est la seule session active.',
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
                for (var index = 0; index < sessions.length; index++) ...[
                  if (index > 0)
                    const Divider(height: 1, color: TekaColors.border),
                  _SessionTile(
                    session: sessions[index],
                    busy: _sessionAction == sessions[index].id,
                    disabled: _sessionAction != null,
                    onRevoke: () => _revokeSession(sessions[index].id),
                  ),
                ],
              ],
            ),
          ),
        const SizedBox(height: 32),
        const Divider(height: 1, color: TekaColors.border),
        const SizedBox(height: 16),
        const Text(
          'Zone sensible',
          style: TextStyle(
            color: TekaColors.mutedForeground,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () => context.push('/profile/delete-account'),
          icon: const Icon(Icons.delete_forever_outlined),
          label: const Text('Supprimer mon compte'),
          style: OutlinedButton.styleFrom(
            foregroundColor: TekaColors.destructive,
            side: const BorderSide(color: TekaColors.destructive),
            minimumSize: const Size.fromHeight(48),
          ),
        ),
      ],
    );
  }
}

class _PasswordCard extends StatelessWidget {
  final TextEditingController currentPasswordCtrl;
  final TextEditingController newPasswordCtrl;
  final TextEditingController confirmPasswordCtrl;
  final bool changingPassword;
  final VoidCallback onSubmit;

  const _PasswordCard({
    required this.currentPasswordCtrl,
    required this.newPasswordCtrl,
    required this.confirmPasswordCtrl,
    required this.changingPassword,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: TekaColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Mot de passe',
              style: TextStyle(
                color: TekaColors.foreground,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'La modification déconnecte les autres appareils.',
              style: TextStyle(
                color: TekaColors.mutedForeground,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: currentPasswordCtrl,
              obscureText: true,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Mot de passe actuel',
                prefixIcon: Icon(Icons.lock_outline),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: newPasswordCtrl,
              obscureText: true,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Nouveau mot de passe',
                prefixIcon: Icon(Icons.password_outlined),
                helperText: 'Au moins 8 caractères, avec lettres et chiffres.',
                helperMaxLines: 2,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: confirmPasswordCtrl,
              obscureText: true,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: 'Confirmer le nouveau mot de passe',
                prefixIcon: Icon(Icons.password_outlined),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: changingPassword ? null : onSubmit,
                icon: changingPassword
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.check_rounded),
                label: Text(
                  changingPassword
                      ? 'Enregistrement...'
                      : 'Modifier le mot de passe',
                ),
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
                color: TekaColors.tekaRed.withValues(alpha: 0.10),
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

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;

  const _EmptyState({
    required this.icon,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          Icon(icon, color: TekaColors.mutedForeground, size: 56),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(
              color: TekaColors.foreground,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: TekaColors.mutedForeground),
          ),
        ],
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
