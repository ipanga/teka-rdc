import 'package:dio/dio.dart';
import '../../../../core/network/dio_error_messages.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/earnings_repository.dart';
import '../../data/models/earning_model.dart';

class EarningsState {
  final SellerWallet? wallet;

  /// The wallet request failed and nothing is cached: the summary must say
  /// so instead of rendering zeros as if the seller had no money.
  final String? walletError;
  final List<SellerEarningModel> earnings;
  final List<PayoutModel> payouts;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;
  final int selectedTab;
  final int earningsPage;
  final int earningsTotal;
  final int payoutsPage;
  final int payoutsTotal;
  final int limit;

  const EarningsState({
    this.wallet,
    this.walletError,
    this.earnings = const [],
    this.payouts = const [],
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
    this.selectedTab = 0,
    this.earningsPage = 1,
    this.earningsTotal = 0,
    this.payoutsPage = 1,
    this.payoutsTotal = 0,
    this.limit = 20,
  });

  bool get hasMoreEarnings => earningsPage * limit < earningsTotal;
  bool get hasMorePayouts => payoutsPage * limit < payoutsTotal;

  /// The seller's open payout (REQUESTED / APPROVED / PROCESSING), if any —
  /// its amount is what the API has reserved from the earnings.
  PayoutModel? get openPayout {
    for (final p in payouts) {
      if (const {'REQUESTED', 'APPROVED', 'PROCESSING'}
          .contains(p.status.toUpperCase())) {
        return p;
      }
    }
    return null;
  }

  EarningsState copyWith({
    SellerWallet? wallet,
    String? walletError,
    bool clearWalletError = false,
    List<SellerEarningModel>? earnings,
    List<PayoutModel>? payouts,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    int? selectedTab,
    int? earningsPage,
    int? earningsTotal,
    int? payoutsPage,
    int? payoutsTotal,
    int? limit,
    bool clearError = false,
  }) {
    return EarningsState(
      wallet: wallet ?? this.wallet,
      walletError:
          clearWalletError ? null : (walletError ?? this.walletError),
      earnings: earnings ?? this.earnings,
      payouts: payouts ?? this.payouts,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
      selectedTab: selectedTab ?? this.selectedTab,
      earningsPage: earningsPage ?? this.earningsPage,
      earningsTotal: earningsTotal ?? this.earningsTotal,
      payoutsPage: payoutsPage ?? this.payoutsPage,
      payoutsTotal: payoutsTotal ?? this.payoutsTotal,
      limit: limit ?? this.limit,
    );
  }
}

class EarningsNotifier extends StateNotifier<EarningsState> {
  final EarningsRepository _repository;

  // Starts loading and does NOT auto-fetch — the first load is driven off auth
  // status by `earningsProvider`. Firing in the constructor races token restore
  // on cold start (no bearer → 401 → cached error). See sellerProductsProvider.
  EarningsNotifier(this._repository) : super(const EarningsState(isLoading: true));

  Future<void> loadWallet() async {
    try {
      final wallet = await _repository.getWallet();
      if (mounted) {
        state = state.copyWith(wallet: wallet, clearWalletError: true);
      }
    } catch (e) {
      // Keep whatever wallet is cached; the summary shows a scoped retry
      // rather than zeros (a « 0 FC » balance is a statement, not a shrug).
      if (mounted) state = state.copyWith(walletError: friendlyErrorMessage(e));
    }
  }

  Future<void> loadEarnings({int page = 1}) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.getEarnings(
        page: page,
        limit: state.limit,
      );
      if (mounted) {
        state = state.copyWith(
          earnings: result.items,
          earningsPage: page,
          earningsTotal: result.total,
          isLoading: false,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(
          isLoading: false,
          error: friendlyErrorMessage(e),
        );
      }
    }
  }

  Future<void> loadMoreEarnings() async {
    if (state.isLoadingMore || !state.hasMoreEarnings) return;
    state = state.copyWith(isLoadingMore: true);
    try {
      final nextPage = state.earningsPage + 1;
      final result = await _repository.getEarnings(
        page: nextPage,
        limit: state.limit,
      );
      if (mounted) {
        state = state.copyWith(
          earnings: [...state.earnings, ...result.items],
          earningsPage: nextPage,
          earningsTotal: result.total,
          isLoadingMore: false,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(isLoadingMore: false);
      }
    }
  }

  Future<void> loadPayouts({int page = 1}) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.getPayouts(
        page: page,
        limit: state.limit,
      );
      if (mounted) {
        state = state.copyWith(
          payouts: result.items,
          payoutsPage: page,
          payoutsTotal: result.total,
          isLoading: false,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(
          isLoading: false,
          error: friendlyErrorMessage(e),
        );
      }
    }
  }

  Future<void> loadMorePayouts() async {
    if (state.isLoadingMore || !state.hasMorePayouts) return;
    state = state.copyWith(isLoadingMore: true);
    try {
      final nextPage = state.payoutsPage + 1;
      final result = await _repository.getPayouts(
        page: nextPage,
        limit: state.limit,
      );
      if (mounted) {
        state = state.copyWith(
          payouts: [...state.payouts, ...result.items],
          payoutsPage: nextPage,
          payoutsTotal: result.total,
          isLoadingMore: false,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(isLoadingMore: false);
      }
    }
  }

  /// The saved reusable payout destination (B1), for prefilling the form.
  Future<SellerPayoutMethod?> getSavedPayoutMethod() async {
    try {
      return await _repository.getPayoutMethod();
    } catch (_) {
      return null;
    }
  }

  /// Saves the destination (so it prefills next time) then requests the payout.
  /// Returns null on success, or the API error message on failure.
  Future<String?> requestPayout(String method, String phone) async {
    try {
      await _repository.updatePayoutMethod(
        payoutMethod: method,
        payoutPhone: phone,
      );
      await _repository.requestPayout(
        payoutMethod: method,
        payoutPhone: phone,
      );
      // The request moved money: balance, earnings states and payouts.
      await Future.wait([loadWallet(), loadEarnings(), loadPayouts()]);
      return null;
    } on DioException catch (e) {
      // The API's French reason (minimum balance with the current amount,
      // an open payout, an invalid destination) — then refetch the
      // authoritative balance and payouts, because a 400 / 409 here means
      // the screen's numbers are stale.
      final data = e.response?.data;
      String message = 'Une erreur est survenue. Veuillez réessayer.';
      if (data is Map) {
        final err = data['error'];
        if (err is Map && err['message'] != null) {
          message = err['message'].toString();
        } else if (data['message'] != null) {
          message = data['message'].toString();
        }
      } else {
        message = friendlyErrorMessage(e);
      }
      final status = e.response?.statusCode ?? 0;
      if (status == 400 || status == 409) {
        await Future.wait([loadWallet(), loadEarnings(), loadPayouts()]);
      }
      return message;
    } catch (_) {
      return 'Une erreur est survenue. Veuillez réessayer.';
    }
  }

  void selectTab(int tab) {
    if (tab == state.selectedTab) return;
    state = state.copyWith(selectedTab: tab);
    if (tab == 0 && state.earnings.isEmpty) {
      loadEarnings();
    } else if (tab == 1 && state.payouts.isEmpty) {
      loadPayouts();
    }
  }

  /// Wallet + both lists. A payout changes all three at once (the balance,
  /// the earnings' states, the payouts), so refreshing only the visible tab
  /// left « Disponible » rows under a « virement en cours » balance
  /// (runtime QA, Seller UX PR E).
  Future<void> refresh() async {
    await Future.wait([loadWallet(), loadEarnings(), loadPayouts()]);
  }
}

final earningsProvider =
    StateNotifierProvider<EarningsNotifier, EarningsState>((ref) {
  final notifier = EarningsNotifier(ref.read(earningsRepositoryProvider));
  // Load off auth status, not the constructor — see sellerProductsProvider.
  ref.listen<AuthStatus>(authProvider.select((s) => s.status), (prev, next) {
    if (next == AuthStatus.authenticated && prev != AuthStatus.authenticated) {
      notifier.loadWallet();
      notifier.loadEarnings();
    }
  }, fireImmediately: true);
  return notifier;
});
