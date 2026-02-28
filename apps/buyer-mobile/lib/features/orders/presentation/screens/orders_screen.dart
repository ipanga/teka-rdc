import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
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
    final l10n = AppLocalizations.of(context)!;
    final ordersState = ref.watch(ordersProvider);

    final statusFilters = <String?, String>{
      null: l10n.ordersAll,
      'PENDING': l10n.ordersPending,
      'CONFIRMED': l10n.ordersConfirmed,
      'SHIPPED': l10n.ordersShipped,
      'DELIVERED': l10n.ordersDelivered,
      'CANCELLED': l10n.ordersCancelled,
    };

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.ordersTitle),
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
                final isSelected =
                    ordersState.selectedStatus == entry.key;
                return FilterChip(
                  label: Text(entry.value),
                  selected: isSelected,
                  onSelected: (_) {
                    ref.read(ordersProvider.notifier).setStatusFilter(entry.key);
                  },
                  selectedColor: TekaColors.tekaRed.withOpacity(0.12),
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
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.error_outline,
                                size: 48,
                                color: TekaColors.mutedForeground,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                ordersState.error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: TekaColors.mutedForeground,
                                ),
                              ),
                              const SizedBox(height: 16),
                              FilledButton(
                                onPressed: () =>
                                    ref.read(ordersProvider.notifier).refresh(),
                                style: FilledButton.styleFrom(
                                  backgroundColor: TekaColors.tekaRed,
                                ),
                                child: Text(l10n.backToHome),
                              ),
                            ],
                          ),
                        ),
                      )
                    : ordersState.orders.isEmpty
                        ? _EmptyOrdersView(l10n: l10n)
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
                                    l10n: l10n,
                                    onPrevious: () => ref
                                        .read(ordersProvider.notifier)
                                        .loadOrders(
                                            page: ordersState.page - 1),
                                    onNext: () => ref
                                        .read(ordersProvider.notifier)
                                        .loadOrders(
                                            page: ordersState.page + 1),
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

class _EmptyOrdersView extends StatelessWidget {
  final AppLocalizations l10n;

  const _EmptyOrdersView({required this.l10n});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.receipt_long_outlined,
              size: 80,
              color: TekaColors.mutedForeground,
            ),
            const SizedBox(height: 16),
            Text(
              l10n.ordersEmpty,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: TekaColors.mutedForeground,
                    fontWeight: FontWeight.w600,
                  ),
              textAlign: TextAlign.center,
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
  final AppLocalizations l10n;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

  const _PaginationBar({
    required this.page,
    required this.totalPages,
    required this.hasNext,
    required this.hasPrevious,
    required this.l10n,
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
            label: Text(l10n.previous),
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
            icon: Text(l10n.next),
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
