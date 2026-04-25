import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/phone.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phoneController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    if (!_formKey.currentState!.validate()) return;

    final phone = normalizeDrcPhone(_phoneController.text.trim());
    if (phone == null) {
      setState(() {
        _errorMessage =
            'Numero invalide. Entrez 9 chiffres (ou 10 avec le 0).';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await ref.read(authProvider.notifier).requestOtp(phone);
      if (mounted) {
        context.push('/auth/otp', extra: {'phone': phone, 'isLogin': true});
      }
    } on DioException catch (e) {
      setState(() {
        _errorMessage = e.response?.data?['message'] ??
            'Impossible d\'envoyer le code. Veuillez reessayer.';
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Une erreur est survenue. Veuillez reessayer.';
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 60),
                // Logo / Title
                Icon(
                  Icons.shopping_bag_rounded,
                  size: 80,
                  color: TekaColors.tekaRed,
                ),
                const SizedBox(height: 16),
                Text(
                  'Teka RDC',
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                        color: TekaColors.tekaRed,
                        fontWeight: FontWeight.bold,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Votre marketplace en RD Congo',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: TekaColors.mutedForeground,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 48),

                // Section title
                Text(
                  'Se connecter',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Entrez votre numero de telephone pour recevoir un code de verification.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: TekaColors.mutedForeground,
                      ),
                ),
                const SizedBox(height: 24),

                // Phone input — user types 9 digits (or 10 with leading 0).
                // System adds +243 internally before submitting to the API.
                TextFormField(
                  controller: _phoneController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                  decoration: InputDecoration(
                    labelText: 'Numero de telephone',
                    hintText: '991234567',
                    helperText: '9 chiffres (ou 10 avec le 0)',
                    prefixIcon: const Icon(Icons.phone),
                    prefixText: '+243 ',
                    prefixStyle: TextStyle(
                      color: TekaColors.foreground,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  validator: (value) {
                    final digits =
                        (value ?? '').replaceAll(RegExp(r'\D'), '');
                    if (digits.isEmpty) {
                      return 'Veuillez entrer votre numero de telephone';
                    }
                    if (digits.length != 9 && digits.length != 10) {
                      return '9 chiffres (ou 10 avec le 0)';
                    }
                    if (digits.length == 10 && !digits.startsWith('0')) {
                      return '10 chiffres = doit commencer par 0';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Error message
                if (_errorMessage != null) ...[
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
                  const SizedBox(height: 16),
                ],

                // Send OTP button
                SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _sendOtp,
                    child: _isLoading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text(
                            'Envoyer le code',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 24),

                // Register link
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Pas de compte ? ',
                      style: TextStyle(color: TekaColors.mutedForeground),
                    ),
                    GestureDetector(
                      onTap: () => context.push('/auth/register'),
                      child: Text(
                        'Creer un compte',
                        style: TextStyle(
                          color: TekaColors.tekaRed,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
