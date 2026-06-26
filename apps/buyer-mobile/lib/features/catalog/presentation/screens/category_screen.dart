import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../../core/widgets/product_skeletons.dart';
import '../../../city/presentation/providers/city_provider.dart';
import '../../../wishlist/presentation/providers/wishlist_provider.dart';
import '../../data/models/category_model.dart';
import '../providers/catalog_provider.dart';
import '../widgets/filter_bottom_sheet.dart';
import '../widgets/product_card.dart';

/// Finds a category node anywhere in the 3-level tree by id (for drill-down).
CategoryModel? _findCategoryNode(List<CategoryModel> cats, String id) {
  for (final c in cats) {
    if (c.id == id) return c;
    final found = _findCategoryNode(c.subcategories, id);
    if (found != null) return found;
  }
  return null;
}

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

  @override
  void initState() {
    super.initState();
    // Buyer-owned UI event — one per category view (parity with buyer-web).
    const PosthogAnalytics().capture('category_viewed', properties: {
      'categoryId': widget.categoryId,
    });
  }

  BrowseProductsParams get _params => BrowseProductsParams(
        categoryId: widget.categoryId,
        condition: _filters.condition,
        sortBy: _filters.sortBy,
        minPrice: _filters.minPrice,
        maxPrice: _filters.maxPrice,
        onPromotion: _filters.onPromotion,
        // Scope the listing to the selected city (parity with buyer-web's
        // city-scoped category page). Watched so a city change refetches.
        cityId: ref.watch(cityProvider).selectedCity?.id,
        attributesJson: _encodeAttributes(_filters.attributes),
        brandIds:
            _filters.brandIds.isEmpty ? null : _filters.brandIds.join(','),
      );

  /// Encode the selected facets to the JSON shape the browse API expects,
  /// dropping attributes with no selected value. Returns null when empty so the
  /// param is omitted entirely.
  static String? _encodeAttributes(Map<String, List<String>> attributes) {
    final active = <String, List<String>>{};
    attributes.forEach((key, values) {
      if (values.isNotEmpty) active[key] = values;
    });
    if (active.isEmpty) return null;
    return jsonEncode(active);
  }

  void _applyFilters(FilterOptions filters) {
    setState(() => _filters = filters);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(browseProductsProvider(_params));

    // Hydrate wishlist heart state for the visible products (batch /check).
    ref.listen(browseProductsProvider(_params), (_, next) {
      if (next.products.isNotEmpty) {
        ref
            .read(wishlistProvider.notifier)
            .loadWishlistIds(next.products.map((p) => p.id).toList());
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.categoryName ?? "Categories"),
        actions: [
          IconButton(
            icon: Badge(
              isLabelVisible: _filters.activeCount > 0,
              label: Text('${_filters.activeCount}'),
              backgroundColor: TekaColors.tekaRed,
              child: const Icon(Icons.tune),
            ),
            tooltip: "Trier et filtrer",
            onPressed: () async {
              final result = await FilterBottomSheet.show(
                context,
                initialFilters: _filters,
                categoryId: widget.categoryId,
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
        child: _buildBody(context, state),
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    BrowseProductsState state,
  ) {
    // Condition chips row
    final conditionBar = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          _ConditionFilterChip(
            label: "Tous",
            isSelected: _filters.condition == null,
            onTap: () => _applyFilters(_filters.copyWith(clearCondition: true)),
          ),
          const SizedBox(width: 8),
          _ConditionFilterChip(
            label: "Neuf",
            isSelected: _filters.condition == 'NEW',
            onTap: () => _applyFilters(_filters.copyWith(condition: 'NEW')),
          ),
          const SizedBox(width: 8),
          _ConditionFilterChip(
            label: "Occasion",
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
            child: ProductGridSkeleton(count: 6),
          ),
        ],
      );
    }

    if (state.error != null && state.products.isEmpty) {
      return Column(
        children: [
          conditionBar,
          Expanded(
            child: AppErrorState(
              message: state.error!,
              onRetry: () {
                ref.read(browseProductsProvider(_params).notifier).refresh();
              },
            ),
          ),
        ],
      );
    }

    if (state.products.isEmpty) {
      return Column(
        children: [
          conditionBar,
          const Expanded(
            child: AppEmptyState(
              icon: Icons.inventory_2_outlined,
              title: "Aucun produit trouve",
            ),
          ),
        ],
      );
    }

    // Drill-down: this category's children (subcategories, or product types
    // under a subcategory) as quick chips — Category → Subcategory → Product Type.
    final tree =
        ref.watch(categoriesProvider).valueOrNull ?? const <CategoryModel>[];
    final node = _findCategoryNode(tree, widget.categoryId);
    final children = node?.subcategories ?? const <CategoryModel>[];

    return CustomScrollView(
      slivers: [
        if (children.isNotEmpty)
          SliverToBoxAdapter(
            child: SizedBox(
              height: 46,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                itemCount: children.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final c = children[i];
                  return ActionChip(
                    label: Text(c.name),
                    onPressed: () => context.push(
                      '/categories/${c.id}',
                      extra: {'categoryName': c.name},
                    ),
                  );
                },
              ),
            ),
          ),
        SliverToBoxAdapter(child: conditionBar),
        // Results count
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Text(
              '${state.pagination?.total ?? state.products.length} résultats',
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
              childAspectRatio: kProductCardAspectRatio,
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
                        child: Text("Charger plus"),
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
