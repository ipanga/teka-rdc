import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/catalog_provider.dart';
import '../widgets/filter_bottom_sheet.dart';
import '../widgets/product_card.dart';

class CategoryScreen extends ConsumerStatefulWidget {
  final String categoryId;
  final String? categoryName;

  const CategoryScreen({
    super.key,
    required this.categoryId,
    this.categoryName,
  });

  @override
  ConsumerState<CategoryScreen> createState() => _CategoryScreenState();
}

class _CategoryScreenState extends ConsumerState<CategoryScreen> {
  FilterOptions _filters = const FilterOptions();

  BrowseProductsParams get _params => BrowseProductsParams(
        categoryId: widget.categoryId,
        condition: _filters.condition,
        sortBy: _filters.sortBy,
      );

  void _applyFilters(FilterOptions filters) {
    setState(() => _filters = filters);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(browseProductsProvider(_params));

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.categoryName ?? l10n.categories),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: l10n.filterSort,
            onPressed: () async {
              final result = await FilterBottomSheet.show(
                context,
                initialFilters: _filters,
              );
              if (result != null) {
                _applyFilters(result);
              }
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        color: TekaColors.tekaRed,
        onRefresh: () async {
          await ref.read(browseProductsProvider(_params).notifier).refresh();
        },
        child: _buildBody(context, l10n, state),
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    AppLocalizations l10n,
    BrowseProductsState state,
  ) {
    // Condition chips row
    final conditionBar = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          _ConditionFilterChip(
            label: l10n.filterAll,
            isSelected: _filters.condition == null,
            onTap: () => _applyFilters(_filters.copyWith(clearCondition: true)),
          ),
          const SizedBox(width: 8),
          _ConditionFilterChip(
            label: l10n.filterNew,
            isSelected: _filters.condition == 'NEW',
            onTap: () => _applyFilters(_filters.copyWith(condition: 'NEW')),
          ),
          const SizedBox(width: 8),
          _ConditionFilterChip(
            label: l10n.filterUsed,
            isSelected: _filters.condition == 'USED',
            onTap: () => _applyFilters(_filters.copyWith(condition: 'USED')),
          ),
        ],
      ),
    );

    if (state.isLoading && state.products.isEmpty) {
      return Column(
        children: [
          conditionBar,
          const Expanded(
            child: Center(
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        ],
      );
    }

    if (state.error != null && state.products.isEmpty) {
      return Column(
        children: [
          conditionBar,
          Expanded(
            child: Center(
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
                      state.error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: TekaColors.mutedForeground,
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () {
                        ref.read(browseProductsProvider(_params).notifier).refresh();
                      },
                      style: FilledButton.styleFrom(
                        backgroundColor: TekaColors.tekaRed,
                      ),
                      child: Text(l10n.productLoadMore),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      );
    }

    if (state.products.isEmpty) {
      return Column(
        children: [
          conditionBar,
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.inventory_2_outlined,
                      size: 64,
                      color: TekaColors.mutedForeground,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      l10n.productNoResults,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: TekaColors.mutedForeground,
                          ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      );
    }

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(child: conditionBar),
        // Results count
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Text(
              '${state.pagination?.total ?? state.products.length} ${l10n.searchResults.toLowerCase()}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: TekaColors.mutedForeground,
                  ),
            ),
          ),
        ),
        // Product grid
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverGrid(
            delegate: SliverChildBuilderDelegate(
              (context, index) => ProductCard(product: state.products[index]),
              childCount: state.products.length,
            ),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.65,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
          ),
        ),
        // Load more button
        if (state.hasMore)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: state.isLoadingMore
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : OutlinedButton(
                        onPressed: () {
                          ref
                              .read(browseProductsProvider(_params).notifier)
                              .loadMore();
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: TekaColors.tekaRed,
                          side: const BorderSide(color: TekaColors.tekaRed),
                        ),
                        child: Text(l10n.productLoadMore),
                      ),
              ),
            ),
          ),
        const SliverToBoxAdapter(child: SizedBox(height: 16)),
      ],
    );
  }
}

class _ConditionFilterChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _ConditionFilterChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? TekaColors.tekaRed : TekaColors.muted,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? TekaColors.tekaRed : TekaColors.border,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.white : TekaColors.foreground,
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      ),
    );
  }
}
