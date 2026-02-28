import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
        error: _extractErrorMessage(e),
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
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

  Future<void> refresh() async {
    await loadOrders(page: 1);
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

final ordersProvider =
    StateNotifierProvider<OrdersNotifier, OrdersState>((ref) {
  return OrdersNotifier(ref.read(ordersRepositoryProvider));
});

final orderDetailProvider =
    FutureProvider.family<OrderModel, String>((ref, orderId) {
  final repository = ref.read(ordersRepositoryProvider);
  return repository.getOrderById(orderId);
});
