import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pin_code_fields/pin_code_fields.dart';
import '../../../../core/theme/teka_colors.dart';
import '../providers/auth_provider.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  final String? phone;
  final String? code;

  const RegisterScreen({super.key, this.phone, this.code});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _phoneController = TextEditingController();
  final _otpController = PinInputController();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  String? _errorMessage;
  bool _otpVerified = false;
  String _verifiedPhone = '';
  String _verifiedCode = '';

  @override
  void initState() {
    super.initState();
    if (widget.phone != null && widget.code != null) {
      _verifiedPhone = widget.phone!;
      _verifiedCode = widget.code!;
      _otpVerified = true;
      _phoneController.text = widget.phone!.replaceFirst('+243', '');
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    _firstNameController.dispose();
    _lastNameController.dispose();
    super.dispose();
  }

  String _formatPhone(String input) {
    String digits = input.replaceAll(RegExp(r'[^\d]'), '');
    if (digits.startsWith('0')) {
      digits = digits.substring(1);
    }
    if (!digits.startsWith('243')) {
      digits = '243$digits';
    }
    if (!digits.startsWith('+')) {
      digits = '+$digits';
    }
    return digits;
  }

  Future<void> _sendOtp() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) {
      setState(() => _errorMessage = 'Veuillez entrer votre numero.');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      _verifiedPhone = _formatPhone(phone);
      await ref.read(authProvider.notifier).requestOtp(_verifiedPhone);
    } on DioException catch (e) {
      setState(() {
        _errorMessage = e.response?.data?['message'] ??
            'Impossible d\'envoyer le code.';
      });
    } catch (_) {
      setState(() => _errorMessage = 'Une erreur est survenue.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _verifyOtp(String code) async {
    if (code.length != 6) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await ref.read(authProvider.notifier).verifyOtp(_verifiedPhone, code);
      setState(() {
        _verifiedCode = code;
        _otpVerified = true;
      });
    } on DioException catch (e) {
      setState(() {
        _errorMessage = e.response?.data?['message'] ??
            'Code invalide. Veuillez reessayer.';
      });
      _otpController.clear();
    } catch (_) {
      setState(() => _errorMessage = 'Une erreur est survenue.');
      _otpController.clear();
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await ref.read(authProvider.notifier).register(
            _verifiedPhone,
            _verifiedCode,
            _firstNameController.text.trim(),
            _lastNameController.text.trim(),
          );
      if (mounted) context.go('/');
    } on DioException catch (e) {
      setState(() {
        _errorMessage = e.response?.data?['message'] ??
            'Impossible de creer le compte. Veuillez reessayer.';
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
        title: const Text('Creer un compte vendeur'),
        backgroundColor: Colors.transparent,
        foregroundColor: TekaColors.foreground,
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 24),

                if (!_otpVerified) ...[
                  // Step 1: Phone + OTP
                  Text(
                    'Etape 1 : Verifier votre numero',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 16),

                  // Phone field
                  TextFormField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: InputDecoration(
                      labelText: 'Numero de telephone',
                      hintText: '09XX XXX XXX',
                      prefixIcon: const Icon(Icons.phone),
                      prefixText: '+243 ',
                      prefixStyle: TextStyle(
                        color: TekaColors.foreground,
                        fontWeight: FontWeight.w500,
                      ),
                      suffixIcon: TextButton(
                        onPressed: _isLoading ? null : _sendOtp,
                        child: Text(
                          'Envoyer',
                          style: TextStyle(color: TekaColors.tekaRed),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  Text(
                    'Entrez le code recu par SMS',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: TekaColors.mutedForeground,
                        ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),

                  MaterialPinField(
                    length: 6,
                    pinController: _otpController,
                    keyboardType: TextInputType.number,
                    enabled: !_isLoading,
                    theme: MaterialPinTheme(
                      shape: MaterialPinShape.outlined,
                      borderRadius: BorderRadius.circular(8),
                      cellSize: const Size(46, 52),
                      focusedBorderColor: TekaColors.tekaRed,
                      borderColor: TekaColors.border,
                      fillColor: Colors.white,
                      focusedFillColor: Colors.white,
                      filledFillColor: Colors.white,
                      entryAnimation: MaterialPinAnimation.fade,
                    ),
                    onCompleted: _verifyOtp,
                    onChanged: (_) {},
                  ),
                ] else ...[
                  // Step 2: Name fields
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: TekaColors.success.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.check_circle, color: TekaColors.success),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Numero verifie : $_verifiedPhone',
                            style: TextStyle(color: TekaColors.success),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  Text(
                    'Etape 2 : Vos informations',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Votre compte sera cree en tant que vendeur.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: TekaColors.mutedForeground,
                        ),
                  ),
                  const SizedBox(height: 16),

                  TextFormField(
                    controller: _firstNameController,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Prenom',
                      hintText: 'Entrez votre prenom',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Veuillez entrer votre prenom';
                      }
                      if (value.trim().length < 2) {
                        return 'Le prenom doit contenir au moins 2 caracteres';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  TextFormField(
                    controller: _lastNameController,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Nom',
                      hintText: 'Entrez votre nom',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Veuillez entrer votre nom';
                      }
                      if (value.trim().length < 2) {
                        return 'Le nom doit contenir au moins 2 caracteres';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),

                  SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _register,
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
                              'Creer mon compte vendeur',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                    ),
                  ),
                ],

                // Error message
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
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],

                // Loading
                if (_isLoading && !_otpVerified)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Center(child: CircularProgressIndicator()),
                  ),

                const SizedBox(height: 24),

                // Login link
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Deja un compte ? ',
                      style: TextStyle(color: TekaColors.mutedForeground),
                    ),
                    GestureDetector(
                      onTap: () => context.go('/auth/login'),
                      child: Text(
                        'Se connecter',
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
