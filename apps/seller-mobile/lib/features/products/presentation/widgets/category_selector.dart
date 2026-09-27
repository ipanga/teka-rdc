import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/category_search_hit.dart';
import '../../data/models/product_model.dart';
import '../../data/products_repository.dart';
import '../providers/products_provider.dart';

class CategorySelector extends ConsumerWidget {
  final String? selectedCategoryId;
  final ValueChanged<CategoryModel> onCategorySelected;

  const CategorySelector({
    super.key,
    this.selectedCategoryId,
    required this.onCategorySelected,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return InkWell(
      onTap: () => _showCategorySheet(context, ref),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: "Catégorie",
          suffixIcon: const Icon(Icons.arrow_drop_down),
        ),
        child: Text(
          _selectedCategoryName(ref) ?? "Sélectionner une catégorie",
          style: TextStyle(
            color: selectedCategoryId != null
                ? TekaColors.foreground
                : TekaColors.mutedForeground,
          ),
        ),
      ),
    );
  }

  String? _selectedCategoryName(WidgetRef ref) {
    if (selectedCategoryId == null) return null;
    final categoriesAsync = ref.watch(categoriesProvider);
    return categoriesAsync.whenOrNull(
      data: (categories) {
        // Recurse all levels, returning the full path to the selected node
        // (e.g. "Téléphones & Accessoires > Smartphones > Android").
        String? find(CategoryModel node, String path) {
          final full = path.isEmpty ? node.name : '$path > ${node.name}';
          if (node.id == selectedCategoryId) return full;
          for (final child in node.subcategories) {
            final r = find(child, full);
            if (r != null) return r;
          }
          return null;
        }

        for (final cat in categories) {
          final r = find(cat, '');
          if (r != null) return r;
        }
        return null;
      },
    );
  }

  void _showCategorySheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) {
        return DraggableScrollableSheet(
          initialChildSize: 0.7,
          minChildSize: 0.4,
          maxChildSize: 0.9,
          expand: false,
          builder: (_, scrollController) {
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          "Sélectionner une catégorie",
                          style: Theme.of(sheetContext)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(sheetContext),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),
                Expanded(
                  child: Consumer(
                    builder: (ctx, innerRef, _) {
                      final categoriesAsync =
                          innerRef.watch(categoriesProvider);
                      return categoriesAsync.when(
                        loading: () => const Center(
                          child: CircularProgressIndicator(),
                        ),
                        error: (e, _) => Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.error_outline, size: 48),
                                const SizedBox(height: 8),
                                const Text(
                                  "Impossible de charger les catégories.",
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 12),
                                OutlinedButton.icon(
                                  onPressed: () =>
                                      innerRef.invalidate(categoriesProvider),
                                  icon: const Icon(Icons.refresh),
                                  label: const Text("Réessayer"),
                                ),
                              ],
                            ),
                          ),
                        ),
                        data: (categories) => _CategoryList(
                          categories: categories,
                          selectedId: selectedCategoryId,
                          scrollController: scrollController,
                          onSelect: (cat) {
                            onCategorySelected(cat);
                            Navigator.pop(sheetContext);
                          },
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _CategoryList extends ConsumerStatefulWidget {
  final List<CategoryModel> categories;
  final String? selectedId;
  final ScrollController scrollController;
  final ValueChanged<CategoryModel> onSelect;

  const _CategoryList({
    required this.categories,
    this.selectedId,
    required this.scrollController,
    required this.onSelect,
  });

  @override
  ConsumerState<_CategoryList> createState() => _CategoryListState();
}

/// Search (Seller Catalogue Speed-up): the server ranks LEAVES by name, full
/// path, invisible aliases and linked brands (« omo » → Lessive). While the
/// request is in flight, or when it fails (offline), a local match on the
/// leaf's name/path keeps the list useful. Only leaves are ever offered —
/// the API refuses a product on an intermediate category.
class _CategoryListState extends ConsumerState<_CategoryList> {
  final Set<String> _expandedIds = {};
  final TextEditingController _searchController = TextEditingController();
  String _query = '';

  Timer? _debounce;
  int _requestSeq = 0;
  String? _remoteQuery;
  List<CategorySearchHit>? _remoteHits;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    setState(() => _query = value);
    _debounce?.cancel();
    final q = value.trim();
    if (normalizeCategoryQuery(q).replaceAll(' ', '').length < 2) return;
    _debounce = Timer(const Duration(milliseconds: 300), () => _fetch(q));
  }

  Future<void> _fetch(String q) async {
    final seq = ++_requestSeq;
    try {
      final hits =
          await ref.read(productsRepositoryProvider).searchCategories(q);
      if (!mounted || seq != _requestSeq) return; // a newer query won
      setState(() {
        _remoteQuery = q;
        _remoteHits = hits;
      });
    } catch (_) {
      // Offline or server error: the local fallback stays on screen.
      if (!mounted || seq != _requestSeq) return;
      setState(() {
        _remoteQuery = null;
        _remoteHits = null;
      });
    }
  }

  List<CategorySearchHit> _currentHits() {
    final q = _query.trim();
    if (_remoteHits != null && _remoteQuery == q) return _remoteHits!;
    return localCategorySearch(widget.categories, q);
  }

  CategoryModel _nodeFor(CategorySearchHit hit) {
    CategoryModel? find(List<CategoryModel> nodes) {
      for (final n in nodes) {
        if (n.id == hit.id) return n;
        final r = find(n.subcategories);
        if (r != null) return r;
      }
      return null;
    }

    return find(widget.categories) ??
        CategoryModel(id: hit.id, name: hit.name);
  }

  @override
  Widget build(BuildContext context) {
    final searching = _query.trim().isNotEmpty;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: TextField(
            controller: _searchController,
            autofocus: false,
            decoration: InputDecoration(
              hintText: "Rechercher : lessive, omo, céréales…",
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              suffixIcon: searching
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      tooltip: 'Effacer la recherche',
                      onPressed: () {
                        _searchController.clear();
                        _onQueryChanged('');
                      },
                    )
                  : null,
            ),
            onChanged: _onQueryChanged,
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: searching ? _buildSearchResults() : _buildTree(),
        ),
      ],
    );
  }

  Widget _buildSearchResults() {
    final hits = _currentHits();
    if (hits.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            "Aucune catégorie trouvée. Essayez un autre mot ou parcourez la liste.",
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    return ListView.builder(
      controller: widget.scrollController,
      itemCount: hits.length,
      itemBuilder: (context, index) {
        final hit = hits[index];
        final selected = widget.selectedId == hit.id;
        return ListTile(
          leading: const Icon(Icons.subdirectory_arrow_right, size: 20),
          title: Text(hit.name),
          subtitle: hit.parentPath != null ? Text(hit.parentPath!) : null,
          trailing: selected
              ? const Icon(Icons.check, color: TekaColors.success)
              : null,
          selected: selected,
          onTap: () => widget.onSelect(_nodeFor(hit)),
        );
      },
    );
  }

  Widget _buildTree() {
    return ListView.builder(
      controller: widget.scrollController,
      itemCount: widget.categories.length,
      itemBuilder: (context, index) => _buildNode(widget.categories[index], 0),
    );
  }

  // Recursive node: branches (with children) expand/collapse; leaves (product
  // types) are selectable. Works for any depth (category → subcategory →
  // product type).
  Widget _buildNode(CategoryModel node, int depth) {
    final isExpanded = _expandedIds.contains(node.id);
    final hasChildren = node.subcategories.isNotEmpty;
    final isSelected = widget.selectedId == node.id;

    return Column(
      children: [
        ListTile(
          contentPadding: EdgeInsets.only(left: 16.0 + depth * 24, right: 16),
          leading: node.emoji != null
              ? Text(node.emoji!,
                  style: TextStyle(fontSize: depth == 0 ? 24 : 20))
              : Icon(
                  depth == 0
                      ? Icons.category_outlined
                      : Icons.subdirectory_arrow_right,
                  size: depth == 0 ? 24 : 20,
                ),
          title: Text(
            node.name,
            style: TextStyle(
              fontWeight: depth == 0 ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
          trailing: hasChildren
              ? Icon(isExpanded
                  ? Icons.keyboard_arrow_up
                  : Icons.keyboard_arrow_down)
              : (isSelected
                  ? const Icon(Icons.check, color: TekaColors.success)
                  : null),
          selected: isSelected,
          onTap: () {
            if (hasChildren) {
              setState(() {
                if (isExpanded) {
                  _expandedIds.remove(node.id);
                } else {
                  _expandedIds.add(node.id);
                }
              });
            } else {
              widget.onSelect(node); // leaf (product type)
            }
          },
        ),
        if (isExpanded && hasChildren)
          ...node.subcategories.map((child) => _buildNode(child, depth + 1)),
      ],
    );
  }
}
