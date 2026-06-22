import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/utils/phone.dart';
import '../providers/auth_provider.dart';

/// Opened from the magic-link email at /auth/reclamer-compte/confirmer.
/// Two steps: collect phone → trigger OTP → collect code → call
/// /v1/auth/buyer/claim/verify.
class ClaimVerifyScreen extends ConsumerStatefulWidget {
  final String? token;
  const ClaimVerifyScreen({super.key, required this.token});

  @override
  ConsumerState<ClaimVerifyScreen> createState() => _ClaimVerifyScreenState();
}

enum _Step { phone, code }

class _ClaimVerifyScreenState extends ConsumerState<ClaimVerifyScreen> {
  _Step _step = _Step.phone;
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  String? _normalizedPhone;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submitPhone() async {
    setState(() => _error = null);
    final normalized = normalizeDrcPhone(_phoneController.text);
    if (normalized == null) {
      setState(() => _error =
          'Numéro invalide. Entrez 9 chiffres (ou 10 avec le 0 initial).');
      return;
    }
    try {
      await ref.read(authProvider.notifier).requestOtp(normalized);
      setState(() {
        _normalizedPhone = normalized;
        _step = _Step.code;
      });
    } catch (e) {
      setState(() => _error = friendlyErrorMessage(e));
    }
  }

  Future<void> _submitCode(String code) async {
    if (code.length != 6 || widget.token == null || _normalizedPhone == null) {
      return;
    }
    setState(() => _error = null);
    try {
      await ref.read(authProvider.notifier).verifyClaim(
            token: widget.token!,
            phone: _normalizedPhone!,
            code: code,
          );
      if (!mounted) return;
      // Navigate explicitly to the saved return-to or home (the router redirect
      // doesn't reliably move off a pushed auth route).
      final returnTo = ref.read(returnToRouteProvider);
      ref.read(returnToRouteProvider.notifier).state = null;
      context.go(returnTo ?? '/');
    } catch (e) {
      setState(() => _error = friendlyErrorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.token == null || widget.token!.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Lien invalide')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Ce lien est invalide ou a expiré. Recommencez depuis /reclamer-compte.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Ajouter votre WhatsApp')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _step == _Step.phone ? _buildPhoneStep() : _buildCodeStep(),
        ),
      ),
    );
  }

  Widget _buildPhoneStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Entrez le numéro WhatsApp à associer à votre compte.',
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          maxLength: 10,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            labelText: 'Numéro WhatsApp',
            prefixText: '+243 ',
            border: OutlineInputBorder(),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: Colors.red)),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _submitPhone,
          child: const Text('Recevoir mon code'),
        ),
      ],
    );
  }

  Widget _buildCodeStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Saisissez le code envoyé au ${_normalizedPhone ?? ''}'),
        const SizedBox(height: 16),
        TextField(
          controller: _codeController,
          autofocus: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 24,
            letterSpacing: 8,
            fontWeight: FontWeight.w600,
          ),
          onChanged: _submitCode,
          decoration: const InputDecoration(
            labelText: 'Code à 6 chiffres',
            border: OutlineInputBorder(),
            counterText: '',
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: Colors.red)),
        ],
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => setState(() => _step = _Step.phone),
          child: const Text('← Modifier le numéro'),
        ),
      ],
    );
  }
}
