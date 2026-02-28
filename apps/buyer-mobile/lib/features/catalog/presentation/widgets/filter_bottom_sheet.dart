import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';

class FilterOptions {
  final String? condition;
  final String? sortBy;

  const FilterOptions({this.condition, this.sortBy});

  FilterOptions copyWith({
    String? condition,
    String? sortBy,
    bool clearCondition = false,
    bool clearSortBy = false,
  }) {
    return FilterOptions(
      condition: clearCondition ? null : (condition ?? this.condition),
      sortBy: clearSortBy ? null : (sortBy ?? this.sortBy),
    );
  }
}

class FilterBottomSheet extends StatefulWidget {
  final FilterOptions initialFilters;

  const FilterBottomSheet({
    super.key,
    required this.initialFilters,
  });

  static Future<FilterOptions?> show(
    BuildContext context, {
    required FilterOptions initialFilters,
  }) {
    return showModalBottomSheet<FilterOptions>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => FilterBottomSheet(initialFilters: initialFilters),
    );
  }

  @override
  State<FilterBottomSheet> createState() => _FilterBottomSheetState();
}

class _FilterBottomSheetState extends State<FilterBottomSheet> {
  late String? _condition;
  late String? _sortBy;

  @override
  void initState() {
    super.initState();
    _condition = widget.initialFilters.condition;
    _sortBy = widget.initialFilters.sortBy;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
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
            l10n.filterSort,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 16),

          // Condition filter
          Text(
            l10n.filterPrice,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              _buildConditionChip(null, l10n.filterAll, l10n),
              _buildConditionChip('NEW', l10n.filterNew, l10n),
              _buildConditionChip('USED', l10n.filterUsed, l10n),
            ],
          ),
          const SizedBox(height: 20),

          // Sort options
          Text(
            l10n.filterSort,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 8),
          _buildSortOption('newest', l10n.filterSortNewest),
          _buildSortOption('price_asc', l10n.filterSortPriceLow),
          _buildSortOption('price_desc', l10n.filterSortPriceHigh),
          _buildSortOption('popular', l10n.filterSortPopular),

          const SizedBox(height: 20),

          // Action buttons
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () {
                    setState(() {
                      _condition = null;
                      _sortBy = null;
                    });
                  },
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: TekaColors.border),
                  ),
                  child: Text(l10n.filterReset),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () {
                    Navigator.of(context).pop(FilterOptions(
                      condition: _condition,
                      sortBy: _sortBy,
                    ));
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: TekaColors.tekaRed,
                  ),
                  child: Text(l10n.filterApply),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildConditionChip(
    String? value,
    String label,
    AppLocalizations l10n,
  ) {
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
