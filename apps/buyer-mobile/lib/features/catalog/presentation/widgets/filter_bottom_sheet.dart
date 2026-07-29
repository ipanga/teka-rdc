import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/catalog_repository.dart';

class FilterOptions {
  final String? condition;
  final String? sortBy;

  /// Price range (CDF, as strings to match the query params). Null = unset.
  final String? minPrice;
  final String? maxPrice;

  /// Promotion-only facet (seller-set discounts).
  final bool onPromotion;

  /// attributeId -> selected option values (SELECT / MULTISELECT / BOOLEAN
  /// facets; a BOOLEAN facet uses the single value 'true').
  final Map<String, List<String>> attributes;

  /// Selected brand ids for the brand facet.
  final List<String> brandIds;

  const FilterOptions({
    this.condition,
    this.sortBy,
    this.minPrice,
    this.maxPrice,
    this.onPromotion = false,
    this.attributes = const {},
    this.brandIds = const [],
  });

  /// Count of active filters (for an active-filter badge/chip count).
  int get activeCount =>
      (condition != null ? 1 : 0) +
      (sortBy != null ? 1 : 0) +
      ((minPrice != null && minPrice!.isNotEmpty) ? 1 : 0) +
      ((maxPrice != null && maxPrice!.isNotEmpty) ? 1 : 0) +
      (onPromotion ? 1 : 0) +
      attributes.length +
      brandIds.length;

  FilterOptions copyWith({
    String? condition,
    String? sortBy,
    String? minPrice,
    String? maxPrice,
    bool? onPromotion,
    Map<String, List<String>>? attributes,
    List<String>? brandIds,
    bool clearCondition = false,
    bool clearSortBy = false,
    bool clearPrice = false,
    bool clearAttributes = false,
    bool clearBrandIds = false,
  }) {
    return FilterOptions(
      condition: clearCondition ? null : (condition ?? this.condition),
      sortBy: clearSortBy ? null : (sortBy ?? this.sortBy),
      minPrice: clearPrice ? null : (minPrice ?? this.minPrice),
      maxPrice: clearPrice ? null : (maxPrice ?? this.maxPrice),
      onPromotion: onPromotion ?? this.onPromotion,
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
  bool _onPromotion = false;
  late final TextEditingController _minPriceController;
  late final TextEditingController _maxPriceController;
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
    _onPromotion = widget.initialFilters.onPromotion;
    _minPriceController =
        TextEditingController(text: widget.initialFilters.minPrice ?? '');
    _maxPriceController =
        TextEditingController(text: widget.initialFilters.maxPrice ?? '');
    // Deep-copy so toggles don't mutate the caller's map.
    _selectedAttributes = {
      for (final e in widget.initialFilters.attributes.entries)
        e.key: List<String>.from(e.value),
    };
    _selectedBrandIds = List<String>.from(widget.initialFilters.brandIds);
    _loadAttributes();
    _loadBrands();
  }

  @override
  void dispose() {
    _minPriceController.dispose();
    _maxPriceController.dispose();
    super.dispose();
  }

  String? _trimToNull(String s) => s.trim().isEmpty ? null : s.trim();

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
                    // The Etat (Neuf / Occasion) filter was removed
                    // 2026-07-28: Teka sells new products only, so it could
                    // only filter everything in or everything out. The
                    // `condition` field stays on ProductFilters and the API
                    // still accepts the param — see
                    // docs/product-condition-deprecation.md.

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
                    _buildSortOption('popularity', "Popularite"),

                    const SizedBox(height: 20),

                    // Price range (CDF)
                    Text(
                      "Fourchette de prix (CDF)",
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _minPriceController,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: "Min",
                              isDense: true,
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _maxPriceController,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: "Max",
                              isDense: true,
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Promotion toggle
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      title: const Text("Produits en promotion"),
                      value: _onPromotion,
                      activeThumbColor: TekaColors.tekaRed,
                      onChanged: (v) => setState(() => _onPromotion = v),
                    ),

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
                        _onPromotion = false;
                        _minPriceController.clear();
                        _maxPriceController.clear();
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
                        minPrice: _trimToNull(_minPriceController.text),
                        maxPrice: _trimToNull(_maxPriceController.text),
                        onPromotion: _onPromotion,
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
