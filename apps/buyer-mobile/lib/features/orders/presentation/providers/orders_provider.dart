import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../data/models/order_model.dart';
import '../../data/orders_repository.dart';

class OrdersState {
  final List<OrderModel> orders;
  final bool isLoading;
  final int page;
  final int totalPages;
  final String? selectedStatus;
  final String? error;

  const OrdersState({
    this.orders = const [],
    this.isLoading = false,
    this.page = 1,
    this.totalPages = 1,
    this.selectedStatus,
    this.error,
  });

  OrdersState copyWith({
    List<OrderModel>? orders,
    bool? isLoading,
    int? page,
    int? totalPages,
    String? selectedStatus,
    String? error,
    bool clearError = false,
    bool clearStatus = false,
  }) {
    return OrdersState(
      orders: orders ?? this.orders,
      isLoading: isLoading ?? this.isLoading,
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
      selectedStatus:
          clearStatus ? null : (selectedStatus ?? this.selectedStatus),
      error: clearError ? null : (error ?? this.error),
    );
  }

  bool get hasNextPage => page < totalPages;
  bool get hasPreviousPage => page > 1;
}

class OrdersNotifier extends StateNotifier<OrdersState> {
  final OrdersRepository _repository;

  OrdersNotifier(this._repository) : super(const OrdersState()) {
    loadOrders();
  }

  Future<void> loadOrders({int? page}) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await _repository.getOrders(
        page: page ?? state.page,
        status: state.selectedStatus,
      );
      state = state.copyWith(
        orders: result.orders,
        page: page ?? state.page,
        totalPages: result.totalPages,
        isLoading: false,
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: extractDioErrorMessage(e),
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: friendlyErrorMessage(e),
      );
    }
  }

  void setStatusFilter(String? status) {
    if (status == state.selectedStatus) return;
    state = status == null
        ? state.copyWith(page: 1, clearStatus: true)
        : state.copyWith(selectedStatus: status, page: 1);
    loadOrders(page: 1);
  }

  /// Session ended (A4): drop the previous account's orders and filter.
  void reset() {
    state = const OrdersState();
  }

  Future<void> refresh() async {
    await loadOrders(page: 1);
  }

}

final ordersProvider =
    StateNotifierProvider<OrdersNotifier, OrdersState>((ref) {
  final notifier = OrdersNotifier(ref.read(ordersRepositoryProvider));
  // Account-scoped (A4): a notifier that outlives a logout must not show
  // Buyer A's orders to Buyer B; reload on the next sign-in.
  ref.listen<AuthState>(authProvider, (prev, next) {
    final wasAuthed = prev?.status == AuthStatus.authenticated;
    final isAuthed = next.status == AuthStatus.authenticated;
    if (!isAuthed && wasAuthed) {
      notifier.reset();
    } else if (isAuthed && !wasAuthed && prev != null) {
      notifier.loadOrders();
    }
  });
  return notifier;
});

final orderDetailProvider =
    FutureProvider.family<OrderModel, String>((ref, orderId) {
  final repository = ref.read(ordersRepositoryProvider);
  return repository.getOrderById(orderId);
});
