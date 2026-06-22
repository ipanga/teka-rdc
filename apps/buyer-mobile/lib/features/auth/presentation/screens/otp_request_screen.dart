import 'package:flutter/material.dart';
import '../../../../core/network/dio_error_messages.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/utils/phone.dart';
import '../providers/auth_provider.dart';

class OtpRequestScreen extends ConsumerStatefulWidget {
  const OtpRequestScreen({super.key});

  @override
  ConsumerState<OtpRequestScreen> createState() => _OtpRequestScreenState();
}

class _OtpRequestScreenState extends ConsumerState<OtpRequestScreen> {
  final _phoneController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    final normalized = normalizeDrcPhone(_phoneController.text);
    if (normalized == null) {
      setState(() => _error =
          'Numéro invalide. Entrez 9 chiffres (ou 10 avec le 0 initial).');
      return;
    }
    try {
      final data = await ref.read(authProvider.notifier).requestOtp(normalized);
      if (!mounted) return;
      // Carry the server-supplied resend cooldown to the verify screen so the
      // initial countdown matches the backend rate limit (was hardcoded 30s).
      context.push('/auth/otp', extra: {
        'phone': normalized,
        'cooldown': data['cooldownSeconds'],
      });
    } catch (e) {
      setState(() => _error = friendlyErrorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(authProvider).isLoading;
    return Scaffold(
      appBar: AppBar(
        // Guests reach this screen by tapping a protected tab/action (a
        // redirect, so there's nothing to pop). Give them an explicit way back
        // to browsing instead of stranding them on the login screen.
        leading: IconButton(
          icon: const Icon(Icons.close),
          tooltip: 'Fermer',
          onPressed: () {
            ref.read(returnToRouteProvider.notifier).state = null;
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/');
            }
          },
        ),
        title: const Text('Connexion ou inscription'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Entrez votre numéro WhatsApp. Vous recevrez un code à 6 chiffres.',
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
                  hintText: '9 chiffres (ex. 990 000 001)',
                  border: OutlineInputBorder(),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 24),
              FilledButton(
                onPressed: isLoading ? null : _submit,
                child: Text(isLoading ? '...' : 'Recevoir mon code'),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed:
                    () => context.push('/auth/reclamer-compte'),
                child: const Text('Réclamer mon ancien compte'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
