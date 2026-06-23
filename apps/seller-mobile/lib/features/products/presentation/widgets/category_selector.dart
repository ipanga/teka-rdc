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
        for (final cat in categories) {
          if (cat.id == selectedCategoryId) return cat.name;
          for (final sub in cat.subcategories) {
            if (sub.id == selectedCategoryId) {
              return '${cat.name} > ${sub.name}';
            }
          }
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

  // Flat matches across category AND subcategory names (own-name match), each
  // subcategory carrying its parent for context. Filtering is client-side —
  // the full taxonomy is already loaded.
  List<_FlatMatch> _matches(String query) {
    final nq = _normalizeCat(query);
    final out = <_FlatMatch>[];
    for (final cat in widget.categories) {
      if (_normalizeCat(cat.name).contains(nq)) {
        out.add(_FlatMatch(cat, null));
      }
      for (final sub in cat.subcategories) {
        if (_normalizeCat(sub.name).contains(nq)) {
          out.add(_FlatMatch(sub, cat.name));
        }
      }
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
      itemBuilder: (context, index) {
        final category = widget.categories[index];
        final isExpanded = _expandedIds.contains(category.id);
        final hasSubs = category.subcategories.isNotEmpty;

        return Column(
          children: [
            ListTile(
              leading: category.emoji != null
                  ? Text(category.emoji!, style: const TextStyle(fontSize: 24))
                  : const Icon(Icons.category_outlined),
              title: Text(
                category.name,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              trailing: hasSubs
                  ? Icon(
                      isExpanded
                          ? Icons.keyboard_arrow_up
                          : Icons.keyboard_arrow_down,
                    )
                  : (widget.selectedId == category.id
                      ? const Icon(Icons.check, color: TekaColors.success)
                      : null),
              selected: widget.selectedId == category.id,
              onTap: () {
                if (hasSubs) {
                  setState(() {
                    if (isExpanded) {
                      _expandedIds.remove(category.id);
                    } else {
                      _expandedIds.add(category.id);
                    }
                  });
                } else {
                  widget.onSelect(category);
                }
              },
            ),
            if (isExpanded && hasSubs)
              ...category.subcategories.map((sub) {
                return ListTile(
                  contentPadding: const EdgeInsets.only(left: 56, right: 16),
                  leading: sub.emoji != null
                      ? Text(sub.emoji!,
                          style: const TextStyle(fontSize: 20))
                      : const Icon(Icons.subdirectory_arrow_right, size: 20),
                  title: Text(sub.name),
                  trailing: widget.selectedId == sub.id
                      ? const Icon(Icons.check, color: TekaColors.success)
                      : null,
                  selected: widget.selectedId == sub.id,
                  onTap: () => widget.onSelect(sub),
                );
              }),
          ],
        );
      },
    );
  }
}
