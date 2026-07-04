import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/analytics/posthog_analytics.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/app_states.dart';
import '../../../../core/widgets/product_skeletons.dart';
import '../../../city/presentation/providers/city_provider.dart';
import '../../../wishlist/presentation/providers/wishlist_provider.dart';
import '../../data/catalog_repository.dart';
import '../../data/recent_searches_store.dart';
import '../providers/catalog_provider.dart';
import '../widgets/product_card.dart';

class SearchScreen extends ConsumerStatefulWidget {
  /// Optional pre-filled query — set when arriving from a deep link
  /// (`https://teka.cd/recherche?q=...`).
  final String? initialQuery;

  const SearchScreen({super.key, this.initialQuery});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  final _recentStore = RecentSearchesStore();
  Timer? _debounce;
  String _query = '';
  String? _lastSearchTracked; // de-dups the search_performed event per query
  List<SuggestedCategory> _categories = const []; // autocomplete category hits
  List<SuggestedBrand> _brands = const []; // autocomplete brand hits
  List<String> _recent = const []; // recent searches (local)
  List<String> _popular = const []; // popular searches (API)

  @override
  void initState() {
    super.initState();
    _loadDiscovery();
    final q = widget.initialQuery?.trim() ?? '';
    if (q.isNotEmpty) {
      _controller.text = q;
      // Drive the grid immediately (no debounce) for a deep-linked query.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _applyQuery(q);
      });
    }
  }

  /// Load recent (local) + popular (API) terms for the empty/zero states.
  Future<void> _loadDiscovery() async {
    final recent = await _recentStore.get();
    if (mounted) setState(() => _recent = recent);
    final cityId = ref.read(cityProvider).selectedCity?.id;
    final popular = await ref
        .read(catalogRepositoryProvider)
        .getPopularSearches(cityId: cityId);
    if (mounted) setState(() => _popular = popular);
  }

  /// Persist an explicit search term + refresh the recent list.
  Future<void> _saveRecent(String term) async {
    final t = term.trim();
    if (t.length < 2) return;
    await _recentStore.add(t);
    final recent = await _recentStore.get();
    if (mounted) setState(() => _recent = recent);
  }

  /// Run a search from a tapped chip (recent/popular).
  void _runTerm(String term) {
    _controller.text = term;
    _controller.selection = TextSelection.collapsed(offset: term.length);
    _saveRecent(term);
    _applyQuery(term);
  }

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
      setState(() {
        _categories = const [];
        _brands = const [];
      });
      return;
    }
    final cityId = ref.read(cityProvider).selectedCity?.id;
    ref
        .read(catalogRepositoryProvider)
        .getSearchSuggestions(q, cityId: cityId)
        .then((s) {
      if (mounted && _query == q) {
        setState(() {
          _categories = s.categories;
          _brands = s.brands;
        });
      }
    }).catchError((_) {
      // Non-critical: leave suggestions as-is on a failed fetch.
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Padding(
          padding: const EdgeInsets.only(right: 16),
          child: Container(
            height: 44,
            decoration: BoxDecoration(
              color: TekaColors.surfaceMuted,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: TekaColors.border),
            ),
            child: TextField(
              controller: _controller,
              autofocus: true,
              onChanged: _onSearchChanged,
              textInputAction: TextInputAction.search,
              onSubmitted: (v) {
                _saveRecent(v);
                _applyQuery(v);
              },
              decoration: InputDecoration(
                filled: false,
                hintText: "Rechercher un produit...",
                hintStyle: const TextStyle(
                  color: TekaColors.mutedForeground,
                  fontSize: 15,
                ),
                prefixIcon: const Icon(
                  Icons.search_rounded,
                  color: TekaColors.tekaRed,
                ),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 0, vertical: 11),
                suffixIcon: _controller.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 20),
                        onPressed: () {
                          _controller.clear();
                          setState(() {
                            _query = '';
                            _categories = const [];
                            _brands = const [];
                          });
                        },
                      )
                    : null,
              ),
            ),
          ),
        ),
      ),
      body:
          _query.isEmpty ? _buildEmptySearch(context) : _buildResults(context),
    );
  }

  Widget _buildEmptySearch(BuildContext context) {
    // Discovery state (box empty): recent searches + popular searches as chips.
    if (_recent.isEmpty && _popular.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.search,
                  size: 64, color: TekaColors.mutedForeground),
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
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_recent.isNotEmpty) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("Recherches récentes",
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600)),
              TextButton(
                onPressed: () async {
                  await _recentStore.clear();
                  if (mounted) setState(() => _recent = const []);
                },
                child: const Text("Effacer"),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: _recent
                .map((t) => ActionChip(
                      avatar: const Icon(Icons.history, size: 18),
                      label: Text(t),
                      onPressed: () => _runTerm(t),
                    ))
                .toList(),
          ),
          const SizedBox(height: 20),
        ],
        if (_popular.isNotEmpty) ...[
          Text("Recherches populaires",
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: _popular
                .map((t) => ActionChip(
                      avatar: const Icon(Icons.trending_up, size: 18),
                      label: Text(t),
                      onPressed: () => _runTerm(t),
                    ))
                .toList(),
          ),
        ],
      ],
    );
  }

  /// Tappable popular-term chips for the zero-result fallback.
  Widget _popularChips() {
    if (_popular.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          Text("Recherches populaires",
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            alignment: WrapAlignment.center,
            children: _popular
                .map((t) => ActionChip(
                      avatar: const Icon(Icons.trending_up, size: 18),
                      label: Text(t),
                      onPressed: () => _runTerm(t),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildSuggestionChips(BuildContext context) {
    final labelStyle = Theme.of(context).textTheme.bodySmall?.copyWith(
          color: TekaColors.mutedForeground,
          fontWeight: FontWeight.w600,
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 0, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_categories.isNotEmpty) ...[
            Text("Catégories", style: labelStyle),
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
          if (_brands.isNotEmpty) ...[
            if (_categories.isNotEmpty) const SizedBox(height: 10),
            Text("Marques", style: labelStyle),
            const SizedBox(height: 6),
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.only(right: 16),
                itemCount: _brands.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final b = _brands[i];
                  return ActionChip(
                    avatar: const Icon(Icons.sell_outlined, size: 16),
                    label: Text(b.name),
                    // Parity with buyer-web: tapping a brand runs a search for
                    // its name (surfaces that brand's products in the grid).
                    onPressed: () {
                      _controller.text = b.name;
                      _controller.selection = TextSelection.fromPosition(
                        TextPosition(offset: b.name.length),
                      );
                      _saveRecent(b.name);
                      _applyQuery(b.name);
                    },
                  );
                },
              ),
            ),
          ],
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
      if (!next.isLoading &&
          _query.isNotEmpty &&
          _lastSearchTracked != _query) {
        _lastSearchTracked = _query;
        final count = next.pagination?.total ?? next.products.length;
        const PosthogAnalytics().capture('search_performed', properties: {
          'query': scrubAnalyticsText(_query),
          'result_count': count,
        });
        if (count == 0) {
          const PosthogAnalytics().capture('zero_results', properties: {
            'query': scrubAnalyticsText(_query),
          });
        }
      }
    });

    if (state.isLoading && state.products.isEmpty) {
      return const ProductGridSkeleton(count: 6);
    }

    if (state.error != null && state.products.isEmpty) {
      return AppErrorState(
        message: state.error!,
        onRetry: () {
          ref.read(browseProductsProvider(_params).notifier).refresh();
        },
      );
    }

    if (state.products.isEmpty) {
      // Also save the (failed) term so it appears in recent — and offer popular
      // searches as a recovery path instead of a dead end.
      return ListView(
        children: [
          const SizedBox(height: 48),
          const Icon(Icons.search_off,
              size: 56, color: TekaColors.mutedForeground),
          const SizedBox(height: 12),
          Center(
            child: Text(
              "Aucun résultat pour \"$_query\"",
              style: Theme.of(context).textTheme.titleSmall,
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 6),
          Center(
            child: Text(
              "Essayez un autre mot-clé ou une recherche populaire :",
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: TekaColors.mutedForeground),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 20),
          _popularChips(),
        ],
      );
    }

    return RefreshIndicator(
      color: TekaColors.tekaRed,
      onRefresh: () async {
        await ref.read(browseProductsProvider(_params).notifier).refresh();
      },
      child: CustomScrollView(
        slivers: [
          // Category + brand suggestions (autocomplete) — tappable chips above
          // results. Products appear in the grid below.
          if (_categories.isNotEmpty || _brands.isNotEmpty)
            SliverToBoxAdapter(child: _buildSuggestionChips(context)),
          // Results count
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
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
