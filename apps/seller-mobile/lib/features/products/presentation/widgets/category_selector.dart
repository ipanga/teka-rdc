import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
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
    final l10n = AppLocalizations.of(context)!;

    return InkWell(
      onTap: () => _showCategorySheet(context, ref),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: l10n.category,
          suffixIcon: const Icon(Icons.arrow_drop_down),
        ),
        child: Text(
          _selectedCategoryName(ref) ?? l10n.selectCategory,
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
          if (cat.id == selectedCategoryId) return cat.getLocalizedName('fr');
          for (final sub in cat.subcategories) {
            if (sub.id == selectedCategoryId) {
              return '${cat.getLocalizedName('fr')} > ${sub.getLocalizedName('fr')}';
            }
          }
        }
        return null;
      },
    );
  }

  void _showCategorySheet(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

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
                        l10n.selectCategory,
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
                                Text(l10n.authGenericError),
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

class _CategoryListState extends State<_CategoryList> {
  final Set<String> _expandedIds = {};

  @override
  Widget build(BuildContext context) {
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
                category.getLocalizedName('fr'),
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
                  title: Text(sub.getLocalizedName('fr')),
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
