import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pin_code_fields/pin_code_fields.dart';
import '../../../../core/theme/teka_colors.dart';
import '../providers/auth_provider.dart';

class OtpScreen extends ConsumerStatefulWidget {
  final String phone;
  final bool isLogin;

  const OtpScreen({
    super.key,
    required this.phone,
    this.isLogin = true,
  });

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _otpController = PinInputController();
  bool _isLoading = false;
  String? _errorMessage;
  int _countdown = 60;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _otpController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  void _startCountdown() {
    _countdown = 60;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_countdown > 0) {
        setState(() => _countdown--);
      } else {
        timer.cancel();
      }
    });
  }

  Future<void> _resendOtp() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await ref.read(authProvider.notifier).requestOtp(widget.phone);
      _startCountdown();
    } on DioException catch (e) {
      setState(() {
        _errorMessage = e.response?.data?['message'] ??
            'Impossible de renvoyer le code.';
      });
    } catch (_) {
      setState(() {
        _errorMessage = 'Une erreur est survenue.';
      });
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
      if (widget.isLogin) {
        // Try login first
        try {
          await ref.read(authProvider.notifier).login(widget.phone, code);
          if (mounted) context.go('/');
        } on DioException catch (e) {
          // If 404, user not found — navigate to register
          if (e.response?.statusCode == 404) {
            if (mounted) {
              context.pushReplacement(
                '/auth/register',
                extra: {'phone': widget.phone, 'code': code},
              );
            }
            return;
          }
          rethrow;
        }
      } else {
        // Verify OTP only (for register flow)
        await ref.read(authProvider.notifier).verifyOtp(widget.phone, code);
        if (mounted) {
          context.pushReplacement(
            '/auth/register',
            extra: {'phone': widget.phone, 'code': code},
          );
        }
      }
    } on DioException catch (e) {
      setState(() {
        _errorMessage = e.response?.data?['message'] ??
            'Code invalide. Veuillez reessayer.';
      });
      _otpController.clear();
    } catch (_) {
      setState(() {
        _errorMessage = 'Une erreur est survenue. Veuillez reessayer.';
      });
      _otpController.clear();
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final maskedPhone = widget.phone.length > 6
        ? '${widget.phone.substring(0, 4)} *** ${widget.phone.substring(widget.phone.length - 3)}'
        : widget.phone;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Verification'),
        backgroundColor: Colors.transparent,
        foregroundColor: TekaColors.foreground,
        elevation: 0,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 32),
              Icon(
                Icons.sms_rounded,
                size: 64,
                color: TekaColors.tekaRed,
              ),
              const SizedBox(height: 24),
              Text(
                'Code de verification',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Un code a 6 chiffres a ete envoye au\n$maskedPhone',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: TekaColors.mutedForeground,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),

              // OTP input
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
                onChanged: (_) {
                  if (_errorMessage != null) {
                    setState(() => _errorMessage = null);
                  }
                },
              ),
              const SizedBox(height: 8),

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
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Loading indicator
              if (_isLoading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(child: CircularProgressIndicator()),
                ),

              const Spacer(),

              // Resend section
              if (_countdown > 0)
                Text(
                  'Renvoyer le code dans $_countdown s',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: TekaColors.mutedForeground,
                      ),
                  textAlign: TextAlign.center,
                )
              else
                Center(
                  child: TextButton(
                    onPressed: _isLoading ? null : _resendOtp,
                    child: Text(
                      'Renvoyer le code',
                      style: TextStyle(
                        color: TekaColors.tekaRed,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}
