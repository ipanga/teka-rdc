import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/widgets/seller_filter_bar.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../data/models/order_model.dart';
import '../order_status_ui.dart';
import '../providers/orders_provider.dart';
import '../widgets/order_card.dart';
import '../../../../core/layout/responsive.dart';

class OrdersListScreen extends ConsumerStatefulWidget {
  const OrdersListScreen(
      {super.key, this.statusQuery, this.syncWithRoute = false});
  final String? statusQuery;
  final bool syncWithRoute;

  @override
  ConsumerState<OrdersListScreen> createState() => _OrdersListScreenState();
}

class _OrdersListScreenState extends ConsumerState<OrdersListScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _applyRoute();
  }

  @override
  void didUpdateWidget(covariant OrdersListScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.statusQuery != widget.statusQuery) _applyRoute();
  }

  void _applyRoute() {
    if (!widget.syncWithRoute) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref
          .read(sellerOrdersProvider.notifier)
          .setStatusFilter(orderStatusFromQuery(widget.statusQuery));
    });
  }

  void _selectStatus(OrderStatus? status) {
    ref.read(sellerOrdersProvider.notifier).setStatusFilter(status);
    if (widget.syncWithRoute) {
      context.go(status == null
          ? '/orders'
          : '/orders?status=${orderStatusToApi(status)}');
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    final state = ref.read(sellerOrdersProvider);
    if (!state.isLoading &&
        state.error == null &&
        _scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 200) {
      ref.read(sellerOrdersProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(sellerOrdersProvider);
    final notifier = ref.read(sellerOrdersProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Commandes')),
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: SafeArea(
            top: false,
            bottom: false,
            child: Column(
              children: [
                SellerFilterBar<OrderStatus>(
                  selected: state.selectedStatus,
                  onSelected: _selectStatus,
                  // Labels and order come from OrderStatusUi — the same
                  // source as the chip, the timeline and the Action Center.
                  options: [
                    const SellerFilterOption(null, 'Toutes'),
                    for (final status in orderFilterOrder)
                      SellerFilterOption(
                          status, OrderStatusUi.of(status).filterLabel),
                  ],
                ),
                Expanded(
                  child: state.isLoading
                      ? const SellerListLoading(label: 'Chargement des commandes')
                      : RefreshIndicator(
                          onRefresh: notifier.refresh,
                          child: state.orders.isEmpty
                              ? SellerListState(child: _message(state))
                              : ListView.builder(
                                  controller: _scrollController,
                                  physics: const AlwaysScrollableScrollPhysics(),
                                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                                  itemCount: state.orders.length +
                                      (state.isLoadingMore || state.error != null
                                          ? 1
                                          : 0),
                                  itemBuilder: (context, index) {
                                    if (index < state.orders.length) {
                                      return OrderCard(order: state.orders[index]);
                                    }
                                    if (state.error != null) return _message(state);
                                    return const Padding(
                                      padding: EdgeInsets.all(16),
                                      child: Center(
                                          child: CircularProgressIndicator(
                                        semanticsLabel:
                                            'Chargement des commandes suivantes',
                                      )),
                                    );
                                  },
                                ),
                        ),
                ),
              ],
            ),
          ),
      ),
    );
  }

  Widget _message(SellerOrdersState state) {
    final notifier = ref.read(sellerOrdersProvider.notifier);
    if (state.error != null) {
      return SellerListMessage(
        icon: Icons.cloud_off_outlined,
        title: 'Impossible de charger les commandes',
        message: state.error!,
        actionLabel: 'Réessayer',
        onAction: notifier.refresh,
      );
    }
    final filtered = state.selectedStatus != null;
    final copy = orderEmptyCopy(state.selectedStatus);
    return SellerListMessage(
      icon: Icons.receipt_long_outlined,
      title: copy.title,
      message: copy.message,
      actionLabel: filtered ? 'Voir toutes les commandes' : 'Actualiser',
      onAction: filtered ? () => _selectStatus(null) : notifier.refresh,
    );
  }
}
