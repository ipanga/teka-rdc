import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/order_model.dart';
import '../providers/orders_provider.dart';
import '../widgets/order_card.dart';

class OrdersListScreen extends ConsumerStatefulWidget {
  const OrdersListScreen({super.key});

  @override
  ConsumerState<OrdersListScreen> createState() => _OrdersListScreenState();
}

class _OrdersListScreenState extends ConsumerState<OrdersListScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(sellerOrdersProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(sellerOrdersProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.ordersTitle),
      ),
      body: Column(
        children: [
          _buildFilterChips(context, l10n, state),
          Expanded(
            child: state.isLoading
                ? const Center(child: CircularProgressIndicator())
                : state.error != null && state.orders.isEmpty
                    ? _buildErrorState(context, l10n, state.error!)
                    : state.orders.isEmpty
                        ? _buildEmptyState(context, l10n)
                        : _buildOrdersList(context, l10n, state),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChips(
      BuildContext context, AppLocalizations l10n, SellerOrdersState state) {
    final filters = <_FilterItem>[
      _FilterItem(null, l10n.ordersAll),
      _FilterItem(OrderStatus.pending, l10n.ordersPending),
      _FilterItem(OrderStatus.confirmed, l10n.ordersConfirmed),
      _FilterItem(OrderStatus.processing, l10n.ordersProcessing),
      _FilterItem(OrderStatus.shipped, l10n.ordersShipped),
      _FilterItem(OrderStatus.delivered, l10n.ordersDelivered),
      _FilterItem(OrderStatus.cancelled, l10n.ordersCancelled),
    ];

    return SizedBox(
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: filters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final filter = filters[index];
          final isSelected = state.selectedStatus == filter.status;
          return FilterChip(
            label: Text(filter.label),
            selected: isSelected,
            selectedColor: TekaColors.tekaRed.withValues(alpha: 0.15),
            checkmarkColor: TekaColors.tekaRed,
            onSelected: (_) {
              ref
                  .read(sellerOrdersProvider.notifier)
                  .setStatusFilter(filter.status);
            },
          );
        },
      ),
    );
  }

  Widget _buildErrorState(
      BuildContext context, AppLocalizations l10n, String error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                size: 48, color: TekaColors.destructive),
            const SizedBox(height: 12),
            Text(
              l10n.authGenericError,
              textAlign: TextAlign.center,
              style: const TextStyle(color: TekaColors.mutedForeground),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () =>
                  ref.read(sellerOrdersProvider.notifier).loadOrders(),
              icon: const Icon(Icons.refresh),
              label: Text(l10n.loadMore),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context, AppLocalizations l10n) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.receipt_long_outlined,
                size: 64,
                color: TekaColors.mutedForeground.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            Text(
              l10n.ordersEmpty,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: TekaColors.mutedForeground,
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrdersList(
      BuildContext context, AppLocalizations l10n, SellerOrdersState state) {
    return RefreshIndicator(
      onRefresh: () => ref.read(sellerOrdersProvider.notifier).refresh(),
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: state.orders.length + (state.isLoadingMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == state.orders.length) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          final order = state.orders[index];
          return OrderCard(order: order);
        },
      ),
    );
  }
}

class _FilterItem {
  final OrderStatus? status;
  final String label;

  const _FilterItem(this.status, this.label);
}
