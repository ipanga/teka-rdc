import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/earnings_repository.dart';
import '../../data/models/earning_model.dart';

class EarningsState {
  final SellerWallet? wallet;
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

  EarningsState copyWith({
    SellerWallet? wallet,
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

  EarningsNotifier(this._repository) : super(const EarningsState()) {
    loadWallet();
    loadEarnings();
  }

  Future<void> loadWallet() async {
    try {
      final wallet = await _repository.getWallet();
      if (mounted) {
        state = state.copyWith(wallet: wallet);
      }
    } catch (e) {
      // Wallet load failure is non-critical, keep the rest of the state
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
          error: e.toString(),
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
          error: e.toString(),
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

  Future<bool> requestPayout(String method, String phone) async {
    try {
      await _repository.requestPayout(
        payoutMethod: method,
        payoutPhone: phone,
      );
      // Reload wallet and payouts after successful request
      await Future.wait([
        loadWallet(),
        loadPayouts(),
      ]);
      return true;
    } catch (_) {
      return false;
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

  Future<void> refresh() async {
    await loadWallet();
    if (state.selectedTab == 0) {
      await loadEarnings();
    } else {
      await loadPayouts();
    }
  }
}

final earningsProvider =
    StateNotifierProvider<EarningsNotifier, EarningsState>((ref) {
  return EarningsNotifier(ref.read(earningsRepositoryProvider));
});
