import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/models/order_model.dart';
import '../../data/orders_repository.dart';

// -- Orders list state & notifier --

class SellerOrdersState {
  final List<SellerOrderModel> orders;
  final int total;
  final int page;
  final int limit;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;
  final OrderStatus? selectedStatus;

  const SellerOrdersState({
    this.orders = const [],
    this.total = 0,
    this.page = 1,
    this.limit = 20,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
    this.selectedStatus,
  });

  bool get hasMore => page * limit < total;

  SellerOrdersState copyWith({
    List<SellerOrderModel>? orders,
    int? total,
    int? page,
    int? limit,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    OrderStatus? selectedStatus,
    bool clearFilter = false,
    bool clearError = false,
  }) {
    return SellerOrdersState(
      orders: orders ?? this.orders,
      total: total ?? this.total,
      page: page ?? this.page,
      limit: limit ?? this.limit,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
      selectedStatus:
          clearFilter ? null : (selectedStatus ?? this.selectedStatus),
    );
  }
}

class SellerOrdersNotifier extends StateNotifier<SellerOrdersState> {
  final SellerOrdersRepository _repository;

  // Starts loading and does NOT auto-fetch. The first load is driven by
  // `sellerOrdersProvider` once auth resolves — firing in the constructor races
  // token restoration on cold start (no bearer → 401 → cached error until
  // "Réessayer"). Mirrors sellerProductsProvider / dashboardStatsProvider.
  SellerOrdersNotifier(this._repository)
      : super(const SellerOrdersState(isLoading: true));

  int _request = 0;

  /// Opening an action always refreshes its queue, even on a previously visited tab.
  void openActionFilter(OrderStatus? status) {
    state = SellerOrdersState(selectedStatus: status, limit: state.limit);
    loadOrders();
  }

  Future<void> loadOrders() async {
    if (!mounted) return;
    final request = ++_request;
    state =
        state.copyWith(isLoading: true, isLoadingMore: false, clearError: true);
    try {
      final statusApi = state.selectedStatus != null
          ? orderStatusToApi(state.selectedStatus!)
          : null;
      final result = await _repository.getOrders(
        page: 1,
        limit: state.limit,
        status: statusApi,
      );
      if (!mounted || request != _request) return;
      state = state.copyWith(
        orders: result.items,
        total: result.total,
        page: 1,
        isLoading: false,
      );
    } catch (e) {
      if (!mounted || request != _request) return;
      state = state.copyWith(
        isLoading: false,
        error: friendlyErrorMessage(e),
      );
    }
  }

  Future<void> loadMore() async {
    if (!mounted || state.isLoading || state.isLoadingMore || !state.hasMore) {
      return;
    }
    final request = _request;
    state = state.copyWith(isLoadingMore: true);
    try {
      final nextPage = state.page + 1;
      final statusApi = state.selectedStatus != null
          ? orderStatusToApi(state.selectedStatus!)
          : null;
      final result = await _repository.getOrders(
        page: nextPage,
        limit: state.limit,
        status: statusApi,
      );
      if (!mounted || request != _request) return;
      state = state.copyWith(
        orders: [...state.orders, ...result.items],
        total: result.total,
        page: nextPage,
        isLoadingMore: false,
      );
    } catch (e) {
      if (!mounted || request != _request) return;
      state = state.copyWith(
        isLoadingMore: false,
        error: friendlyErrorMessage(e),
      );
    }
  }

  void setStatusFilter(OrderStatus? status) {
    if (status == state.selectedStatus) return;
    state = SellerOrdersState(
      selectedStatus: status,
      limit: state.limit,
    );
    loadOrders();
  }

  Future<void> refresh() async {
    await loadOrders();
  }

  Future<bool> performAction(
      String orderId, Future<SellerOrderModel> Function() action) async {
    try {
      await action();
      // Reload the list after a successful action
      await loadOrders();
      return true;
    } catch (_) {
      return false;
    }
  }
}

final sellerOrdersProvider =
    StateNotifierProvider<SellerOrdersNotifier, SellerOrdersState>((ref) {
  final id = ref.watch(authenticatedSellerIdProvider);
  final notifier =
      SellerOrdersNotifier(ref.watch(sellerOrdersRepositoryProvider));
  if (id != null) {
    // Let a same-turn task/filter select its first request. This avoids fetching
    // an unfiltered page immediately before the requested action queue.
    Future.microtask(() {
      if (notifier.mounted && notifier._request == 0) notifier.loadOrders();
    });
  }
  return notifier;
});

// -- Single order detail --

final sellerOrderDetailProvider = FutureProvider.autoDispose
    .family<SellerOrderModel, String>((ref, id) async {
  final repository = ref.watch(sellerOrdersRepositoryProvider);
  return repository.getOrderById(id);
});
