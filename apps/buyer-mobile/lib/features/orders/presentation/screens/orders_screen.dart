import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_states.dart';
import '../../domain/order_status.dart';
import '../providers/orders_provider.dart';
import '../widgets/order_card.dart';
import '../../../../core/widgets/product_skeletons.dart';

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  @override
  Widget build(BuildContext context) {
    final ordersState = ref.watch(ordersProvider);


    return Scaffold(
      appBar: AppBar(
        // Reachable via go('/orders') from the checkout success screen
        // (stack replaced → no auto back button); AdaptiveLeading falls back to
        // Home so the user is never trapped.
        leading: const AdaptiveLeading(),
        title: const Text("Mes commandes"),
      ),
      body: ReadableColumn(
        padding: EdgeInsets.zero,
        child: Column(
            children: [
              // Status filter chips
              SizedBox(
                height: 48,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  itemCount: orderStatusFilters.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, index) {
                    final filter = orderStatusFilters[index];
                    final isSelected = ordersState.selectedStatus == filter.wire;
                    return FilterChip(
                      label: Text(filter.label),
                      selected: isSelected,
                      onSelected: (_) {
                        ref
                            .read(ordersProvider.notifier)
                            .setStatusFilter(filter.wire);
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

              // Orders list.
              //
              // Only a first load with nothing on screen takes the whole area
              // (spinner, or the error state with a retry). Once orders are
              // shown they STAY shown through a refresh and through a failed
              // refresh — the pull-to-refresh spinner and an inline error row
              // carry that news instead of blanking the list (PR D3).
              Expanded(
                child: ordersState.isLoading && ordersState.orders.isEmpty
                    // A shaped skeleton, not a bare spinner on a blank screen
                    // — every product surface in the app already does this.
                    ? const ListCardSkeleton(count: 4)
                    : ordersState.error != null && ordersState.orders.isEmpty
                        ? AppErrorState(
                            message: ordersState.error,
                            onRetry: () =>
                                ref.read(ordersProvider.notifier).refresh(),
                          )
                        : ordersState.orders.isEmpty
                            ? RefreshIndicator(
                                color: TekaColors.tekaRed,
                                onRefresh: () =>
                                    ref.read(ordersProvider.notifier).refresh(),
                                child: ListView(
                                  physics: const AlwaysScrollableScrollPhysics(),
                                  children: const [
                                    SizedBox(height: 80),
                                    AppEmptyState(
                                      icon: Icons.receipt_long_outlined,
                                      title: "Vous n'avez aucune commande",
                                    ),
                                  ],
                                ),
                              )
                            : RefreshIndicator(
                                color: TekaColors.tekaRed,
                                onRefresh: () =>
                                    ref.read(ordersProvider.notifier).refresh(),
                                child: Column(
                                  children: [
                                    if (ordersState.error != null)
                                      _InlineRefreshError(
                                        message: ordersState.error!,
                                        onRetry: () => ref
                                            .read(ordersProvider.notifier)
                                            .refresh(),
                                      ),
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

/// A failed refresh with orders already on screen: say so above the list
/// instead of replacing it (PR D3, 2026-09-07).
class _InlineRefreshError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _InlineRefreshError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('orders-inline-error'),
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: TekaColors.destructive.withValues(alpha: 0.06),
        border: Border.all(color: TekaColors.destructive.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, size: 18, color: TekaColors.destructive),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 13, color: TekaColors.foreground),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Réessayer')),
        ],
      ),
    );
  }
}
