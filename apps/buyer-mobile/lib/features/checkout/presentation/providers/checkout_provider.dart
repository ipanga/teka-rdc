import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../cart/presentation/providers/cart_provider.dart';
import '../../data/checkout_repository.dart';
import '../../data/models/checkout_model.dart';

enum CheckoutStep { address, payment, review, processing, success }

class CheckoutState {
  final CheckoutStep step;
  final List<AddressModel> addresses;
  final AddressModel? selectedAddress;
  // Always 'COD' since Mobile Money was retired (PR B1, 2026-05-25). Field
  // retained so legacy orders (placed when MM was active) still type-check
  // on the read side.
  final String paymentMethod;
  final String buyerNote;
  final List<CheckoutOrderModel> orders;
  final String? checkoutGroupId;
  final bool paymentPending;
  final String? error;
  final bool isProcessing;
  final bool isLoadingAddresses;
  // Delivery fee preview (centimes CDF) for the selected address — null until
  // the quote resolves. Equals what the order is charged (same server calc).
  final String? deliveryFeeCDF;
  final bool isLoadingQuote;
  // Whether an active delivery zone covers the selected address. null = not yet
  // resolved; false = blocked (no zone / quote failed) — never silently free.
  final bool? deliveryAvailable;
  // True when a seller ships from a different town than the delivery address —
  // a NON-blocking warning that transport cost may rise.
  final bool townMismatch;

  /// Subtotal and grand total as computed by `POST /v1/checkout/quote` from
  /// the buyer's cart at *current* prices — the same calculation the order
  /// will be charged (`CheckoutService.checkout`). Null until the quote lands.
  final String? quoteSubtotalCDF;
  final String? quoteTotalCDF;

  /// True when the quote's subtotal differed from the cart the buyer was
  /// looking at (a price or promotion changed since the item was added). The
  /// cart is refreshed and the review screen says so before confirmation.
  final bool pricesChanged;

  const CheckoutState({
    this.step = CheckoutStep.address,
    this.addresses = const [],
    this.selectedAddress,
    this.paymentMethod = 'COD',
    this.buyerNote = '',
    this.orders = const [],
    this.checkoutGroupId,
    this.paymentPending = false,
    this.error,
    this.isProcessing = false,
    this.isLoadingAddresses = false,
    this.deliveryFeeCDF,
    this.isLoadingQuote = false,
    this.deliveryAvailable,
    this.townMismatch = false,
    this.quoteSubtotalCDF,
    this.quoteTotalCDF,
    this.pricesChanged = false,
  });

  CheckoutState copyWith({
    CheckoutStep? step,
    List<AddressModel>? addresses,
    AddressModel? selectedAddress,
    String? paymentMethod,
    String? buyerNote,
    List<CheckoutOrderModel>? orders,
    String? checkoutGroupId,
    bool? paymentPending,
    String? error,
    bool? isProcessing,
    bool? isLoadingAddresses,
    String? deliveryFeeCDF,
    bool? isLoadingQuote,
    bool? deliveryAvailable,
    bool? townMismatch,
    String? quoteSubtotalCDF,
    String? quoteTotalCDF,
    bool? pricesChanged,
    bool clearError = false,
    bool clearAddress = false,
    bool clearDeliveryFee = false,
  }) {
    return CheckoutState(
      step: step ?? this.step,
      addresses: addresses ?? this.addresses,
      selectedAddress:
          clearAddress ? null : (selectedAddress ?? this.selectedAddress),
      paymentMethod: paymentMethod ?? this.paymentMethod,
      buyerNote: buyerNote ?? this.buyerNote,
      orders: orders ?? this.orders,
      checkoutGroupId: checkoutGroupId ?? this.checkoutGroupId,
      paymentPending: paymentPending ?? this.paymentPending,
      error: clearError ? null : (error ?? this.error),
      isProcessing: isProcessing ?? this.isProcessing,
      isLoadingAddresses: isLoadingAddresses ?? this.isLoadingAddresses,
      deliveryFeeCDF:
          clearDeliveryFee ? null : (deliveryFeeCDF ?? this.deliveryFeeCDF),
      isLoadingQuote: isLoadingQuote ?? this.isLoadingQuote,
      deliveryAvailable:
          clearDeliveryFee ? null : (deliveryAvailable ?? this.deliveryAvailable),
      townMismatch:
          clearDeliveryFee ? false : (townMismatch ?? this.townMismatch),
      quoteSubtotalCDF:
          clearDeliveryFee ? null : (quoteSubtotalCDF ?? this.quoteSubtotalCDF),
      quoteTotalCDF:
          clearDeliveryFee ? null : (quoteTotalCDF ?? this.quoteTotalCDF),
      pricesChanged: pricesChanged ?? this.pricesChanged,
    );
  }

  bool get canProceedToPayment => selectedAddress != null;

  bool get canProceedToReview => selectedAddress != null;

  // Block when delivery isn't available for the address — the server also
  // rejects such an order, but we gate the button so the buyer isn't surprised.
  bool get canPlaceOrder =>
      selectedAddress != null && !isProcessing && deliveryAvailable == true;
}

class CheckoutNotifier extends StateNotifier<CheckoutState> {
  final CheckoutRepository _repository;

  /// Used only to reach [cartProvider] once an order is confirmed. Keeping the
  /// cart transition here (rather than in a widget's `ref.listen`) means it
  /// runs exactly once per successful checkout and cannot be skipped by a
  /// screen being disposed mid-flight.
  final Ref _ref;

  /// Stable idempotency key for THIS checkout intent. Generated once on the
  /// first placeOrder attempt and reused on every retry, so a double-tap or a
  /// retry-after-timeout resolves to the same server-side order instead of
  /// creating a duplicate. The provider is autoDispose, so a brand-new checkout
  /// screen gets a fresh notifier (and key); we also clear it on success.
  String? _idempotencyKey;

  CheckoutNotifier(this._repository, this._ref) : super(const CheckoutState()) {
    _loadAddresses();
  }

  Future<void> _loadAddresses() async {
    state = state.copyWith(isLoadingAddresses: true, clearError: true);
    try {
      final addresses = await _repository.getAddresses();
      // Auto-select default address if available
      final defaultAddress = addresses.where((a) => a.isDefault).firstOrNull;
      state = state.copyWith(
        addresses: addresses,
        selectedAddress: defaultAddress ?? (addresses.isNotEmpty ? addresses.first : null),
        isLoadingAddresses: false,
        clearDeliveryFee: true,
      );
      _fetchQuote();
    } on DioException catch (e) {
      state = state.copyWith(
        isLoadingAddresses: false,
        error: extractDioErrorMessage(e),
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingAddresses: false,
        error: friendlyErrorMessage(e),
      );
    }
  }

  void selectAddress(AddressModel address) {
    state = state.copyWith(
      selectedAddress: address,
      clearError: true,
      clearDeliveryFee: true,
    );
    _fetchQuote();
  }

  /// Fetch the delivery-fee preview for the selected address. On failure the
  /// fee is left unknown and delivery is marked UNAVAILABLE (never silently
  /// free) — checkout is blocked until a valid fee resolves. A stale response
  /// (address changed mid-flight) is discarded.
  Future<void> _fetchQuote() async {
    final address = state.selectedAddress;
    if (address == null) return;
    state = state.copyWith(isLoadingQuote: true);
    try {
      final quote = await _repository.getQuote(address.id);
      if (!mounted) return;
      if (state.selectedAddress?.id != address.id) return;
      // A1: the quote is the server's arithmetic on the cart at current
      // prices. If it disagrees with the cart the buyer was shown, a price or
      // promotion moved since the item was added — refresh the lines and
      // flag it so the buyer confirms the new amount knowingly.
      final shownSubtotal = _ref.read(cartProvider).totalCDF;
      final changed = quote.subtotalCDF != shownSubtotal;
      state = state.copyWith(
        deliveryFeeCDF: quote.deliveryAvailable ? quote.deliveryFeeCDF : null,
        deliveryAvailable: quote.deliveryAvailable,
        townMismatch: quote.townMismatch,
        quoteSubtotalCDF: quote.subtotalCDF,
        quoteTotalCDF: quote.deliveryAvailable ? quote.totalCDF : null,
        pricesChanged: state.pricesChanged || changed,
        isLoadingQuote: false,
      );
      if (changed) {
        await _ref.read(cartProvider.notifier).fetchCart();
      }
    } catch (_) {
      if (!mounted) return;
      if (state.selectedAddress?.id != address.id) return;
      state = state.copyWith(isLoadingQuote: false, deliveryAvailable: false);
    }
  }

  /// Create a new address via API, reload addresses, and select the new one.
  Future<bool> createAddress(Map<String, dynamic> data) async {
    state = state.copyWith(clearError: true);
    try {
      final newAddress = await _repository.createAddress(data);
      // Reload all addresses
      final addresses = await _repository.getAddresses();
      state = state.copyWith(
        addresses: addresses,
        selectedAddress: newAddress,
        clearDeliveryFee: true,
      );
      _fetchQuote();
      return true;
    } on DioException catch (e) {
      state = state.copyWith(error: extractDioErrorMessage(e));
      return false;
    } catch (e) {
      state = state.copyWith(error: friendlyErrorMessage(e));
      return false;
    }
  }

  /// Edit the buyer's single address in place, then re-quote.
  ///
  /// The town can change, which changes the delivery fee — so the fee is
  /// cleared and re-fetched. `canPlaceOrder` gates on `deliveryAvailable ==
  /// true`, so the confirm button stays disabled until the new quote lands
  /// rather than charging a stale fee.
  Future<bool> updateAddress(String id, Map<String, dynamic> data) async {
    state = state.copyWith(clearError: true);
    try {
      final updated = await _repository.updateAddress(id, data);
      final addresses = await _repository.getAddresses();
      state = state.copyWith(
        addresses: addresses,
        selectedAddress: updated,
        clearDeliveryFee: true,
      );
      _fetchQuote();
      return true;
    } on DioException catch (e) {
      state = state.copyWith(error: extractDioErrorMessage(e));
      return false;
    } catch (e) {
      state = state.copyWith(error: friendlyErrorMessage(e));
      return false;
    }
  }

  void selectPaymentMethod(String method) {
    state = state.copyWith(paymentMethod: method, clearError: true);
  }

  void setBuyerNote(String note) {
    state = state.copyWith(buyerNote: note);
  }

  void goToStep(CheckoutStep step) {
    state = state.copyWith(step: step, clearError: true);
  }

  void nextStep() {
    switch (state.step) {
      case CheckoutStep.address:
        if (state.canProceedToPayment) {
          state = state.copyWith(step: CheckoutStep.payment, clearError: true);
        }
        break;
      case CheckoutStep.payment:
        if (state.canProceedToReview) {
          state = state.copyWith(step: CheckoutStep.review, clearError: true);
        }
        break;
      case CheckoutStep.review:
      case CheckoutStep.processing:
      case CheckoutStep.success:
        break;
    }
  }

  void previousStep() {
    switch (state.step) {
      case CheckoutStep.address:
        break;
      case CheckoutStep.payment:
        state = state.copyWith(step: CheckoutStep.address, clearError: true);
        break;
      case CheckoutStep.review:
        state = state.copyWith(step: CheckoutStep.payment, clearError: true);
        break;
      case CheckoutStep.processing:
      case CheckoutStep.success:
        break;
    }
  }

  Future<bool> placeOrder() async {
    if (!state.canPlaceOrder) return false;

    // Generate once, reuse on every retry (idempotent/resumable checkout).
    final idempotencyKey = _idempotencyKey ??= const Uuid().v4();

    state = state.copyWith(
      step: CheckoutStep.processing,
      isProcessing: true,
      clearError: true,
    );

    try {
      final request = CheckoutRequest(
        deliveryAddressId: state.selectedAddress!.id,
        paymentMethod: state.paymentMethod,
        idempotencyKey: idempotencyKey,
        buyerNote: state.buyerNote.isNotEmpty ? state.buyerNote : null,
      );

      final response = await _repository.checkout(request);

      // The order is committed. The server emptied the cart inside that same
      // transaction, so bring local cart state in line BEFORE flipping to
      // success: the success screen and the tab badge are then already correct
      // on first paint, with no pull-to-refresh. This also covers the
      // idempotent-replay response, which reports orders without re-clearing
      // anything server-side.
      //
      // Guarded on purpose — the order exists either way, so a cart-sync
      // hiccup must never be reported to the buyer as a failed checkout.
      try {
        await _ref.read(cartProvider.notifier).onOrderPlaced();
      } catch (_) {
        // Cart reconciles on its next fetch; the order is unaffected.
      }

      // Success → drop the key so a subsequent (distinct) checkout starts fresh.
      _idempotencyKey = null;
      state = state.copyWith(
        step: CheckoutStep.success,
        orders: response.orders,
        checkoutGroupId: response.checkoutGroupId,
        paymentPending: response.paymentPending,
        isProcessing: false,
      );
      return true;
    } on DioException catch (e) {
      state = state.copyWith(
        step: CheckoutStep.review,
        isProcessing: false,
        error: extractDioErrorMessage(e),
      );
      return false;
    } catch (e) {
      state = state.copyWith(
        step: CheckoutStep.review,
        isProcessing: false,
        error: friendlyErrorMessage(e),
      );
      return false;
    }
  }

}

final checkoutProvider =
    StateNotifierProvider.autoDispose<CheckoutNotifier, CheckoutState>((ref) {
  return CheckoutNotifier(ref.read(checkoutRepositoryProvider), ref);
});

/// Provider to fetch addresses (reusable)
final addressesProvider = FutureProvider<List<AddressModel>>((ref) {
  final repository = ref.read(checkoutRepositoryProvider);
  return repository.getAddresses();
});
