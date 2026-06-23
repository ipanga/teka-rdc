import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/catalog_repository.dart';

class FilterOptions {
  final String? condition;
  final String? sortBy;

  /// attributeId -> selected option values (SELECT / MULTISELECT / BOOLEAN
  /// facets; a BOOLEAN facet uses the single value 'true').
  final Map<String, List<String>> attributes;

  /// Selected brand ids for the brand facet.
  final List<String> brandIds;

  const FilterOptions({
    this.condition,
    this.sortBy,
    this.attributes = const {},
    this.brandIds = const [],
  });

  FilterOptions copyWith({
    String? condition,
    String? sortBy,
    Map<String, List<String>>? attributes,
    List<String>? brandIds,
    bool clearCondition = false,
    bool clearSortBy = false,
    bool clearAttributes = false,
    bool clearBrandIds = false,
  }) {
    return FilterOptions(
      condition: clearCondition ? null : (condition ?? this.condition),
      sortBy: clearSortBy ? null : (sortBy ?? this.sortBy),
      attributes:
          clearAttributes ? const {} : (attributes ?? this.attributes),
      brandIds: clearBrandIds ? const [] : (brandIds ?? this.brandIds),
    );
  }
}

class FilterBottomSheet extends ConsumerStatefulWidget {
  final FilterOptions initialFilters;
  final String categoryId;

  const FilterBottomSheet({
    super.key,
    required this.initialFilters,
    required this.categoryId,
  });

  static Future<FilterOptions?> show(
    BuildContext context, {
    required FilterOptions initialFilters,
    required String categoryId,
  }) {
    return showModalBottomSheet<FilterOptions>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => FilterBottomSheet(
        initialFilters: initialFilters,
        categoryId: categoryId,
      ),
    );
  }

  @override
  ConsumerState<FilterBottomSheet> createState() => _FilterBottomSheetState();
}

class _FilterBottomSheetState extends ConsumerState<FilterBottomSheet> {
  String? _condition;
  String? _sortBy;
  late Map<String, List<String>> _selectedAttributes;
  late List<String> _selectedBrandIds;

  List<FacetAttribute> _attributes = const [];
  bool _loadingAttributes = true;
  List<BrandOption> _brands = const [];

  @override
  void initState() {
    super.initState();
    _condition = widget.initialFilters.condition;
    _sortBy = widget.initialFilters.sortBy;
    // Deep-copy so toggles don't mutate the caller's map.
    _selectedAttributes = {
      for (final e in widget.initialFilters.attributes.entries)
        e.key: List<String>.from(e.value),
    };
    _selectedBrandIds = List<String>.from(widget.initialFilters.brandIds);
    _loadAttributes();
    _loadBrands();
  }

  Future<void> _loadBrands() async {
    try {
      final brands = await ref
          .read(catalogRepositoryProvider)
          .getBrands(widget.categoryId);
      if (!mounted) return;
      setState(() => _brands = brands);
    } catch (_) {
      if (!mounted) return;
      setState(() => _brands = const []);
    }
  }

  void _toggleBrand(String brandId) {
    setState(() {
      if (_selectedBrandIds.contains(brandId)) {
        _selectedBrandIds = _selectedBrandIds.where((b) => b != brandId).toList();
      } else {
        _selectedBrandIds = [..._selectedBrandIds, brandId];
      }
    });
  }

  Future<void> _loadAttributes() async {
    try {
      final attrs = await ref
          .read(catalogRepositoryProvider)
          .getCategoryAttributes(widget.categoryId);
      if (!mounted) return;
      setState(() {
        _attributes = attrs;
        _loadingAttributes = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingAttributes = false);
    }
  }

  void _toggleAttribute(String attributeId, String value) {
    setState(() {
      final current = _selectedAttributes[attributeId] ?? const [];
      final next = List<String>.from(current);
      if (next.contains(value)) {
        next.remove(value);
      } else {
        next.add(value);
      }
      if (next.isEmpty) {
        _selectedAttributes.remove(attributeId);
      } else {
        _selectedAttributes[attributeId] = next;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.85,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Handle bar
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: TekaColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Title
            Text(
              "Trier et filtrer",
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 16),

            // Scrollable filter body
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Condition filter
                    Text(
                      "Etat",
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [
                        _buildConditionChip(null, "Tous"),
                        _buildConditionChip('NEW', "Neuf"),
                        _buildConditionChip('USED', "Occasion"),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Sort options
                    Text(
                      "Trier et filtrer",
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(height: 8),
                    _buildSortOption('newest', "Plus recents"),
                    _buildSortOption('price_asc', "Prix croissant"),
                    _buildSortOption('price_desc', "Prix decroissant"),
                    _buildSortOption('popular', "Popularite"),

                    // Brand facet
                    ..._buildBrandFacet(),

                    // Attribute facets
                    ..._buildAttributeFacets(),

                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),

            // Action buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      setState(() {
                        _condition = null;
                        _sortBy = null;
                        _selectedAttributes = {};
                        _selectedBrandIds = [];
                      });
                    },
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: TekaColors.border),
                    ),
                    child: Text("Reinitialiser"),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () {
                      Navigator.of(context).pop(FilterOptions(
                        condition: _condition,
                        sortBy: _sortBy,
                        attributes: _selectedAttributes,
                        brandIds: _selectedBrandIds,
                      ));
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: TekaColors.tekaRed,
                    ),
                    child: Text("Appliquer"),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildBrandFacet() {
    if (_brands.isEmpty) return const [];
    return [
      Padding(
        padding: const EdgeInsets.only(top: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Marque",
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: _brands.map((b) {
                final isSelected = _selectedBrandIds.contains(b.id);
                return FilterChip(
                  label: Text(b.name),
                  selected: isSelected,
                  onSelected: (_) => _toggleBrand(b.id),
                  selectedColor: TekaColors.tekaRed,
                  checkmarkColor: Colors.white,
                  labelStyle: TextStyle(
                    color: isSelected ? Colors.white : TekaColors.foreground,
                    fontSize: 13,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    ];
  }

  List<Widget> _buildAttributeFacets() {
    if (_loadingAttributes) {
      return const [
        SizedBox(height: 20),
        Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ];
    }
    if (_attributes.isEmpty) return const [];

    return _attributes.map((attr) {
      final selected = _selectedAttributes[attr.id] ?? const [];

      // BOOLEAN: a single on/off chip filtering to value 'true'.
      if (attr.type == 'BOOLEAN') {
        final isOn = selected.contains('true');
        return Padding(
          padding: const EdgeInsets.only(top: 20),
          child: Align(
            alignment: Alignment.centerLeft,
            child: FilterChip(
              label: Text(attr.name),
              selected: isOn,
              onSelected: (_) => _toggleAttribute(attr.id, 'true'),
              selectedColor: TekaColors.tekaRed,
              checkmarkColor: Colors.white,
              labelStyle: TextStyle(
                color: isOn ? Colors.white : TekaColors.foreground,
                fontSize: 13,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),
        );
      }

      return Padding(
        padding: const EdgeInsets.only(top: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              attr.name,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: attr.options.map((opt) {
                final isSelected = selected.contains(opt);
                return FilterChip(
                  label: Text(opt),
                  selected: isSelected,
                  onSelected: (_) => _toggleAttribute(attr.id, opt),
                  selectedColor: TekaColors.tekaRed,
                  checkmarkColor: Colors.white,
                  labelStyle: TextStyle(
                    color: isSelected ? Colors.white : TekaColors.foreground,
                    fontSize: 13,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      );
    }).toList();
  }

  Widget _buildConditionChip(String? value, String label) {
    final isSelected = _condition == value;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) {
        setState(() => _condition = value);
      },
      selectedColor: TekaColors.tekaRed,
      labelStyle: TextStyle(
        color: isSelected ? Colors.white : TekaColors.foreground,
        fontSize: 13,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),
    );
  }

  Widget _buildSortOption(String value, String label) {
    return RadioListTile<String?>(
      value: value,
      groupValue: _sortBy,
      onChanged: (v) => setState(() => _sortBy = v),
      title: Text(label, style: const TextStyle(fontSize: 14)),
      activeColor: TekaColors.tekaRed,
      dense: true,
      contentPadding: EdgeInsets.zero,
    );
  }
}
