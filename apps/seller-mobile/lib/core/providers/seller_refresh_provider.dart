import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Invalidation only: counts always come from the authenticated stats endpoints.
/// Repository mutations refresh immediately; push/resume bursts are coalesced.
final sellerRefreshProvider =
    StateNotifierProvider<SellerRefreshNotifier,
        ({int orders, int products, int earnings})>(
        (ref) {
  final notifier = SellerRefreshNotifier();
  WidgetsBinding.instance.addObserver(notifier);
  ref.onDispose(() => WidgetsBinding.instance.removeObserver(notifier));
  return notifier;
});

class SellerRefreshNotifier
    extends StateNotifier<({int orders, int products, int earnings})>
    with WidgetsBindingObserver {
  SellerRefreshNotifier() : super((orders: 0, products: 0, earnings: 0));
  Timer? _timer;
  bool _ordersPending = false;
  bool _productsPending = false;
  bool _earningsPending = false;
  bool _backgrounded = false;

  void ordersChanged() => state = (
        orders: state.orders + 1,
        products: state.products,
        earnings: state.earnings,
      );
  void productsChanged() => state = (
        orders: state.orders,
        products: state.products + 1,
        earnings: state.earnings,
      );

  void handlePush(Map<String, dynamic> data) {
    switch (data['screen']) {
      case 'order-details':
        _schedule(orders: true);
      case 'product-details':
        _schedule(products: true);
      case 'earnings':
        // Payout approved / paid / rejected: wallet + payouts changed.
        _schedule(earnings: true);
    }
  }

  void _schedule({
    bool orders = false,
    bool products = false,
    bool earnings = false,
  }) {
    _ordersPending |= orders;
    _productsPending |= products;
    _earningsPending |= earnings;
    // A fixed coalescing window cannot be starved by a continuous stream.
    _timer ??= Timer(const Duration(milliseconds: 300), () {
      _timer = null;
      state = (
        orders: state.orders + (_ordersPending ? 1 : 0),
        products: state.products + (_productsPending ? 1 : 0),
        earnings: state.earnings + (_earningsPending ? 1 : 0),
      );
      _ordersPending = _productsPending = _earningsPending = false;
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      _backgrounded = true;
    } else if (state == AppLifecycleState.resumed && _backgrounded) {
      _backgrounded = false;
      _schedule(orders: true, products: true, earnings: true);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
