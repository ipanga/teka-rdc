import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/earnings_provider.dart';

class RequestPayoutScreen extends ConsumerStatefulWidget {
  const RequestPayoutScreen({super.key});

  @override
  ConsumerState<RequestPayoutScreen> createState() =>
      _RequestPayoutScreenState();
}

class _RequestPayoutScreenState extends ConsumerState<RequestPayoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  String _selectedMethod = 'MPESA';
  bool _isSubmitting = false;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(earningsProvider);
    final wallet = state.wallet;
    final priceFormat = NumberFormat('#,###', 'fr');
    final balanceCDF = wallet?.balanceCDFDisplay ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.payoutFormTitle),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Current balance display
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: TekaColors.tekaRed.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: TekaColors.tekaRed.withValues(alpha: 0.2)),
              ),
              child: Row(
                children: [
                  Icon(Icons.account_balance_wallet_outlined,
                      color: TekaColors.tekaRed, size: 28),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.payoutCurrentBalance,
                        style: const TextStyle(
                          fontSize: 12,
                          color: TekaColors.mutedForeground,
                        ),
                      ),
                      Text(
                        '${priceFormat.format(balanceCDF)} CDF',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: TekaColors.tekaRed,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Operator selection
            Text(
              l10n.payoutSelectOperator,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 12),

            _buildOperatorButton(
              label: 'M-Pesa',
              value: 'MPESA',
              color: const Color(0xFFE60000),
            ),
            const SizedBox(height: 8),
            _buildOperatorButton(
              label: 'Airtel Money',
              value: 'AIRTEL',
              color: const Color(0xFFED1C24),
            ),
            const SizedBox(height: 8),
            _buildOperatorButton(
              label: 'Orange Money',
              value: 'ORANGE',
              color: const Color(0xFFFF6600),
            ),
            const SizedBox(height: 24),

            // Phone number
            Text(
              l10n.payoutPhone,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                hintText: l10n.payoutPhoneHint,
                prefixIcon: const Icon(Icons.phone),
                border: const OutlineInputBorder(),
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return l10n.authPhoneRequired;
                }
                final phone = value.trim();
                // Accept +243... or 0... format
                if (!RegExp(r'^(\+243|0)\d{9}$').hasMatch(phone)) {
                  return l10n.authPhoneInvalid;
                }
                return null;
              },
            ),
            const SizedBox(height: 32),

            // Submit button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isSubmitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(l10n.payoutSubmit),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOperatorButton({
    required String label,
    required String value,
    required Color color,
  }) {
    final isSelected = _selectedMethod == value;

    return InkWell(
      onTap: () => setState(() => _selectedMethod = value),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected
              ? color.withValues(alpha: 0.08)
              : TekaColors.background,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected
                ? color
                : TekaColors.border,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected ? color : TekaColors.mutedForeground,
                  width: 2,
                ),
              ),
              child: isSelected
                  ? Center(
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: color,
                        ),
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                color: isSelected ? color : TekaColors.foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final l10n = AppLocalizations.of(context)!;

    setState(() => _isSubmitting = true);

    final success = await ref.read(earningsProvider.notifier).requestPayout(
          _selectedMethod,
          _phoneController.text.trim(),
        );

    if (!mounted) return;

    setState(() => _isSubmitting = false);

    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.payoutSuccess),
          behavior: SnackBarBehavior.floating,
        ),
      );
      context.pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.authGenericError),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }
}
