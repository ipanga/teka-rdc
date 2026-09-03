import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Invalidation only: counts always come from the authenticated stats endpoints.
/// Repository mutations refresh immediately; push/resume bursts are coalesced.
final sellerRefreshProvider =
    StateNotifierProvider<SellerRefreshNotifier, ({int orders, int products})>(
        (ref) {
  final notifier = SellerRefreshNotifier();
  WidgetsBinding.instance.addObserver(notifier);
  ref.onDispose(() => WidgetsBinding.instance.removeObserver(notifier));
  return notifier;
});

class SellerRefreshNotifier extends StateNotifier<({int orders, int products})>
    with WidgetsBindingObserver {
  SellerRefreshNotifier() : super((orders: 0, products: 0));
  Timer? _timer;
  bool _ordersPending = false;
  bool _productsPending = false;
  bool _backgrounded = false;

  void ordersChanged() =>
      state = (orders: state.orders + 1, products: state.products);
  void productsChanged() =>
      state = (orders: state.orders, products: state.products + 1);

  void handlePush(Map<String, dynamic> data) {
    switch (data['screen']) {
      case 'order-details':
        _schedule(orders: true);
      case 'product-details':
        _schedule(products: true);
    }
  }

  void _schedule({bool orders = false, bool products = false}) {
    _ordersPending |= orders;
    _productsPending |= products;
    // A fixed coalescing window cannot be starved by a continuous stream.
    _timer ??= Timer(const Duration(milliseconds: 300), () {
      _timer = null;
      state = (
        orders: state.orders + (_ordersPending ? 1 : 0),
        products: state.products + (_productsPending ? 1 : 0),
      );
      _ordersPending = _productsPending = false;
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      _backgrounded = true;
    } else if (state == AppLifecycleState.resumed && _backgrounded) {
      _backgrounded = false;
      _schedule(orders: true, products: true);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
