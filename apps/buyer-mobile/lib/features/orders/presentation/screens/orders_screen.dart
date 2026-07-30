import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_states.dart';
import '../providers/orders_provider.dart';
import '../widgets/order_card.dart';

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  @override
  Widget build(BuildContext context) {
    final ordersState = ref.watch(ordersProvider);

    final statusFilters = <String?, String>{
      null: "Toutes",
      'PENDING': "En attente",
      'CONFIRMED': "Confirmées",
      'SHIPPED': "Expédiées",
      'DELIVERED': "Livrées",
      'CANCELLED': "Annulées",
    };

    return Scaffold(
      appBar: AppBar(
        // Reachable via go('/orders') from checkout success / payment-pending
        // (stack replaced → no auto back button); AdaptiveLeading falls back to
        // Home so the user is never trapped.
        leading: const AdaptiveLeading(),
        title: const Text("Mes commandes"),
      ),
      body: Column(
        children: [
          // Status filter chips
          SizedBox(
            height: 48,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: statusFilters.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final entry = statusFilters.entries.elementAt(index);
                final isSelected = ordersState.selectedStatus == entry.key;
                return FilterChip(
                  label: Text(entry.value),
                  selected: isSelected,
                  onSelected: (_) {
                    ref
                        .read(ordersProvider.notifier)
                        .setStatusFilter(entry.key);
                  },
                  selectedColor: TekaColors.tekaRed.withValues(alpha: 0.12),
                  checkmarkColor: TekaColors.tekaRed,
                  labelStyle: TextStyle(
                    color: isSelected
                        ? TekaColors.tekaRed
                        : TekaColors.mutedForeground,
                    fontSize: 13,
                    fontWeight:
                        isSelected ? FontWeight.w600 : FontWeight.normal,
                  ),
                  side: BorderSide(
                    color: isSelected ? TekaColors.tekaRed : TekaColors.border,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  visualDensity: VisualDensity.compact,
                );
              },
            ),
          ),

          // Orders list
          Expanded(
            child: ordersState.isLoading
                ? const Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : ordersState.error != null
                    ? AppErrorState(
                        message: ordersState.error,
                        onRetry: () =>
                            ref.read(ordersProvider.notifier).refresh(),
                      )
                    : ordersState.orders.isEmpty
                        ? const AppEmptyState(
                            icon: Icons.receipt_long_outlined,
                            title: "Vous n'avez aucune commande",
                          )
                        : RefreshIndicator(
                            color: TekaColors.tekaRed,
                            onRefresh: () =>
                                ref.read(ordersProvider.notifier).refresh(),
                            child: Column(
                              children: [
                                Expanded(
                                  child: ListView.separated(
                                    physics:
                                        const AlwaysScrollableScrollPhysics(),
                                    padding: const EdgeInsets.all(16),
                                    itemCount: ordersState.orders.length,
                                    separatorBuilder: (_, __) =>
                                        const SizedBox(height: 12),
                                    itemBuilder: (context, index) {
                                      return OrderCard(
                                        order: ordersState.orders[index],
                                      );
                                    },
                                  ),
                                ),

                                // Pagination
                                if (ordersState.totalPages > 1)
                                  _PaginationBar(
                                    page: ordersState.page,
                                    totalPages: ordersState.totalPages,
                                    hasNext: ordersState.hasNextPage,
                                    hasPrevious: ordersState.hasPreviousPage,
                                    onPrevious: () => ref
                                        .read(ordersProvider.notifier)
                                        .loadOrders(page: ordersState.page - 1),
                                    onNext: () => ref
                                        .read(ordersProvider.notifier)
                                        .loadOrders(page: ordersState.page + 1),
                                  ),
                              ],
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class _PaginationBar extends StatelessWidget {
  final int page;
  final int totalPages;
  final bool hasNext;
  final bool hasPrevious;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

  const _PaginationBar({
    required this.page,
    required this.totalPages,
    required this.hasNext,
    required this.hasPrevious,
    required this.onPrevious,
    required this.onNext,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 8,
        bottom: 8 + MediaQuery.of(context).viewPadding.bottom,
      ),
      decoration: const BoxDecoration(
        border: Border(
          top: BorderSide(color: TekaColors.border),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          TextButton.icon(
            onPressed: hasPrevious ? onPrevious : null,
            icon: const Icon(Icons.chevron_left, size: 20),
            label: const Text("Précédent"),
            style: TextButton.styleFrom(
              foregroundColor: TekaColors.foreground,
              disabledForegroundColor: TekaColors.border,
            ),
          ),
          Text(
            '$page / $totalPages',
            style: const TextStyle(
              color: TekaColors.mutedForeground,
              fontSize: 13,
            ),
          ),
          TextButton.icon(
            onPressed: hasNext ? onNext : null,
            icon: const Text("Suivant"),
            label: const Icon(Icons.chevron_right, size: 20),
            style: TextButton.styleFrom(
              foregroundColor: TekaColors.foreground,
              disabledForegroundColor: TekaColors.border,
            ),
          ),
        ],
      ),
    );
  }
}
