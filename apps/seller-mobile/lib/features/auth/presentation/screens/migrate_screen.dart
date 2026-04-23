import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pin_code_fields/pin_code_fields.dart';
import '../../../../core/theme/teka_colors.dart';
import '../providers/auth_provider.dart';

enum _MigrationStep { initial, emailSetupSent, emailRequired, alreadyMigrated }

class MigrateScreen extends ConsumerStatefulWidget {
  const MigrateScreen({super.key});

  @override
  ConsumerState<MigrateScreen> createState() => _MigrateScreenState();
}

class _MigrateScreenState extends ConsumerState<MigrateScreen> {
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _otpController = PinInputController();
  final _initialFormKey = GlobalKey<FormState>();
  final _linkFormKey = GlobalKey<FormState>();

  _MigrationStep _step = _MigrationStep.initial;
  bool _isLoading = false;
  bool _otpSending = false;
  int _countdown = 0;
  Timer? _timer;
  String? _errorMessage;
  String _otpCode = '';

  @override
  void dispose() {
    _emailController.dispose();
    _phoneController.dispose();
    _otpController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  String _formatPhone(String input) {
    String digits = input.replaceAll(RegExp(r'[^\d]'), '');
    if (digits.startsWith('0')) digits = digits.substring(1);
    if (!digits.startsWith('243')) digits = '243$digits';
    return '+$digits';
  }

  void _startCountdown() {
    _countdown = 60;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_countdown > 0) {
        setState(() => _countdown--);
      } else {
        t.cancel();
      }
    });
  }

  Future<void> _check() async {
    if (!_initialFormKey.currentState!.validate()) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final res = await ref
          .read(authProvider.notifier)
          .migrateSellerCheck(_emailController.text.trim().toLowerCase());
      final migration = res['migration'] as String?;
      setState(() {
        switch (migration) {
          case 'email_setup_sent':
            _step = _MigrationStep.emailSetupSent;
            break;
          case 'already_migrated':
            _step = _MigrationStep.alreadyMigrated;
            break;
          case 'email_required':
          default:
            _step = _MigrationStep.emailRequired;
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

  Future<void> _sendPhoneOtp() async {
    final phone = _formatPhone(_phoneController.text.trim());
    setState(() {
      _otpSending = true;
      _errorMessage = null;
    });
    try {
      await ref.read(authProvider.notifier).requestOtp(phone);
      _startCountdown();
    } on DioException catch (e) {
      setState(() {
        _errorMessage = e.response?.data?['error']?['message'] ??
            'Impossible d\'envoyer le code.';
      });
    } catch (_) {
      setState(() => _errorMessage = 'Une erreur est survenue.');
    } finally {
      if (mounted) setState(() => _otpSending = false);
    }
  }

  Future<void> _linkEmail() async {
    if (!_linkFormKey.currentState!.validate()) return;
    final code = _otpCode;
    if (code.length != 6) {
      setState(() => _errorMessage = 'Code a 6 chiffres requis.');
      return;
    }
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      await ref.read(authProvider.notifier).migrateSellerLinkEmail(
            phone: _formatPhone(_phoneController.text.trim()),
            code: code,
            email: _emailController.text.trim().toLowerCase(),
          );
      setState(() => _step = _MigrationStep.emailSetupSent);
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
        title: const Text('Configurer compte vendeur'),
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
              if (_step == _MigrationStep.initial) _buildInitial(),
              if (_step == _MigrationStep.emailSetupSent) _buildSent(),
              if (_step == _MigrationStep.alreadyMigrated) _buildAlready(),
              if (_step == _MigrationStep.emailRequired) _buildLink(),
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
            'Le portail vendeur a ete mis a jour. Entrez votre email pour recevoir un lien de configuration de mot de passe.',
            style: TextStyle(color: TekaColors.mutedForeground),
          ),
          const SizedBox(height: 24),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Email',
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
                  : const Text('Envoyer le lien'),
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
          'Email envoye',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        const Text(
          'Consultez votre boite mail pour configurer votre nouveau mot de passe.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: () => context.go('/auth/login'),
          child: const Text('Retour a la connexion'),
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
          'Votre compte est deja configure. Connectez-vous par email.',
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

  Widget _buildLink() {
    return Form(
      key: _linkFormKey,
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
              'Aucun email enregistre. Verifiez votre numero par SMS pour en ajouter un.',
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Numero de telephone vendeur',
              prefixText: '+243 ',
              prefixIcon: Icon(Icons.phone),
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) {
                return 'Numero requis';
              }
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email a associer',
              prefixIcon: Icon(Icons.email_outlined),
            ),
            validator: (v) {
              if (v == null || !v.contains('@')) return 'Email invalide';
              return null;
            },
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: MaterialPinField(
                  length: 6,
                  pinController: _otpController,
                  keyboardType: TextInputType.number,
                  theme: MaterialPinTheme(
                    shape: MaterialPinShape.outlined,
                    borderRadius: BorderRadius.circular(8),
                    cellSize: const Size(40, 48),
                    focusedBorderColor: TekaColors.tekaRed,
                    borderColor: TekaColors.border,
                    fillColor: Colors.white,
                    focusedFillColor: Colors.white,
                    filledFillColor: Colors.white,
                    entryAnimation: MaterialPinAnimation.fade,
                  ),
                  onChanged: (v) => _otpCode = v,
                  onCompleted: (v) => _otpCode = v,
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: _otpSending || _countdown > 0 || _phoneController.text.isEmpty
                    ? null
                    : _sendPhoneOtp,
                child: Text(_countdown > 0 ? '${_countdown}s' : 'Envoyer'),
              ),
            ],
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
                  : const Text('Verifier et envoyer le lien'),
            ),
          ),
        ],
      ),
    );
  }
}
