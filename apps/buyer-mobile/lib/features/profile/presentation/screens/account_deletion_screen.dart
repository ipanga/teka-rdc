import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../auth/data/auth_repository.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/profile_repository.dart';

/// Deliberate multi-step account deletion for buyers (WhatsApp OTP re-auth).
///   1. Explain what's deleted / retained + type "SUPPRIMER".
///   2. Receive a WhatsApp code + final destructive confirmation.
/// On success the account is scheduled for deletion (30-day grace) and the
/// buyer is signed out. If a deletion is already pending, offers to cancel it.
class AccountDeletionScreen extends ConsumerStatefulWidget {
  const AccountDeletionScreen({super.key});

  @override
  ConsumerState<AccountDeletionScreen> createState() =>
      _AccountDeletionScreenState();
}

class _AccountDeletionScreenState extends ConsumerState<AccountDeletionScreen> {
  bool _loading = true;
  String? _loadError;
  DeletionStatus? _status;

  final _confirmController = TextEditingController();
  final _otpController = TextEditingController();
  int _step = 1;
  String? _phone;
  bool _otpSent = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _confirmController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final repo = ref.read(profileRepositoryProvider);
      final status = await repo.getDeletionStatus();
      final me = await repo.getMe();
      if (!mounted) return;
      setState(() {
        _status = status;
        _phone = me.phone;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadError = 'Impossible de charger votre compte.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? TekaColors.destructive : null,
      ),
    );
  }

  Future<void> _sendOtp() async {
    final phone = _phone;
    if (phone == null || phone.isEmpty) {
      _toast('Numéro de téléphone introuvable sur le compte.', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(authRepositoryProvider).requestBuyerOtp(phone);
      if (!mounted) return;
      setState(() => _otpSent = true);
      _toast('Code envoyé sur WhatsApp.');
    } on Object catch (e) {
      _toast(friendlyErrorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _goToConfirmStep() async {
    if (_confirmController.text.trim().toUpperCase() != 'SUPPRIMER') {
      _toast('Veuillez saisir SUPPRIMER pour continuer.', error: true);
      return;
    }
    setState(() => _step = 2);
    await _sendOtp();
  }

  Future<void> _confirmDeletion() async {
    final code = _otpController.text.trim();
    if (code.length < 4) {
      _toast('Saisissez le code reçu sur WhatsApp.', error: true);
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer définitivement ?'),
        content: const Text(
          'Votre compte sera programmé pour suppression. Cette action est '
          'définitive après 30 jours. Continuer ?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            style:
                FilledButton.styleFrom(backgroundColor: TekaColors.destructive),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      final status = await ref
          .read(profileRepositoryProvider)
          .requestAccountDeletion(otpCode: code);
      if (!mounted) return;
      // The server revoked our sessions — sign out locally + go home.
      await ref.read(authProvider.notifier).logout();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Text('Compte supprimé'),
          content: Text(
            'Votre compte a été programmé pour suppression'
            '${status.scheduledAt != null ? ' le ${_formatDate(status.scheduledAt!)}' : ''}. '
            'Reconnectez-vous avant cette date pour le réactiver.',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Compris'),
            ),
          ],
        ),
      );
      if (mounted) context.go('/');
    } on Object catch (e) {
      _toast(friendlyErrorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelPending() async {
    setState(() => _busy = true);
    try {
      await ref.read(profileRepositoryProvider).cancelAccountDeletion();
      if (!mounted) return;
      setState(() => _status = const DeletionStatus(pending: false));
      _toast('Suppression annulée.');
    } on Object catch (e) {
      _toast(friendlyErrorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _formatDate(DateTime date) {
    String two(int v) => v.toString().padLeft(2, '0');
    return '${two(date.day)}/${two(date.month)}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(),
        title: const Text('Supprimer mon compte'),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_loadError != null) {
      return AppErrorState(message: _loadError, onRetry: _load);
    }
    if (_status?.pending == true) {
      return _buildPending();
    }
    return _step == 1 ? _buildExplain() : _buildConfirm();
  }

  Widget _buildPending() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _Callout(
          icon: Icons.hourglass_bottom_rounded,
          text: 'Votre compte est programmé pour suppression.',
        ),
        const SizedBox(height: 8),
        Text(
          _status?.scheduledAt != null
              ? 'Il sera définitivement supprimé le ${_formatDate(_status!.scheduledAt!)}. '
                  'Vous pouvez encore l’annuler.'
              : 'Vous pouvez encore annuler la suppression.',
          style: const TextStyle(color: TekaColors.mutedForeground, height: 1.4),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _busy ? null : _cancelPending,
          child: Text(_busy ? 'Annulation...' : 'Annuler la suppression'),
        ),
      ],
    );
  }

  Widget _buildExplain() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _Callout(
          icon: Icons.warning_amber_rounded,
          text: 'La suppression de votre compte est définitive.',
          destructive: true,
        ),
        const SizedBox(height: 16),
        const Text(
          'Ce qui sera supprimé',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
        const SizedBox(height: 6),
        const _Bullet('Votre profil, votre nom et vos coordonnées'),
        const _Bullet('Vos favoris et votre panier'),
        const _Bullet('Vos appareils connectés et notifications'),
        const SizedBox(height: 14),
        const Text(
          'Ce qui peut être conservé',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
        const SizedBox(height: 6),
        const _Bullet(
          'Vos commandes et factures, de façon anonymisée, pour nos '
          'obligations légales et comptables',
        ),
        const SizedBox(height: 14),
        const Text(
          'Comment ça marche',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
        const SizedBox(height: 6),
        const _Bullet(
          'Votre compte est désactivé immédiatement, puis supprimé '
          'définitivement après 30 jours.',
        ),
        const _Bullet(
          'Reconnectez-vous avant la fin de ce délai pour le réactiver.',
        ),
        const _Bullet(
          'Vous ne pouvez pas supprimer le compte tant qu’une commande ou '
          'un retour est en cours.',
        ),
        const SizedBox(height: 20),
        const Text(
          'Saisissez SUPPRIMER pour confirmer',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _confirmController,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(
            hintText: 'SUPPRIMER',
            border: OutlineInputBorder(),
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: TekaColors.destructive,
            minimumSize: const Size.fromHeight(48),
          ),
          onPressed: _confirmController.text.trim().toUpperCase() == 'SUPPRIMER'
              ? _goToConfirmStep
              : null,
          child: const Text('Continuer'),
        ),
      ],
    );
  }

  Widget _buildConfirm() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _Callout(
          icon: Icons.chat_outlined,
          text:
              'Pour confirmer, saisissez le code envoyé sur votre WhatsApp.',
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _otpController,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          decoration: const InputDecoration(
            labelText: 'Code de confirmation',
            border: OutlineInputBorder(),
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: _busy ? null : _sendOtp,
            child: Text(_otpSent ? 'Renvoyer le code' : 'Envoyer le code'),
          ),
        ),
        const SizedBox(height: 8),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: TekaColors.destructive,
            minimumSize: const Size.fromHeight(48),
          ),
          onPressed: _busy || _otpController.text.trim().length < 4
              ? null
              : _confirmDeletion,
          child: Text(
            _busy ? 'Suppression...' : 'Supprimer définitivement mon compte',
          ),
        ),
      ],
    );
  }
}

class _Callout extends StatelessWidget {
  final IconData icon;
  final String text;
  final bool destructive;
  const _Callout({
    required this.icon,
    required this.text,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = destructive ? TekaColors.destructive : TekaColors.tekaRed;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(
                  color: TekaColors.foreground,
                  fontWeight: FontWeight.w600,
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

class _Bullet extends StatelessWidget {
  final String text;
  const _Bullet(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(right: 8, top: 2),
            child: Icon(Icons.circle, size: 6, color: TekaColors.mutedForeground),
          ),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: TekaColors.mutedForeground,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
