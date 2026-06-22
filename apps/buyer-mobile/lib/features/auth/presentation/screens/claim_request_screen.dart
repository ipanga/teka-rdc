import 'package:flutter/material.dart';
import '../../../../core/network/dio_error_messages.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';

class ClaimRequestScreen extends ConsumerStatefulWidget {
  const ClaimRequestScreen({super.key});

  @override
  ConsumerState<ClaimRequestScreen> createState() =>
      _ClaimRequestScreenState();
}

class _ClaimRequestScreenState extends ConsumerState<ClaimRequestScreen> {
  final _emailController = TextEditingController();
  bool _submitted = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    try {
      await ref
          .read(authProvider.notifier)
          .requestClaim(_emailController.text.trim().toLowerCase());
      setState(() => _submitted = true);
    } catch (e) {
      setState(() => _error = friendlyErrorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Réclamer mon compte')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _submitted
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Si un compte correspond, un email vous a été envoyé.',
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => context.go('/auth/connexion'),
                      child: const Text('← Retour à la connexion'),
                    ),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Si vous aviez un compte avec email seulement, entrez-le ici. Nous vous enverrons un lien pour ajouter votre WhatsApp.',
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(
                        labelText: 'Adresse email',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(_error!,
                          style: const TextStyle(color: Colors.red)),
                    ],
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _submit,
                      child: const Text('Envoyer le lien'),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
