import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/phone.dart';
import '../providers/auth_provider.dart';

enum _Step { initial, needsEmailSetup, alreadyMigrated, unknown, emailSetupSent }

class MigrateScreen extends ConsumerStatefulWidget {
  const MigrateScreen({super.key});

  @override
  ConsumerState<MigrateScreen> createState() => _MigrateScreenState();
}

class _MigrateScreenState extends ConsumerState<MigrateScreen> {
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _initialFormKey = GlobalKey<FormState>();
  final _emailFormKey = GlobalKey<FormState>();

  _Step _step = _Step.initial;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _phoneController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    if (!_initialFormKey.currentState!.validate()) return;
    final normalized = normalizeDrcPhone(_phoneController.text);
    if (normalized == null) {
      setState(() => _errorMessage = 'Numéro invalide.');
      return;
    }
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final res = await ref
          .read(authProvider.notifier)
          .migrateBuyerCheck(normalized);
      final migration = res['migration'] as String?;
      setState(() {
        switch (migration) {
          case 'needs_email_setup':
            _step = _Step.needsEmailSetup;
            break;
          case 'already_migrated':
            _step = _Step.alreadyMigrated;
            break;
          case 'unknown':
          default:
            _step = _Step.unknown;
        }
      });
    } on DioException catch (e) {
      setState(() {
        _errorMessage = e.response?.data?['error']?['message'] ??
            'Une erreur est survenue.';
      });
    } catch (_) {
      setState(() => _errorMessage = 'Une erreur est survenue.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _linkEmail() async {
    if (!_emailFormKey.currentState!.validate()) return;
    final normalized = normalizeDrcPhone(_phoneController.text);
    if (normalized == null) {
      setState(() => _errorMessage = 'Numéro invalide.');
      return;
    }
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      await ref.read(authProvider.notifier).migrateBuyerLinkEmail(
            phone: normalized,
            email: _emailController.text.trim().toLowerCase(),
          );
      setState(() => _step = _Step.emailSetupSent);
    } on DioException catch (e) {
      setState(() {
        _errorMessage = e.response?.data?['error']?['message'] ??
            'Migration impossible.';
      });
    } catch (_) {
      setState(() => _errorMessage = 'Une erreur est survenue.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Migrer mon compte'),
        backgroundColor: Colors.transparent,
        foregroundColor: TekaColors.foreground,
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),
              if (_step == _Step.initial) _buildInitial(),
              if (_step == _Step.needsEmailSetup) _buildNeedsEmail(),
              if (_step == _Step.alreadyMigrated) _buildAlready(),
              if (_step == _Step.unknown) _buildUnknown(),
              if (_step == _Step.emailSetupSent) _buildSent(),
              if (_errorMessage != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: TekaColors.destructive.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _errorMessage!,
                    style: TextStyle(color: TekaColors.destructive),
                  ),
                ),
              ],
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInitial() {
    return Form(
      key: _initialFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Si vous aviez un compte par téléphone, migrez-le vers une connexion par email et mot de passe.',
            style: TextStyle(color: TekaColors.mutedForeground),
          ),
          const SizedBox(height: 24),
          TextFormField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Numéro de téléphone',
              prefixText: '+243 ',
              prefixIcon: Icon(Icons.phone),
              helperText: '9 chiffres (ou 10 avec le 0)',
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Numéro requis';
              if (normalizeDrcPhone(v) == null) return 'Numéro invalide';
              return null;
            },
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _check,
              child: _isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Vérifier mon numéro'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNeedsEmail() {
    return Form(
      key: _emailFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.amber.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
            ),
            child: const Text(
              'Indiquez l\'email à associer à votre compte. Vous recevrez un lien pour définir votre mot de passe.',
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Email à associer',
              prefixIcon: Icon(Icons.email_outlined),
            ),
            validator: (v) {
              if (v == null || !v.contains('@')) return 'Email invalide';
              return null;
            },
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _linkEmail,
              child: _isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Envoyer le lien de configuration'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(Icons.email_rounded, size: 64, color: TekaColors.tekaRed),
        const SizedBox(height: 16),
        const Text(
          'Vérifiez vos emails',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        const Text(
          'Si un compte correspond, vous recevrez un lien pour définir votre mot de passe (valable 24h).',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: () => context.go('/auth/login'),
          child: const Text('Retour à la connexion'),
        ),
      ],
    );
  }

  Widget _buildAlready() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(Icons.check_circle_outline, size: 64, color: Colors.green),
        const SizedBox(height: 16),
        const Text(
          'Votre compte utilise déjà la connexion par email. Connectez-vous normalement.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: () => context.go('/auth/login'),
          child: const Text('Se connecter'),
        ),
      ],
    );
  }

  Widget _buildUnknown() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(Icons.info_outline, size: 64, color: TekaColors.mutedForeground),
        const SizedBox(height: 16),
        const Text(
          'Aucun ancien compte trouvé pour ce numéro. Vous pouvez créer un nouveau compte avec votre email.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: () => context.go('/auth/register'),
          child: const Text('Créer un compte'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => context.go('/auth/login'),
          child: const Text('Retour à la connexion'),
        ),
      ],
    );
  }
}
