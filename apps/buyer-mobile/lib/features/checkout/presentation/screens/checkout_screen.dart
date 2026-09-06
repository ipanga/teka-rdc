import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/connectivity/connectivity_provider.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../cart/presentation/providers/cart_provider.dart';
import '../../../address/presentation/widgets/address_form_sheet.dart';
import '../../../city/data/city_repository.dart';
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
          address: checkoutState.selectedAddress,
          isLoading: checkoutState.isLoadingAddresses,
          onEditAddress: () => _showAddressSheet(
            context,
            existing: checkoutState.selectedAddress,
          ),
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

  /// One sheet for both cases. `existing == null` creates; otherwise it edits
  /// in place, so checkout never offers a second address.
  void _showAddressSheet(BuildContext context, {AddressModel? existing}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => AddressFormSheet(
        cityRepository: ref.read(cityRepositoryProvider),
        initial: existing,
        onSave: (data) async {
          final notifier = ref.read(checkoutProvider.notifier);
          return existing == null
              ? notifier.createAddress(data)
              : notifier.updateAddress(existing.id, data);
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
            // The idempotency key is owned by the notifier now: generated once
            // per checkout and reused on every retry, so a double-tap or a
            // retry-after-timeout can't create a duplicate order. (The API
            // requires an RFC4122 v4 UUID; the notifier generates one.)
            ? () => ref.read(checkoutProvider.notifier).placeOrder()
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

/// The buyer's single delivery address, shown for confirmation.
///
/// Was a radio list over every saved address plus an "Ajouter une adresse"
/// button, which let buyers accumulate addresses indefinitely from checkout.
/// A buyer now has exactly one, so there is nothing to choose between — the
/// address is displayed with a « Modifier » action instead.
class _AddressStep extends StatelessWidget {
  final AddressModel? address;
  final bool isLoading;
  final VoidCallback onEditAddress;

  const _AddressStep({
    required this.address,
    required this.isLoading,
    required this.onEditAddress,
  });

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Center(
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }

    final current = address;
    if (current == null) {
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
                onPressed: onEditAddress,
                icon: const Icon(Icons.add_location_alt_outlined),
                label: const Text("Ajouter mon adresse"),
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
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: TekaColors.border),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.location_on_outlined,
                color: TekaColors.tekaRed,
                size: 20,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      current.displayAddress,
                      style: const TextStyle(
                        color: TekaColors.foreground,
                        fontSize: 13,
                      ),
                    ),
                    if (current.reference != null &&
                        current.reference!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          current.reference!,
                          style: const TextStyle(
                            color: TekaColors.mutedForeground,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    if (current.displayRecipient.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          current.displayRecipient,
                          style: const TextStyle(
                            color: TekaColors.mutedForeground,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: onEditAddress,
          icon: const Icon(Icons.edit_outlined, size: 18),
          label: const Text("Modifier"),
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
              if (checkoutState.pricesChanged) ...[
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: TekaColors.tekaRed.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: TekaColors.tekaRed.withValues(alpha: 0.35),
                    ),
                  ),
                  child: const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline, size: 18, color: TekaColors.tekaRed),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Les prix de votre panier ont été mis à jour. Vérifiez le montant avant de confirmer.',
                          style: TextStyle(fontSize: 13, color: TekaColors.foreground),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
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
                            // Unit price = what is charged (promo when one
                            // applies); the regular price stays visible struck
                            // through, as on the product page and the cart.
                            Row(
                              children: [
                                Text(
                                  '${formatCDF(cartState.items[i].product.effectiveCDF)} x ${cartState.items[i].quantity}',
                                  style: const TextStyle(
                                    color: TekaColors.mutedForeground,
                                    fontSize: 12,
                                  ),
                                ),
                                if (cartState.items[i].product.hasDiscount) ...[
                                  const SizedBox(width: 6),
                                  Text(
                                    formatCDF(cartState.items[i].product.priceCDF),
                                    style: const TextStyle(
                                      color: TekaColors.mutedForeground,
                                      fontSize: 11,
                                      decoration: TextDecoration.lineThrough,
                                    ),
                                  ),
                                ],
                              ],
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
                    // The quote's subtotal is the server's figure at current
                    // prices; the cart total (same rule) fills in until it lands.
                    formatCDF(checkoutState.quoteSubtotalCDF ?? cartState.totalCDF),
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
              // Non-blocking heads-up when the delivery address is in a
              // different town than the product(s). Checkout stays enabled.
              if (checkoutState.deliveryAvailable != false &&
                  checkoutState.townMismatch) ...[
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFB45309).withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: const Color(0xFFB45309).withValues(alpha: 0.30),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.info_outline,
                        size: 18,
                        color: Color(0xFFB45309),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          "L'adresse de livraison sélectionnée se trouve dans une ville différente de celle des produits. Cela peut entraîner des frais de transport supplémentaires. Veuillez vérifier votre adresse avant de confirmer la commande.",
                          style: const TextStyle(
                            color: Color(0xFF92400E),
                            fontSize: 13,
                            height: 1.4,
                          ),
                        ),
                      ),
                    ],
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
                    // Grand total = the quote's total (subtotal + delivery fee
                    // as the server computes them). Before the quote lands
                    // there is no fee yet, so show the cart total with '…'
                    // rather than a figure that is about to change.
                    checkoutState.quoteTotalCDF != null
                        ? formatCDF(checkoutState.quoteTotalCDF!)
                        : checkoutState.deliveryFeeCDF != null
                            ? formatCDF(
                                (BigInt.parse(cartState.totalCDF) +
                                        BigInt.parse(checkoutState.deliveryFeeCDF!))
                                    .toString(),
                              )
                            : '${formatCDF(cartState.totalCDF)} + …',
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
