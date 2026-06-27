import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../providers/earnings_provider.dart';

/// Payout request form (Initiative #3 / C2). Operator + reception number,
/// prefilled from the seller's saved destination (GET /v1/sellers/payout-method,
/// B1). On submit it saves the destination then requests the payout.
class RequestPayoutScreen extends ConsumerStatefulWidget {
  const RequestPayoutScreen({super.key});

  @override
  ConsumerState<RequestPayoutScreen> createState() =>
      _RequestPayoutScreenState();
}

// Brand names (proper nouns) — not translatable copy.
const _payoutMethods = <String, String>{
  'M_PESA': 'M-Pesa (Vodacom)',
  'AIRTEL_MONEY': 'Airtel Money',
  'ORANGE_MONEY': 'Orange Money',
};

class _RequestPayoutScreenState extends ConsumerState<RequestPayoutScreen> {
  String? _method;
  final _phoneController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _prefillDestination();
  }

  Future<void> _prefillDestination() async {
    final saved =
        await ref.read(earningsProvider.notifier).getSavedPayoutMethod();
    if (!mounted || saved == null) return;
    setState(() {
      if (saved.payoutMethod != null &&
          _payoutMethods.containsKey(saved.payoutMethod)) {
        _method = saved.payoutMethod;
      }
      if (saved.payoutPhone != null && _phoneController.text.isEmpty) {
        _phoneController.text = saved.payoutPhone!;
      }
    });
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    final phone = _phoneController.text.trim();
    if (_method == null) {
      setState(() => _error = "Operateur Mobile Money");
      return;
    }
    if (!RegExp(r'^\+243[0-9]{9}$').hasMatch(phone)) {
      setState(() => _error = "+243...");
      return;
    }
    setState(() => _submitting = true);
    final errorMessage =
        await ref.read(earningsProvider.notifier).requestPayout(_method!, phone);
    if (!mounted) return;
    setState(() => _submitting = false);
    if (errorMessage == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Demande envoyée avec succès")),
      );
      context.pop();
    } else {
      setState(() => _error = errorMessage);
    }
  }

  @override
  Widget build(BuildContext context) {
    final wallet = ref.watch(earningsProvider).wallet;
    final balance = wallet?.balanceCDFDisplay ?? 0;

    return Scaffold(
      appBar: AppBar(title: const Text("Demande de virement")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Solde actuel : $balance CDF',
              style: const TextStyle(
                fontSize: 14,
                color: TekaColors.mutedForeground,
              ),
            ),
            const SizedBox(height: 24),
            if (_error != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: TekaColors.destructive.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    fontSize: 13,
                    color: TekaColors.destructive,
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
            const Text(
              "Operateur Mobile Money",
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _method,
              decoration: const InputDecoration(border: OutlineInputBorder()),
              items: _payoutMethods.entries
                  .map((e) => DropdownMenuItem(
                        value: e.key,
                        child: Text(e.value),
                      ))
                  .toList(),
              onChanged: _submitting
                  ? null
                  : (v) => setState(() => _method = v),
            ),
            const SizedBox(height: 16),
            const Text(
              "Numéro de réception",
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              enabled: !_submitting,
              decoration: const InputDecoration(
                hintText: "+243...",
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: TekaColors.tekaRed,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text("Envoyer la demande"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
