import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/checkout_repository.dart';
import '../../data/models/checkout_model.dart';

enum CheckoutStep { address, payment, review, processing, success }

class CheckoutState {
  final CheckoutStep step;
  final List<AddressModel> addresses;
  final AddressModel? selectedAddress;
  final String paymentMethod; // 'COD' or 'MOBILE_MONEY'
  final String? selectedProvider; // 'M_PESA', 'AIRTEL_MONEY', or 'ORANGE_MONEY'
  final String payerPhone; // +243XXXXXXXXX
  final String buyerNote;
  final List<CheckoutOrderModel> orders;
  final String? checkoutGroupId;
  final bool paymentPending;
  final String? error;
  final bool isProcessing;
  final bool isLoadingAddresses;

  const CheckoutState({
    this.step = CheckoutStep.address,
    this.addresses = const [],
    this.selectedAddress,
    this.paymentMethod = 'COD',
    this.selectedProvider,
    this.payerPhone = '',
    this.buyerNote = '',
    this.orders = const [],
    this.checkoutGroupId,
    this.paymentPending = false,
    this.error,
    this.isProcessing = false,
    this.isLoadingAddresses = false,
  });

  CheckoutState copyWith({
    CheckoutStep? step,
    List<AddressModel>? addresses,
    AddressModel? selectedAddress,
    String? paymentMethod,
    String? selectedProvider,
    String? payerPhone,
    String? buyerNote,
    List<CheckoutOrderModel>? orders,
    String? checkoutGroupId,
    bool? paymentPending,
    String? error,
    bool? isProcessing,
    bool? isLoadingAddresses,
    bool clearError = false,
    bool clearAddress = false,
    bool clearProvider = false,
  }) {
    return CheckoutState(
      step: step ?? this.step,
      addresses: addresses ?? this.addresses,
      selectedAddress:
          clearAddress ? null : (selectedAddress ?? this.selectedAddress),
      paymentMethod: paymentMethod ?? this.paymentMethod,
      selectedProvider:
          clearProvider ? null : (selectedProvider ?? this.selectedProvider),
      payerPhone: payerPhone ?? this.payerPhone,
      buyerNote: buyerNote ?? this.buyerNote,
      orders: orders ?? this.orders,
      checkoutGroupId: checkoutGroupId ?? this.checkoutGroupId,
      paymentPending: paymentPending ?? this.paymentPending,
      error: clearError ? null : (error ?? this.error),
      isProcessing: isProcessing ?? this.isProcessing,
      isLoadingAddresses: isLoadingAddresses ?? this.isLoadingAddresses,
    );
  }

  bool get canProceedToPayment => selectedAddress != null;

  bool get canProceedToReview {
    if (selectedAddress == null) return false;
    if (paymentMethod == 'MOBILE_MONEY') {
      return selectedProvider != null && payerPhone.isNotEmpty;
    }
    return true;
  }

  bool get canPlaceOrder =>
      selectedAddress != null && !isProcessing;
}

class CheckoutNotifier extends StateNotifier<CheckoutState> {
  final CheckoutRepository _repository;

  CheckoutNotifier(this._repository) : super(const CheckoutState()) {
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
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoadingAddresses: false,
        error: _extractErrorMessage(e),
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingAddresses: false,
        error: e.toString(),
      );
    }
  }

  void selectAddress(AddressModel address) {
    state = state.copyWith(selectedAddress: address, clearError: true);
  }

  void selectPaymentMethod(String method) {
    state = state.copyWith(
      paymentMethod: method,
      clearError: true,
      clearProvider: method != 'MOBILE_MONEY',
    );
  }

  void selectMobileMoneyProvider(String provider) {
    state = state.copyWith(selectedProvider: provider, clearError: true);
  }

  void setPayerPhone(String phone) {
    state = state.copyWith(payerPhone: phone);
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

  Future<bool> placeOrder(String idempotencyKey) async {
    if (!state.canPlaceOrder) return false;

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
        mobileMoneyProvider: state.paymentMethod == 'MOBILE_MONEY'
            ? state.selectedProvider
            : null,
        payerPhone: state.paymentMethod == 'MOBILE_MONEY'
            ? state.payerPhone
            : null,
      );

      final response = await _repository.checkout(request);

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
        error: _extractErrorMessage(e),
      );
      return false;
    } catch (e) {
      state = state.copyWith(
        step: CheckoutStep.review,
        isProcessing: false,
        error: e.toString(),
      );
      return false;
    }
  }

  String _extractErrorMessage(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return 'Connexion lente. Veuillez reessayer.';
    }
    if (e.type == DioExceptionType.connectionError) {
      return 'Pas de connexion internet.';
    }
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      final error = data['error'];
      if (error is Map && error['message'] != null) {
        return error['message'].toString();
      }
      return error.toString();
    }
    return 'Une erreur est survenue. Veuillez reessayer.';
  }
}

final checkoutProvider =
    StateNotifierProvider.autoDispose<CheckoutNotifier, CheckoutState>((ref) {
  return CheckoutNotifier(ref.read(checkoutRepositoryProvider));
});

/// Provider to fetch addresses (reusable)
final addressesProvider = FutureProvider<List<AddressModel>>((ref) {
  final repository = ref.read(checkoutRepositoryProvider);
  return repository.getAddresses();
});
