import 'dart:math';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../cart/presentation/providers/cart_provider.dart';
import '../../../city/data/city_repository.dart';
import '../../../city/data/models/city_model.dart';
import '../../../city/data/models/commune_model.dart';
import '../../data/models/checkout_model.dart';
import '../providers/checkout_provider.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _noteController = TextEditingController();

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final checkoutState = ref.watch(checkoutProvider);
    final cartState = ref.watch(cartProvider);

    // Navigate to success or payment-pending screen when checkout succeeds
    ref.listen<CheckoutState>(checkoutProvider, (previous, next) {
      if (previous?.step != CheckoutStep.success &&
          next.step == CheckoutStep.success) {
        if (next.paymentPending && next.orders.isNotEmpty) {
          context.go('/checkout/payment-pending', extra: {
            'orders': next.orders,
          });
        } else {
          context.go('/checkout/success', extra: {
            'orders': next.orders,
          });
        }
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.checkoutTitle),
        leading: checkoutState.step == CheckoutStep.address
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => context.pop(),
              )
            : IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () =>
                    ref.read(checkoutProvider.notifier).previousStep(),
              ),
      ),
      body: Column(
        children: [
          // Step indicator
          _StepIndicator(
            currentStep: checkoutState.step,
            l10n: l10n,
          ),

          // Error message
          if (checkoutState.error != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: TekaColors.destructive.withOpacity(0.1),
              child: Text(
                checkoutState.error!,
                style: const TextStyle(
                  color: TekaColors.destructive,
                  fontSize: 13,
                ),
              ),
            ),

          // Content
          Expanded(
            child: _buildStepContent(
              checkoutState,
              cartState,
              l10n,
              locale,
            ),
          ),
        ],
      ),
      bottomNavigationBar: checkoutState.step != CheckoutStep.processing
          ? _buildBottomBar(checkoutState, l10n)
          : null,
    );
  }

  Widget _buildStepContent(
    CheckoutState checkoutState,
    CartState cartState,
    AppLocalizations l10n,
    String locale,
  ) {
    switch (checkoutState.step) {
      case CheckoutStep.address:
        return _AddressStep(
          addresses: checkoutState.addresses,
          selectedAddress: checkoutState.selectedAddress,
          isLoading: checkoutState.isLoadingAddresses,
          l10n: l10n,
          onSelect: (address) =>
              ref.read(checkoutProvider.notifier).selectAddress(address),
          onAddAddress: () => _showAddAddressSheet(context, l10n),
        );
      case CheckoutStep.payment:
        return _PaymentStep(
          selectedMethod: checkoutState.paymentMethod,
          selectedProvider: checkoutState.selectedProvider,
          payerPhone: checkoutState.payerPhone,
          l10n: l10n,
          onSelect: (method) =>
              ref.read(checkoutProvider.notifier).selectPaymentMethod(method),
          onSelectProvider: (provider) =>
              ref.read(checkoutProvider.notifier).selectMobileMoneyProvider(provider),
          onPayerPhoneChanged: (phone) =>
              ref.read(checkoutProvider.notifier).setPayerPhone(phone),
          userPhone: ref.read(authProvider).user?['phone'] as String?,
        );
      case CheckoutStep.review:
        return _ReviewStep(
          cartState: cartState,
          checkoutState: checkoutState,
          noteController: _noteController,
          l10n: l10n,
          locale: locale,
          onNoteChanged: (note) =>
              ref.read(checkoutProvider.notifier).setBuyerNote(note),
        );
      case CheckoutStep.processing:
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(
                color: TekaColors.tekaRed,
                strokeWidth: 3,
              ),
              const SizedBox(height: 16),
              Text(
                l10n.checkoutProcessing,
                style: const TextStyle(
                  color: TekaColors.mutedForeground,
                  fontSize: 15,
                ),
              ),
            ],
          ),
        );
      case CheckoutStep.success:
        return const SizedBox.shrink();
    }
  }

  void _showAddAddressSheet(BuildContext context, AppLocalizations l10n) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _AddAddressSheet(
        l10n: l10n,
        cityRepository: ref.read(cityRepositoryProvider),
        onSave: (data) async {
          final success =
              await ref.read(checkoutProvider.notifier).createAddress(data);
          return success;
        },
      ),
    );
  }

  Widget _buildBottomBar(CheckoutState checkoutState, AppLocalizations l10n) {
    final bool canProceed;
    final String buttonText;
    final VoidCallback? onPressed;

    switch (checkoutState.step) {
      case CheckoutStep.address:
        canProceed = checkoutState.canProceedToPayment;
        buttonText = l10n.next;
        onPressed =
            canProceed ? () => ref.read(checkoutProvider.notifier).nextStep() : null;
        break;
      case CheckoutStep.payment:
        canProceed = checkoutState.canProceedToReview;
        buttonText = l10n.next;
        onPressed = canProceed
            ? () => ref.read(checkoutProvider.notifier).nextStep()
            : null;
        break;
      case CheckoutStep.review:
        canProceed = checkoutState.canPlaceOrder;
        buttonText = l10n.checkoutPlaceOrder;
        onPressed = canProceed
            ? () {
                final idempotencyKey =
                    '${DateTime.now().millisecondsSinceEpoch}-${Random().nextInt(999999).toString().padLeft(6, '0')}';
                ref.read(checkoutProvider.notifier).placeOrder(idempotencyKey);
              }
            : null;
        break;
      default:
        return const SizedBox.shrink();
    }

    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: 12 + MediaQuery.of(context).viewPadding.bottom,
      ),
      decoration: BoxDecoration(
        color: TekaColors.background,
        border: const Border(
          top: BorderSide(color: TekaColors.border),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: TekaColors.tekaRed,
            disabledBackgroundColor: TekaColors.muted,
            padding: const EdgeInsets.symmetric(vertical: 14),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          child: Text(buttonText),
        ),
      ),
    );
  }
}

class _StepIndicator extends StatelessWidget {
  final CheckoutStep currentStep;
  final AppLocalizations l10n;

  const _StepIndicator({
    required this.currentStep,
    required this.l10n,
  });

  @override
  Widget build(BuildContext context) {
    final steps = [
      CheckoutStep.address,
      CheckoutStep.payment,
      CheckoutStep.review,
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: TekaColors.border),
        ),
      ),
      child: Row(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0)
              Expanded(
                child: Container(
                  height: 2,
                  color: _stepIndex(currentStep) >= i
                      ? TekaColors.tekaRed
                      : TekaColors.border,
                ),
              ),
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _stepIndex(currentStep) >= i
                    ? TekaColors.tekaRed
                    : TekaColors.muted,
              ),
              alignment: Alignment.center,
              child: Text(
                '${i + 1}',
                style: TextStyle(
                  color: _stepIndex(currentStep) >= i
                      ? Colors.white
                      : TekaColors.mutedForeground,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  int _stepIndex(CheckoutStep step) {
    switch (step) {
      case CheckoutStep.address:
        return 0;
      case CheckoutStep.payment:
        return 1;
      case CheckoutStep.review:
      case CheckoutStep.processing:
      case CheckoutStep.success:
        return 2;
    }
  }
}

class _AddressStep extends StatelessWidget {
  final List<AddressModel> addresses;
  final AddressModel? selectedAddress;
  final bool isLoading;
  final AppLocalizations l10n;
  final ValueChanged<AddressModel> onSelect;
  final VoidCallback onAddAddress;

  const _AddressStep({
    required this.addresses,
    required this.selectedAddress,
    required this.isLoading,
    required this.l10n,
    required this.onSelect,
    required this.onAddAddress,
  });

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Center(
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }

    if (addresses.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.location_off_outlined,
                size: 64,
                color: TekaColors.mutedForeground,
              ),
              const SizedBox(height: 16),
              Text(
                l10n.checkoutNoAddresses,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: TekaColors.mutedForeground,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: onAddAddress,
                icon: const Icon(Icons.add_location_alt_outlined),
                label: Text(l10n.addAddress),
                style: OutlinedButton.styleFrom(
                  foregroundColor: TekaColors.tekaRed,
                  side: const BorderSide(color: TekaColors.tekaRed),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          l10n.checkoutSelectAddress,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: TekaColors.foreground,
              ),
        ),
        const SizedBox(height: 12),
        ...addresses.map((address) {
          final isSelected = selectedAddress?.id == address.id;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              onTap: () => onSelect(address),
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  border: Border.all(
                    color: isSelected ? TekaColors.tekaRed : TekaColors.border,
                    width: isSelected ? 2 : 1,
                  ),
                  borderRadius: BorderRadius.circular(8),
                  color: isSelected
                      ? TekaColors.tekaRed.withOpacity(0.04)
                      : null,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      isSelected
                          ? Icons.radio_button_checked
                          : Icons.radio_button_off,
                      color: isSelected
                          ? TekaColors.tekaRed
                          : TekaColors.mutedForeground,
                      size: 20,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (address.label != null &&
                              address.label!.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Text(
                                address.label!,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                  color: TekaColors.foreground,
                                ),
                              ),
                            ),
                          Text(
                            address.displayAddress,
                            style: const TextStyle(
                              color: TekaColors.foreground,
                              fontSize: 13,
                            ),
                          ),
                          if (address.displayRecipient.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                address.displayRecipient,
                                style: const TextStyle(
                                  color: TekaColors.mutedForeground,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          if (address.isDefault)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: TekaColors.success.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text(
                                  'Par defaut',
                                  style: TextStyle(
                                    color: TekaColors.success,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),

        // Add new address button
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: onAddAddress,
          icon: const Icon(Icons.add_location_alt_outlined, size: 18),
          label: Text(l10n.addAddress),
          style: OutlinedButton.styleFrom(
            foregroundColor: TekaColors.tekaRed,
            side: const BorderSide(color: TekaColors.tekaRed),
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
        ),
      ],
    );
  }
}

class _PaymentStep extends StatefulWidget {
  final String selectedMethod;
  final String? selectedProvider;
  final String payerPhone;
  final AppLocalizations l10n;
  final ValueChanged<String> onSelect;
  final ValueChanged<String> onSelectProvider;
  final ValueChanged<String> onPayerPhoneChanged;
  final String? userPhone;

  const _PaymentStep({
    required this.selectedMethod,
    required this.selectedProvider,
    required this.payerPhone,
    required this.l10n,
    required this.onSelect,
    required this.onSelectProvider,
    required this.onPayerPhoneChanged,
    this.userPhone,
  });

  @override
  State<_PaymentStep> createState() => _PaymentStepState();
}

class _PaymentStepState extends State<_PaymentStep> {
  late final TextEditingController _phoneController;
  bool _phoneInitialized = false;

  @override
  void initState() {
    super.initState();
    _phoneController = TextEditingController(text: widget.payerPhone);
  }

  @override
  void didUpdateWidget(_PaymentStep oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Prefill phone from user profile when MM is first selected
    if (!_phoneInitialized &&
        widget.selectedMethod == 'MOBILE_MONEY' &&
        widget.payerPhone.isEmpty &&
        widget.userPhone != null &&
        widget.userPhone!.isNotEmpty) {
      _phoneInitialized = true;
      _phoneController.text = widget.userPhone!;
      widget.onPayerPhoneChanged(widget.userPhone!);
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = widget.l10n;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          l10n.checkoutPaymentMethod,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: TekaColors.foreground,
              ),
        ),
        const SizedBox(height: 12),
        _PaymentOption(
          title: l10n.checkoutCOD,
          subtitle: 'Payez a la reception de votre commande',
          icon: Icons.payments_outlined,
          isSelected: widget.selectedMethod == 'COD',
          onTap: () => widget.onSelect('COD'),
        ),
        const SizedBox(height: 8),
        _PaymentOption(
          title: l10n.checkoutMobileMoney,
          subtitle: 'M-Pesa, Airtel Money, Orange Money',
          icon: Icons.phone_android,
          isSelected: widget.selectedMethod == 'MOBILE_MONEY',
          onTap: () {
            widget.onSelect('MOBILE_MONEY');
            // Prefill phone on first selection
            if (!_phoneInitialized &&
                widget.payerPhone.isEmpty &&
                widget.userPhone != null &&
                widget.userPhone!.isNotEmpty) {
              _phoneInitialized = true;
              _phoneController.text = widget.userPhone!;
              widget.onPayerPhoneChanged(widget.userPhone!);
            }
          },
        ),

        // Mobile Money provider selection
        if (widget.selectedMethod == 'MOBILE_MONEY') ...[
          const SizedBox(height: 16),
          Text(
            l10n.checkoutSelectProvider,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: TekaColors.foreground,
                ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _ProviderTile(
                  label: l10n.checkoutMpesa,
                  color: const Color(0xFF4CAF50),
                  isSelected: widget.selectedProvider == 'M_PESA',
                  onTap: () => widget.onSelectProvider('M_PESA'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ProviderTile(
                  label: l10n.checkoutAirtelMoney,
                  color: const Color(0xFFE53935),
                  isSelected: widget.selectedProvider == 'AIRTEL_MONEY',
                  onTap: () => widget.onSelectProvider('AIRTEL_MONEY'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ProviderTile(
                  label: l10n.checkoutOrangeMoney,
                  color: const Color(0xFFF57C00),
                  isSelected: widget.selectedProvider == 'ORANGE_MONEY',
                  onTap: () => widget.onSelectProvider('ORANGE_MONEY'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _phoneController,
            onChanged: widget.onPayerPhoneChanged,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: l10n.checkoutPayerPhone,
              hintText: l10n.checkoutPayerPhoneHint,
              prefixIcon: const Icon(Icons.phone_outlined),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: TekaColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: TekaColors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: TekaColors.tekaRed),
              ),
              contentPadding: const EdgeInsets.all(12),
            ),
            style: const TextStyle(fontSize: 14),
          ),
        ],
      ],
    );
  }
}

class _ProviderTile extends StatelessWidget {
  final String label;
  final Color color;
  final bool isSelected;
  final VoidCallback onTap;

  const _ProviderTile({
    required this.label,
    required this.color,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          border: Border.all(
            color: isSelected ? color : TekaColors.border,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(8),
          color: isSelected ? color.withOpacity(0.08) : null,
        ),
        child: Column(
          children: [
            Icon(
              isSelected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_off,
              color: isSelected ? color : TekaColors.mutedForeground,
              size: 20,
            ),
            const SizedBox(height: 6),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected ? color : TekaColors.foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentOption extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  const _PaymentOption({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border.all(
            color: isSelected ? TekaColors.tekaRed : TekaColors.border,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(8),
          color: isSelected ? TekaColors.tekaRed.withOpacity(0.04) : null,
        ),
        child: Row(
          children: [
            Icon(
              icon,
              color: isSelected
                  ? TekaColors.tekaRed
                  : TekaColors.mutedForeground,
              size: 28,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                      color: isSelected
                          ? TekaColors.foreground
                          : TekaColors.foreground,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: TekaColors.mutedForeground,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              isSelected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_off,
              color: isSelected
                  ? TekaColors.tekaRed
                  : TekaColors.mutedForeground,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

class _ReviewStep extends StatelessWidget {
  final CartState cartState;
  final CheckoutState checkoutState;
  final TextEditingController noteController;
  final AppLocalizations l10n;
  final String locale;
  final ValueChanged<String> onNoteChanged;

  const _ReviewStep({
    required this.cartState,
    required this.checkoutState,
    required this.noteController,
    required this.l10n,
    required this.locale,
    required this.onNoteChanged,
  });

  static String _providerDisplayName(String provider, AppLocalizations l10n) {
    switch (provider) {
      case 'M_PESA':
        return l10n.checkoutMpesa;
      case 'AIRTEL_MONEY':
        return l10n.checkoutAirtelMoney;
      case 'ORANGE_MONEY':
        return l10n.checkoutOrangeMoney;
      default:
        return provider;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          l10n.checkoutReview,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: TekaColors.foreground,
              ),
        ),
        const SizedBox(height: 12),

        // Address summary
        if (checkoutState.selectedAddress != null) ...[
          _SummarySection(
            icon: Icons.location_on_outlined,
            title: l10n.checkoutSelectAddress,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (checkoutState.selectedAddress!.label != null)
                  Text(
                    checkoutState.selectedAddress!.label!,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      color: TekaColors.foreground,
                    ),
                  ),
                Text(
                  checkoutState.selectedAddress!.displayAddress,
                  style: const TextStyle(
                    color: TekaColors.foreground,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        // Payment method summary
        _SummarySection(
          icon: Icons.payment_outlined,
          title: l10n.checkoutPaymentMethod,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                checkoutState.paymentMethod == 'COD'
                    ? l10n.checkoutCOD
                    : l10n.checkoutMobileMoney,
                style: const TextStyle(
                  color: TekaColors.foreground,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              if (checkoutState.paymentMethod == 'MOBILE_MONEY' &&
                  checkoutState.selectedProvider != null) ...[
                const SizedBox(height: 2),
                Text(
                  _providerDisplayName(checkoutState.selectedProvider!, l10n),
                  style: const TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 12,
                  ),
                ),
              ],
              if (checkoutState.paymentMethod == 'MOBILE_MONEY' &&
                  checkoutState.payerPhone.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  checkoutState.payerPhone,
                  style: const TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 12,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Items list
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: TekaColors.border),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            children: [
              for (var i = 0; i < cartState.items.length; i++) ...[
                if (i > 0)
                  const Divider(height: 1, color: TekaColors.border),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: SizedBox(
                          width: 50,
                          height: 50,
                          child: cartState.items[i].product.thumbnailUrl !=
                                      null &&
                                  cartState.items[i].product.thumbnailUrl!
                                      .isNotEmpty
                              ? CachedNetworkImage(
                                  imageUrl: cartState
                                      .items[i].product.thumbnailUrl!,
                                  fit: BoxFit.cover,
                                  placeholder: (_, __) => Container(
                                    color: TekaColors.muted,
                                  ),
                                  errorWidget: (_, __, ___) => Container(
                                    color: TekaColors.muted,
                                    child: const Icon(
                                      Icons.image_outlined,
                                      size: 20,
                                      color: TekaColors.mutedForeground,
                                    ),
                                  ),
                                )
                              : Container(
                                  color: TekaColors.muted,
                                  child: const Icon(
                                    Icons.image_outlined,
                                    size: 20,
                                    color: TekaColors.mutedForeground,
                                  ),
                                ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              cartState.items[i].product
                                  .localizedTitle(locale),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                color: TekaColors.foreground,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${formatCDF(cartState.items[i].product.priceCDF)} x ${cartState.items[i].quantity}',
                              style: const TextStyle(
                                color: TekaColors.mutedForeground,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        formatCDF(cartState.items[i].subtotalCDF),
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                          color: TekaColors.foreground,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Note field
        TextField(
          controller: noteController,
          onChanged: onNoteChanged,
          maxLines: 2,
          decoration: InputDecoration(
            labelText: l10n.checkoutNote,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: TekaColors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: TekaColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: TekaColors.tekaRed),
            ),
            contentPadding: const EdgeInsets.all(12),
          ),
          style: const TextStyle(fontSize: 14),
        ),
        const SizedBox(height: 16),

        // Price summary
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: TekaColors.muted,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    l10n.orderSubtotal,
                    style: const TextStyle(
                      color: TekaColors.mutedForeground,
                      fontSize: 14,
                    ),
                  ),
                  Text(
                    formatCDF(cartState.totalCDF),
                    style: const TextStyle(
                      color: TekaColors.foreground,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    l10n.checkoutDeliveryFee,
                    style: const TextStyle(
                      color: TekaColors.mutedForeground,
                      fontSize: 14,
                    ),
                  ),
                  const Text(
                    '--',
                    style: TextStyle(
                      color: TekaColors.foreground,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Divider(color: TekaColors.border),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    l10n.cartTotal,
                    style: const TextStyle(
                      color: TekaColors.foreground,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    formatCDF(cartState.totalCDF),
                    style: const TextStyle(
                      color: TekaColors.tekaRed,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SummarySection extends StatelessWidget {
  final IconData icon;
  final String title;
  final Widget child;

  const _SummarySection({
    required this.icon,
    required this.title,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: TekaColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            color: TekaColors.mutedForeground,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: TekaColors.mutedForeground,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                child,
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Bottom sheet for creating a new address with city/commune dropdowns.
class _AddAddressSheet extends StatefulWidget {
  final AppLocalizations l10n;
  final CityRepository cityRepository;
  final Future<bool> Function(Map<String, dynamic> data) onSave;

  const _AddAddressSheet({
    required this.l10n,
    required this.cityRepository,
    required this.onSave,
  });

  @override
  State<_AddAddressSheet> createState() => _AddAddressSheetState();
}

class _AddAddressSheetState extends State<_AddAddressSheet> {
  List<CityModel> _cities = [];
  List<CommuneModel> _communes = [];
  bool _isLoadingCities = true;
  bool _isLoadingCommunes = false;
  bool _isSaving = false;

  CityModel? _selectedCity;
  CommuneModel? _selectedCommune;

  final _avenueController = TextEditingController();
  final _referenceController = TextEditingController();
  final _recipientNameController = TextEditingController();
  final _recipientPhoneController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadCities();
  }

  @override
  void dispose() {
    _avenueController.dispose();
    _referenceController.dispose();
    _recipientNameController.dispose();
    _recipientPhoneController.dispose();
    super.dispose();
  }

  Future<void> _loadCities() async {
    try {
      final cities = await widget.cityRepository.getCities();
      if (mounted) {
        setState(() {
          _cities = cities.where((c) => c.isActive).toList()
            ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
          _isLoadingCities = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoadingCities = false);
    }
  }

  Future<void> _loadCommunes(String cityId) async {
    setState(() {
      _isLoadingCommunes = true;
      _communes = [];
      _selectedCommune = null;
    });
    try {
      final communes = await widget.cityRepository.getCommunes(cityId);
      if (mounted) {
        setState(() {
          _communes = communes;
          _isLoadingCommunes = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoadingCommunes = false);
    }
  }

  Future<void> _save() async {
    if (_selectedCity == null || _selectedCommune == null) return;

    setState(() => _isSaving = true);

    final data = <String, dynamic>{
      'province': _selectedCity!.province,
      'town': _selectedCity!.name['fr'] ?? '',
      'neighborhood': _selectedCommune!.name['fr'] ?? '',
      'cityId': _selectedCity!.id,
      'communeId': _selectedCommune!.id,
    };
    if (_avenueController.text.trim().isNotEmpty) {
      data['avenue'] = _avenueController.text.trim();
    }
    if (_referenceController.text.trim().isNotEmpty) {
      data['details'] = _referenceController.text.trim();
    }
    if (_recipientNameController.text.trim().isNotEmpty) {
      data['recipientName'] = _recipientNameController.text.trim();
    }
    if (_recipientPhoneController.text.trim().isNotEmpty) {
      data['phone'] = _recipientPhoneController.text.trim();
    }

    final success = await widget.onSave(data);
    if (mounted) {
      setState(() => _isSaving = false);
      if (success) {
        Navigator.of(context).pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = widget.l10n;
    final locale = Localizations.localeOf(context).languageCode;

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: TekaColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),

            Text(
              l10n.newAddress,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: TekaColors.foreground,
                  ),
            ),
            const SizedBox(height: 16),

            // City dropdown
            Text(
              '${l10n.cityLabel} *',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: TekaColors.foreground,
              ),
            ),
            const SizedBox(height: 6),
            if (_isLoadingCities)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            else
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  border: Border.all(color: TekaColors.border),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _selectedCity?.id,
                    hint: Text(
                      l10n.cityPlaceholder,
                      style: const TextStyle(
                        color: TekaColors.mutedForeground,
                        fontSize: 14,
                      ),
                    ),
                    isExpanded: true,
                    items: _cities
                        .map((city) => DropdownMenuItem(
                              value: city.id,
                              child: Text(
                                '${city.getLocalizedName(locale)} (${city.province})',
                                style: const TextStyle(fontSize: 14),
                              ),
                            ))
                        .toList(),
                    onChanged: (value) {
                      if (value == null) return;
                      final city = _cities.firstWhere((c) => c.id == value);
                      setState(() => _selectedCity = city);
                      _loadCommunes(value);
                    },
                  ),
                ),
              ),
            const SizedBox(height: 12),

            // Commune dropdown
            if (_selectedCity != null) ...[
              Text(
                '${l10n.communeLabel} *',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: TekaColors.foreground,
                ),
              ),
              const SizedBox(height: 6),
              if (_isLoadingCommunes)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    border: Border.all(color: TekaColors.border),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _selectedCommune?.id,
                      hint: Text(
                        l10n.communePlaceholder,
                        style: const TextStyle(
                          color: TekaColors.mutedForeground,
                          fontSize: 14,
                        ),
                      ),
                      isExpanded: true,
                      items: _communes
                          .map((commune) => DropdownMenuItem(
                                value: commune.id,
                                child: Text(
                                  commune.getLocalizedName(locale),
                                  style: const TextStyle(fontSize: 14),
                                ),
                              ))
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        final commune =
                            _communes.firstWhere((c) => c.id == value);
                        setState(() => _selectedCommune = commune);
                      },
                    ),
                  ),
                ),
              const SizedBox(height: 12),
            ],

            // Avenue
            TextField(
              controller: _avenueController,
              decoration: InputDecoration(
                labelText: l10n.avenueLabel,
                hintText: l10n.avenueHint,
                prefixIcon: const Icon(Icons.signpost_outlined, size: 20),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.tekaRed),
                ),
                contentPadding: const EdgeInsets.all(12),
              ),
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 12),

            // Reference
            TextField(
              controller: _referenceController,
              decoration: InputDecoration(
                labelText: l10n.referenceLabel,
                hintText: l10n.referenceHint,
                prefixIcon: const Icon(Icons.place_outlined, size: 20),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.tekaRed),
                ),
                contentPadding: const EdgeInsets.all(12),
              ),
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 12),

            // Recipient name
            TextField(
              controller: _recipientNameController,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(
                labelText: l10n.recipientNameLabel,
                hintText: l10n.recipientNameHint,
                prefixIcon: const Icon(Icons.person_outline, size: 20),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.tekaRed),
                ),
                contentPadding: const EdgeInsets.all(12),
              ),
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 12),

            // Recipient phone
            TextField(
              controller: _recipientPhoneController,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: l10n.recipientPhoneLabel,
                hintText: l10n.recipientPhoneHint,
                prefixIcon: const Icon(Icons.phone_outlined, size: 20),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: TekaColors.tekaRed),
                ),
                contentPadding: const EdgeInsets.all(12),
              ),
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 20),

            // Save button
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      side: const BorderSide(color: TekaColors.border),
                    ),
                    child: Text(l10n.cancel),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: (_selectedCity != null &&
                            _selectedCommune != null &&
                            !_isSaving)
                        ? _save
                        : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: TekaColors.tekaRed,
                      disabledBackgroundColor: TekaColors.muted,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: _isSaving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(l10n.saveAddress),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
