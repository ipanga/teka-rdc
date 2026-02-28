import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
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

  BrowseProductsParams get _params => BrowseProductsParams(
        search: _query.isNotEmpty ? _query : null,
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
      if (mounted) {
        setState(() => _query = value.trim());
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

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
            onSubmitted: (value) {
              setState(() => _query = value.trim());
            },
            decoration: InputDecoration(
              hintText: l10n.searchPlaceholder,
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
                        setState(() => _query = '');
                      },
                    )
                  : null,
            ),
          ),
        ),
      ),
      body: _query.isEmpty ? _buildEmptySearch(context, l10n) : _buildResults(context, l10n),
    );
  }

  Widget _buildEmptySearch(BuildContext context, AppLocalizations l10n) {
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
              l10n.searchPlaceholder,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: TekaColors.mutedForeground,
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResults(BuildContext context, AppLocalizations l10n) {
    final state = ref.watch(browseProductsProvider(_params));

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
                l10n.searchNoResults,
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
          // Results count
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
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
                          child: Text(l10n.productLoadMore),
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
