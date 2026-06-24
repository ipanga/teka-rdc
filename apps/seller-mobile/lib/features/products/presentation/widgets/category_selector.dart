import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/product_model.dart';
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
          labelText: "Categorie",
          suffixIcon: const Icon(Icons.arrow_drop_down),
        ),
        child: Text(
          _selectedCategoryName(ref) ?? "Selectionner une categorie",
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
                      Text(
                        "Selectionner une categorie",
                        style: Theme.of(sheetContext)
                            .textTheme
                            .titleLarge
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      const Spacer(),
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
                                Text("Une erreur est survenue. Veuillez reessayer."),
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

class _CategoryList extends StatefulWidget {
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
  State<_CategoryList> createState() => _CategoryListState();
}

// Lowercases + strips common French accents so "tele"/"chauss" match
// "Téléphones"/"Chaussures". Dart has no built-in unaccent; this covers the
// accents used in the taxonomy.
String _normalizeCat(String s) {
  const from = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ';
  const to = 'aaaaaaceeeeiiiinooooouuuuyy';
  var r = s.toLowerCase();
  for (var i = 0; i < from.length; i++) {
    r = r.replaceAll(from[i], to[i]);
  }
  return r.trim();
}

class _FlatMatch {
  final CategoryModel node;
  final String? parentName;
  const _FlatMatch(this.node, this.parentName);
}

class _CategoryListState extends State<_CategoryList> {
  final Set<String> _expandedIds = {};
  final TextEditingController _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // Flat matches across ALL levels (category, subcategory, product type) by
  // own-name match, each carrying its full parent path for context (e.g.
  // "Téléphones & Accessoires › Smartphones"). Client-side — the full taxonomy
  // is already loaded.
  List<_FlatMatch> _matches(String query) {
    final nq = _normalizeCat(query);
    final out = <_FlatMatch>[];
    void walk(CategoryModel node, String? path) {
      if (_normalizeCat(node.name).contains(nq)) {
        out.add(_FlatMatch(node, path));
      }
      final childPath = path == null ? node.name : '$path › ${node.name}';
      for (final child in node.subcategories) {
        walk(child, childPath);
      }
    }
    for (final cat in widget.categories) {
      walk(cat, null);
    }
    return out;
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
              hintText: "Rechercher une categorie...",
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              suffixIcon: searching
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _query = '');
                      },
                    )
                  : null,
            ),
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: searching
              ? _buildSearchResults()
              : _buildTree(),
        ),
      ],
    );
  }

  Widget _buildSearchResults() {
    final matches = _matches(_query);
    if (matches.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text("Aucune categorie trouvee"),
        ),
      );
    }
    return ListView.builder(
      controller: widget.scrollController,
      itemCount: matches.length,
      itemBuilder: (context, index) {
        final m = matches[index];
        return ListTile(
          leading: m.node.emoji != null
              ? Text(m.node.emoji!, style: const TextStyle(fontSize: 22))
              : Icon(
                  m.parentName == null
                      ? Icons.category_outlined
                      : Icons.subdirectory_arrow_right,
                  size: 20,
                ),
          title: Text(m.node.name),
          subtitle: m.parentName != null ? Text(m.parentName!) : null,
          trailing: widget.selectedId == m.node.id
              ? const Icon(Icons.check, color: TekaColors.success)
              : null,
          selected: widget.selectedId == m.node.id,
          onTap: () => widget.onSelect(m.node),
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
