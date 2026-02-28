import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  SellerOrdersNotifier(this._repository) : super(const SellerOrdersState()) {
    loadOrders();
  }

  Future<void> loadOrders() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final statusApi = state.selectedStatus != null
          ? orderStatusToApi(state.selectedStatus!)
          : null;
      final result = await _repository.getOrders(
        page: 1,
        limit: state.limit,
        status: statusApi,
      );
      state = state.copyWith(
        orders: result.items,
        total: result.total,
        page: 1,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore) return;
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
      state = state.copyWith(
        orders: [...state.orders, ...result.items],
        total: result.total,
        page: nextPage,
        isLoadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingMore: false,
        error: e.toString(),
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
  return SellerOrdersNotifier(ref.read(sellerOrdersRepositoryProvider));
});

// -- Single order detail --

final sellerOrderDetailProvider =
    FutureProvider.family<SellerOrderModel, String>((ref, id) async {
  final repository = ref.read(sellerOrdersRepositoryProvider);
  return repository.getOrderById(id);
});
