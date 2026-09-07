import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../../core/widgets/commerce_header.dart';
import '../../../../core/widgets/product_skeletons.dart';
import '../../../city/presentation/providers/city_provider.dart';
import '../../../wishlist/presentation/providers/wishlist_provider.dart';
import '../../data/catalog_repository.dart';
import '../../data/models/category_model.dart';
import '../../domain/category_identifier.dart';
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

  /// The category's internal id. Equal to the route parameter when that is
  /// already an id (in-app navigation); resolved from the public slug when
  /// the screen was reached from a web URL, a banner or a deep link (A7,
  /// 2026-09-06) — the browse APIs only accept the id.
  String? _resolvedId;
  CategoryModel? _resolvedNode;
  bool _resolving = false;
  String? _resolveError;

  @override
  void initState() {
    super.initState();
    if (isCategoryUuid(widget.categoryId)) {
      _resolvedId = widget.categoryId;
    } else {
      _resolveSlug();
    }
    // Buyer-owned UI event — one per category view (parity with buyer-web).
    const PosthogAnalytics().capture('category_viewed', properties: {
      'categoryId': widget.categoryId,
    });
  }

  /// Slug → id: from the already-loaded tree when possible, else one GET
  /// against the identifier endpoint (which accepts slug or id).
  Future<void> _resolveSlug() async {
    setState(() {
      _resolving = true;
      _resolveError = null;
    });
    final tree = ref.read(categoriesProvider).valueOrNull;
    if (tree != null) {
      final node = findCategoryNode(tree, widget.categoryId);
      if (node != null) {
        setState(() {
          _resolvedId = node.id;
          _resolvedNode = node;
          _resolving = false;
        });
        return;
      }
    }
    try {
      final node = await ref
          .read(catalogRepositoryProvider)
          .getCategory(widget.categoryId);
      if (!mounted) return;
      setState(() {
        _resolvedId = node.id;
        _resolvedNode = node;
        _resolving = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _resolveError = 'Cette catégorie est introuvable.';
      });
    }
  }

  BrowseProductsParams get _params => BrowseProductsParams(
        categoryId: _resolvedId ?? widget.categoryId,
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

  Future<void> _showFilters() async {
    final result = await FilterBottomSheet.show(
      context,
      initialFilters: _filters,
      categoryId: _resolvedId ?? widget.categoryId,
    );
    if (result != null) {
      _applyFilters(result);
    }
  }

  @override
  Widget build(BuildContext context) {
    // A slug still being resolved: no browse call yet (it would 400).
    if (_resolvedId == null) {
      return Scaffold(
        appBar: const CommerceAppBar(searchLabel: 'Rechercher dans Teka...'),
        body: _resolving
            ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
            : AppErrorState(
                message: _resolveError ?? 'Cette catégorie est introuvable.',
                actionLabel: 'Voir les catégories',
                onRetry: () => context.go('/categories'),
              ),
      );
    }
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
      appBar: const CommerceAppBar(
        searchLabel: 'Rechercher dans Teka...',
      ),
      body: Column(
        children: [
          _CategoryContextBar(
            title: widget.categoryName ??
                _resolvedNode?.name ??
                findCategoryNode(
                  ref.watch(categoriesProvider).valueOrNull ?? const [],
                  widget.categoryId,
                )?.name ??
                'Catégorie',
            activeFilterCount: _filters.activeCount,
            onFilterPressed: _showFilters,
          ),
          Expanded(
            child: RefreshIndicator(
              color: TekaColors.tekaRed,
              onRefresh: () async {
                await ref
                    .read(browseProductsProvider(_params).notifier)
                    .refresh();
              },
              child: _buildBody(context, state),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    BrowseProductsState state,
  ) {
    // Condition chips row
    final conditionBar = SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            _ConditionFilterChip(
              label: "Tous",
              isSelected: _filters.condition == null,
              onTap: () =>
                  _applyFilters(_filters.copyWith(clearCondition: true)),
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
      ),
    );

    if (state.isLoading && state.products.isEmpty) {
      return Column(
        children: [
          conditionBar,
          Expanded(
            child: ProductGridSkeleton(
              count: 6,
              mainAxisExtent: productCardGridExtent(
                context,
                variant: ProductCardVariant.catalog,
              ),
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
              title: "Aucun produit trouvé",
            ),
          ),
        ],
      );
    }

    // Drill-down: this category's children (subcategories, or product types
    // under a subcategory) as quick chips — Category → Subcategory → Product Type.
    final tree =
        ref.watch(categoriesProvider).valueOrNull ?? const <CategoryModel>[];
    final node = findCategoryNode(tree, _resolvedId ?? widget.categoryId) ??
        _resolvedNode;
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
        // Product grid
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverGrid(
            delegate: SliverChildBuilderDelegate(
              (context, index) => ProductCard(product: state.products[index]),
              childCount: state.products.length,
            ),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisExtent: productCardGridExtent(
                context,
                variant: ProductCardVariant.catalog,
              ),
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

class _CategoryContextBar extends StatelessWidget {
  final String title;
  final int activeFilterCount;
  final VoidCallback onFilterPressed;

  const _CategoryContextBar({
    required this.title,
    required this.activeFilterCount,
    required this.onFilterPressed,
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: TekaColors.surface,
        border: Border(
          bottom: BorderSide(color: TekaColors.border),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 12, 8),
        child: Row(
          children: [
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            const SizedBox(width: 8),
            Badge(
              isLabelVisible: activeFilterCount > 0,
              label: Text('$activeFilterCount'),
              backgroundColor: TekaColors.tekaRed,
              child: IconButton(
                onPressed: onFilterPressed,
                tooltip: 'Trier et filtrer',
                icon: const Icon(Icons.tune_rounded),
                style: IconButton.styleFrom(
                  minimumSize: const Size(44, 44),
                  foregroundColor: TekaColors.foreground,
                  backgroundColor: TekaColors.surfaceMuted,
                  side: const BorderSide(color: TekaColors.border),
                ),
              ),
            ),
          ],
        ),
      ),
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
