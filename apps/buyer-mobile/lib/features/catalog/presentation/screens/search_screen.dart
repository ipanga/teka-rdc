import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../city/presentation/providers/city_provider.dart';
import '../../../wishlist/presentation/providers/wishlist_provider.dart';
import '../../data/catalog_repository.dart';
import '../providers/catalog_provider.dart';
import '../widgets/product_card.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  String _query = '';
  String? _lastSearchTracked; // de-dups the search_performed event per query
  List<SuggestedCategory> _categories = const []; // autocomplete category hits

  BrowseProductsParams get _params => BrowseProductsParams(
        search: _query.isNotEmpty ? _query : null,
        // Scope search to the selected city (parity with buyer-web search).
        cityId: ref.watch(cityProvider).selectedCity?.id,
      );

  @override
  void dispose() {
    _controller.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      if (mounted) _applyQuery(value);
    });
  }

  /// Apply a query: drive the live product grid (via _query) AND fetch the
  /// matching category suggestions for the autocomplete row.
  void _applyQuery(String value) {
    final q = value.trim();
    setState(() => _query = q);
    if (q.length < 2) {
      setState(() => _categories = const []);
      return;
    }
    final cityId = ref.read(cityProvider).selectedCity?.id;
    ref
        .read(catalogRepositoryProvider)
        .getSearchSuggestions(q, cityId: cityId)
        .then((cats) {
      if (mounted && _query == q) setState(() => _categories = cats);
    }).catchError((_) {
      // Non-critical: leave categories as-is on a failed suggestions fetch.
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Padding(
          padding: const EdgeInsets.only(right: 16),
          child: TextField(
            controller: _controller,
            autofocus: true,
            onChanged: _onSearchChanged,
            textInputAction: TextInputAction.search,
            onSubmitted: _applyQuery,
            decoration: InputDecoration(
              hintText: "Rechercher un produit...",
              hintStyle: const TextStyle(
                color: TekaColors.mutedForeground,
                fontSize: 15,
              ),
              border: InputBorder.none,
              suffixIcon: _controller.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 20),
                      onPressed: () {
                        _controller.clear();
                        setState(() {
                          _query = '';
                          _categories = const [];
                        });
                      },
                    )
                  : null,
            ),
          ),
        ),
      ),
      body: _query.isEmpty ? _buildEmptySearch(context) : _buildResults(context),
    );
  }

  Widget _buildEmptySearch(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.search,
              size: 64,
              color: TekaColors.mutedForeground,
            ),
            const SizedBox(height: 16),
            Text(
              "Rechercher un produit...",
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: TekaColors.mutedForeground,
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategorySuggestions(
    BuildContext context,
  ) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 0, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Categories",
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: TekaColors.mutedForeground,
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 6),
          SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(right: 16),
              itemCount: _categories.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final c = _categories[i];
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
        ],
      ),
    );
  }

  Widget _buildResults(BuildContext context) {
    final state = ref.watch(browseProductsProvider(_params));

    // Hydrate wishlist heart state for the visible products (batch /check).
    ref.listen(browseProductsProvider(_params), (_, next) {
      if (next.products.isNotEmpty) {
        ref
            .read(wishlistProvider.notifier)
            .loadWishlistIds(next.products.map((p) => p.id).toList());
      }
      // search_performed: once per completed query (parity with buyer-web).
      // Query routed through scrubAnalyticsText (free-text → strip phones).
      if (!next.isLoading && _query.isNotEmpty && _lastSearchTracked != _query) {
        _lastSearchTracked = _query;
        const PosthogAnalytics().capture('search_performed', properties: {
          'query': scrubAnalyticsText(_query),
          'result_count': next.pagination?.total ?? next.products.length,
        });
      }
    });

    if (state.isLoading && state.products.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }

    if (state.error != null && state.products.isEmpty) {
      return Center(
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
                style: const TextStyle(color: TekaColors.mutedForeground),
              ),
            ],
          ),
        ),
      );
    }

    if (state.products.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.search_off,
                size: 64,
                color: TekaColors.mutedForeground,
              ),
              const SizedBox(height: 16),
              Text(
                "Aucun resultat pour votre recherche",
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: TekaColors.mutedForeground,
                    ),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      color: TekaColors.tekaRed,
      onRefresh: () async {
        await ref.read(browseProductsProvider(_params).notifier).refresh();
      },
      child: CustomScrollView(
        slivers: [
          // Category suggestions (autocomplete) — tappable chips above results.
          if (_categories.isNotEmpty)
            SliverToBoxAdapter(child: _buildCategorySuggestions(context)),
          // Results count
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text(
                '${state.pagination?.total ?? state.products.length} ${"Resultats".toLowerCase()}',
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
          // Load more
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
      ),
    );
  }
}
