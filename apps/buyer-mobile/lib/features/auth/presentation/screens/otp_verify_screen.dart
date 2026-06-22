import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';

class OtpVerifyScreen extends ConsumerStatefulWidget {
  final String phone;
  /// Initial resend cooldown (seconds) from the OTP-request response. Falls
  /// back to 30 when not supplied.
  final int initialCooldown;
  const OtpVerifyScreen({
    super.key,
    required this.phone,
    this.initialCooldown = 30,
  });

  @override
  ConsumerState<OtpVerifyScreen> createState() => _OtpVerifyScreenState();
}

class _OtpVerifyScreenState extends ConsumerState<OtpVerifyScreen> {
  final _codeController = TextEditingController();
  final _focusNode = FocusNode();
  String? _error;
  Timer? _ticker;
  int _cooldown = 30;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
    _startCooldown();
  }

  void _startCooldown([int? seconds]) {
    _ticker?.cancel();
    setState(() => _cooldown = seconds ?? widget.initialCooldown);
    _ticker = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _cooldown = _cooldown > 0 ? _cooldown - 1 : 0);
      if (_cooldown == 0) t.cancel();
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _codeController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _submit(String code) async {
    if (code.length != 6) return;
    setState(() => _error = null);
    try {
      await ref.read(authProvider.notifier).verifyOtp(
            phone: widget.phone,
            code: code,
          );
      // On success the auth state flips to authenticated and the router
      // redirect navigates to the saved return-to route (the protected action
      // the guest came from) or home — see app_router.dart. Don't navigate here
      // (that would race the redirect and ignore the return-to).
    } on SellerAccountException {
      if (!mounted) return;
      _codeController.clear();
      _showSellerAccountDialog();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _humanizeError(e, isVerify: true));
    }
  }

  void _showSellerAccountDialog() {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Compte vendeur'),
        content: const Text(
          "Ce numéro est associé à un compte vendeur. "
          "Connectez-vous depuis l'application vendeur Teka RDC.",
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              if (mounted) context.pop(); // back to the phone-entry screen
            },
            child: const Text('Compris'),
          ),
        ],
      ),
    );
  }

  Future<void> _resend() async {
    if (_cooldown > 0) return;
    setState(() => _error = null);
    try {
      final data = await ref.read(authProvider.notifier).resendOtp(widget.phone);
      _startCooldown((data['cooldownSeconds'] as num?)?.toInt());
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _humanizeError(e, isVerify: false));
    }
  }

  String _humanizeError(Object e, {required bool isVerify}) {
    if (e is DioException) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return 'Connexion lente. Veuillez réessayer.';
      }
      if (e.type == DioExceptionType.connectionError) {
        return 'Pas de connexion internet.';
      }
      final data = e.response?.data;
      if (data is Map && data['error'] is Map) {
        final msg = data['error']['message'];
        if (msg is String && msg.isNotEmpty) return msg;
      }
      // Status-based fallback when the server gave no useful body.
      final status = e.response?.statusCode;
      if (status == 401 || status == 400) {
        return isVerify
            ? 'Code invalide ou expiré.'
            : 'Impossible de renvoyer le code. Veuillez réessayer.';
      }
      if (status == 429) {
        return 'Trop de tentatives. Veuillez patienter avant de réessayer.';
      }
    }
    return 'Une erreur est survenue. Veuillez réessayer.';
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(authProvider).isLoading;
    return Scaffold(
      appBar: AppBar(title: const Text('Code WhatsApp')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Saisissez le code envoyé au ${widget.phone}'),
              const SizedBox(height: 16),
              TextField(
                controller: _codeController,
                focusNode: _focusNode,
                keyboardType: TextInputType.number,
                maxLength: 6,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                style: const TextStyle(
                  fontSize: 24,
                  letterSpacing: 8,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
                onChanged: (v) {
                  if (v.length == 6) _submit(v);
                },
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
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: () => context.pop(),
                    child: const Text('← Modifier le numéro'),
                  ),
                  TextButton(
                    onPressed: _cooldown > 0 || isLoading ? null : _resend,
                    child: Text(
                      _cooldown > 0
                          ? 'Renvoyer dans ${_cooldown}s'
                          : 'Renvoyer le code',
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
