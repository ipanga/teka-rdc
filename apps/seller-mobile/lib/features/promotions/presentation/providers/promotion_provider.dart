import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/models/promotion_model.dart';
import '../../data/promotion_repository.dart';

class PromotionsListState {
  final List<PromotionModel> promotions;
  final int total;
  final int page;
  final int limit;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;

  const PromotionsListState({
    this.promotions = const [],
    this.total = 0,
    this.page = 1,
    this.limit = 20,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
  });

  bool get hasMore => page * limit < total;

  PromotionsListState copyWith({
    List<PromotionModel>? promotions,
    int? total,
    int? page,
    int? limit,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    bool clearError = false,
  }) {
    return PromotionsListState(
      promotions: promotions ?? this.promotions,
      total: total ?? this.total,
      page: page ?? this.page,
      limit: limit ?? this.limit,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class PromotionsListNotifier extends StateNotifier<PromotionsListState> {
  final PromotionRepository _repository;

  // Starts loading and does NOT auto-fetch — the first load is driven off auth
  // status by `sellerPromotionsProvider`. See sellerProductsProvider.
  PromotionsListNotifier(this._repository)
      : super(const PromotionsListState(isLoading: true));

  Future<void> loadPromotions() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.getPromotions(
        page: 1,
        limit: state.limit,
      );
      if (mounted) {
        state = state.copyWith(
          promotions: result.items,
          total: result.total,
          page: 1,
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

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore) return;
    state = state.copyWith(isLoadingMore: true);
    try {
      final nextPage = state.page + 1;
      final result = await _repository.getPromotions(
        page: nextPage,
        limit: state.limit,
      );
      if (mounted) {
        state = state.copyWith(
          promotions: [...state.promotions, ...result.items],
          total: result.total,
          page: nextPage,
          isLoadingMore: false,
        );
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(
          isLoadingMore: false,
          error: friendlyErrorMessage(e),
        );
      }
    }
  }

  Future<bool> createPromotion(Map<String, dynamic> data) async {
    try {
      await _repository.createPromotion(data);
      await loadPromotions();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> cancelPromotion(String id) async {
    try {
      await _repository.cancelPromotion(id);
      await loadPromotions();
      return true;
    } catch (_) {
      return false;
    }
  }
}

final sellerPromotionsProvider =
    StateNotifierProvider<PromotionsListNotifier, PromotionsListState>((ref) {
  final notifier = PromotionsListNotifier(ref.read(promotionRepositoryProvider));
  // Load off auth status, not the constructor — see sellerProductsProvider.
  ref.listen<AuthStatus>(authProvider.select((s) => s.status), (prev, next) {
    if (next == AuthStatus.authenticated && prev != AuthStatus.authenticated) {
      notifier.loadPromotions();
    }
  }, fireImmediately: true);
  return notifier;
});
