import 'dart:math';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/connectivity/connectivity_provider.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
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
  void initState() {
    super.initState();
    // Buyer-owned UI event — one per checkout entry (parity with buyer-web).
    final cart = ref.read(cartProvider);
    const PosthogAnalytics().capture('checkout_started', properties: {
      'item_count': cart.totalItems,
      'cart_value_cdf': int.tryParse(cart.totalCDF) ?? 0,
    });
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
        title: Text("Passer la commande"),
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
              locale,
            ),
          ),
        ],
      ),
      bottomNavigationBar: checkoutState.step != CheckoutStep.processing
          ? _buildBottomBar(checkoutState)
          : null,
    );
  }

  Widget _buildStepContent(
    CheckoutState checkoutState,
    CartState cartState,
    String locale,
  ) {
    switch (checkoutState.step) {
      case CheckoutStep.address:
        return _AddressStep(
          addresses: checkoutState.addresses,
          selectedAddress: checkoutState.selectedAddress,
          isLoading: checkoutState.isLoadingAddresses,
          onSelect: (address) =>
              ref.read(checkoutProvider.notifier).selectAddress(address),
          onAddAddress: () => _showAddAddressSheet(context),
        );
      case CheckoutStep.payment:
        return _PaymentStep(
          selectedMethod: checkoutState.paymentMethod,
          onSelect: (method) =>
              ref.read(checkoutProvider.notifier).selectPaymentMethod(method),
        );
      case CheckoutStep.review:
        return _ReviewStep(
          cartState: cartState,
          checkoutState: checkoutState,
          noteController: _noteController,
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
                "Traitement en cours...",
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

  void _showAddAddressSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _AddAddressSheet(
        cityRepository: ref.read(cityRepositoryProvider),
        onSave: (data) async {
          final success =
              await ref.read(checkoutProvider.notifier).createAddress(data);
          return success;
        },
      ),
    );
  }

  Widget _buildBottomBar(CheckoutState checkoutState) {
    final bool canProceed;
    final String buttonText;
    final VoidCallback? onPressed;

    switch (checkoutState.step) {
      case CheckoutStep.address:
        canProceed = checkoutState.canProceedToPayment;
        buttonText = "Suivant";
        onPressed =
            canProceed ? () => ref.read(checkoutProvider.notifier).nextStep() : null;
        break;
      case CheckoutStep.payment:
        canProceed = checkoutState.canProceedToReview;
        buttonText = "Suivant";
        onPressed = canProceed
            ? () => ref.read(checkoutProvider.notifier).nextStep()
            : null;
        break;
      case CheckoutStep.review:
        // Hard-block order placement when offline. Aligns with the
        // initiative spec ("Prevent duplicate submissions, accidental
        // retries, inconsistent states") and matches the user's locked
        // decision from the planning round. The button is set to
        // onPressed=null (visually disabled) when offline; the
        // _OfflineCheckoutNotice widget below the bottom bar shows the
        // French explanation so the user knows what to do.
        canProceed = checkoutState.canPlaceOrder &&
            !ref.watch(isOfflineProvider);
        buttonText = "Confirmer la commande";
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Inline French explanation when the review-step button is
          // disabled because of offline state. Only shown on the
          // review step + when actually offline — keeps the bottom bar
          // unchanged on every other step.
          if (checkoutState.step == CheckoutStep.review &&
              checkoutState.canPlaceOrder &&
              ref.watch(isOfflineProvider))
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.wifi_off_outlined,
                    color: TekaColors.destructive,
                    size: 14,
                  ),
                  const SizedBox(width: 6),
                  const Flexible(
                    child: Text(
                      'Connexion requise pour passer commande',
                      style: TextStyle(
                        color: TekaColors.destructive,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          SizedBox(
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
        ],
      ),
    );
  }
}

class _StepIndicator extends StatelessWidget {
  final CheckoutStep currentStep;

  const _StepIndicator({
    required this.currentStep,
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
  final ValueChanged<AddressModel> onSelect;
  final VoidCallback onAddAddress;

  const _AddressStep({
    required this.addresses,
    required this.selectedAddress,
    required this.isLoading,
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
                "Aucune adresse enregistree",
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: TekaColors.mutedForeground,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: onAddAddress,
                icon: const Icon(Icons.add_location_alt_outlined),
                label: Text("Ajouter une adresse"),
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
          "Adresse de livraison",
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
          label: Text("Ajouter une adresse"),
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

class _PaymentStep extends StatelessWidget {
  final String selectedMethod;
  final ValueChanged<String> onSelect;

  const _PaymentStep({
    required this.selectedMethod,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          "Mode de paiement",
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: TekaColors.foreground,
              ),
        ),
        const SizedBox(height: 12),
        _PaymentOption(
          title: "Paiement a la livraison",
          subtitle: 'Payez a la reception de votre commande',
          icon: Icons.payments_outlined,
          isSelected: selectedMethod == 'COD',
          onTap: () => onSelect('COD'),
        ),
      ],
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
  final String locale;
  final ValueChanged<String> onNoteChanged;

  const _ReviewStep({
    required this.cartState,
    required this.checkoutState,
    required this.noteController,
    required this.locale,
    required this.onNoteChanged,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          "Recapitulatif",
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
            title: "Adresse de livraison",
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
          title: "Mode de paiement",
          child: Text(
            "Paiement a la livraison",
            style: const TextStyle(
              color: TekaColors.foreground,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
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
                              cartState.items[i].product.title,
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
            labelText: "Note pour le vendeur",
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
                    "Sous-total",
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
                    "Frais de livraison",
                    style: const TextStyle(
                      color: TekaColors.mutedForeground,
                      fontSize: 14,
                    ),
                  ),
                  Text(
                    checkoutState.deliveryAvailable == false
                        ? "Non disponible"
                        : checkoutState.deliveryFeeCDF != null
                            ? formatCDF(checkoutState.deliveryFeeCDF!)
                            : (checkoutState.isLoadingQuote ? '…' : '--'),
                    style: TextStyle(
                      color: checkoutState.deliveryAvailable == false
                          ? TekaColors.tekaRed
                          : TekaColors.foreground,
                      fontSize: 14,
                      fontWeight: checkoutState.deliveryAvailable == false
                          ? FontWeight.w600
                          : FontWeight.normal,
                    ),
                  ),
                ],
              ),
              if (checkoutState.deliveryAvailable == false) ...[
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: TekaColors.tekaRed.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    "Aucune zone de livraison disponible pour cette adresse. Veuillez vérifier votre ville de livraison.",
                    style: const TextStyle(
                      color: TekaColors.tekaRed,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 8),
              const Divider(color: TekaColors.border),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    "Total",
                    style: const TextStyle(
                      color: TekaColors.foreground,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    formatCDF(
                      (BigInt.parse(cartState.totalCDF) +
                              BigInt.parse(checkoutState.deliveryFeeCDF ?? '0'))
                          .toString(),
                    ),
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
  final CityRepository cityRepository;
  final Future<bool> Function(Map<String, dynamic> data) onSave;

  const _AddAddressSheet({
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
      'town': _selectedCity!.name,
      'neighborhood': _selectedCommune!.name,
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
              "Nouvelle adresse",
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: TekaColors.foreground,
                  ),
            ),
            const SizedBox(height: 16),

            // City dropdown
            Text(
              'Ville *',
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
                      "Selectionnez une ville",
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
                                '${city.name} (${city.province})',
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
                'Commune *',
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
                        "Selectionnez une commune",
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
                                  commune.name,
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
                labelText: "Avenue / Rue",
                hintText: "Ex: Av. Lumumba n24",
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
                labelText: "Point de repere",
                hintText: "Ex: En face de la pharmacie",
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
                labelText: "Nom du destinataire",
                hintText: "Nom complet",
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
                labelText: "Telephone du destinataire",
                hintText: "+243...",
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
                    child: Text("Annuler"),
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
                        : Text("Enregistrer"),
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
