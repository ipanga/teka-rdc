import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/attribute_model.dart';

class DynamicAttributeField extends StatelessWidget {
  final AttributeModel attribute;
  final String value;
  final String locale;
  final ValueChanged<String> onChanged;

  const DynamicAttributeField({
    super.key,
    required this.attribute,
    required this.value,
    required this.locale,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final label = attribute.getLocalizedName(locale);
    final l10n = AppLocalizations.of(context)!;

    switch (attribute.type) {
      case 'SELECT':
        return _buildSelect(context, label, l10n);
      case 'MULTISELECT':
        return _buildMultiselect(context, label);
      case 'NUMERIC':
        return _buildNumeric(context, label);
      case 'TEXT':
      default:
        return _buildText(context, label);
    }
  }

  Widget _buildSelect(BuildContext context, String label, AppLocalizations l10n) {
    return DropdownButtonFormField<String>(
      initialValue: value.isNotEmpty ? value : null,
      decoration: InputDecoration(
        labelText: attribute.isRequired ? '$label *' : label,
      ),
      hint: Text(l10n.selectOption),
      items: attribute.options.map((opt) {
        return DropdownMenuItem(value: opt, child: Text(opt));
      }).toList(),
      onChanged: (v) => onChanged(v ?? ''),
      validator: attribute.isRequired
          ? (v) => (v == null || v.isEmpty) ? l10n.requiredField : null
          : null,
    );
  }

  Widget _buildMultiselect(BuildContext context, String label) {
    final selected = value.isNotEmpty ? value.split(',') : <String>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          attribute.isRequired ? '$label *' : label,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: TekaColors.mutedForeground,
              ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: attribute.options.map((opt) {
            final isSelected = selected.contains(opt);
            return FilterChip(
              label: Text(opt),
              selected: isSelected,
              selectedColor: TekaColors.tekaRed.withValues(alpha: 0.15),
              checkmarkColor: TekaColors.tekaRed,
              onSelected: (_) {
                final newSelected = List<String>.from(selected);
                if (isSelected) {
                  newSelected.remove(opt);
                } else {
                  newSelected.add(opt);
                }
                onChanged(newSelected.join(','));
              },
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildNumeric(BuildContext context, String label) {
    return TextFormField(
      initialValue: value,
      decoration: InputDecoration(
        labelText: attribute.isRequired ? '$label *' : label,
      ),
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.]'))],
      onChanged: onChanged,
      validator: attribute.isRequired
          ? (v) => (v == null || v.trim().isEmpty)
              ? AppLocalizations.of(context)!.requiredField
              : null
          : null,
    );
  }

  Widget _buildText(BuildContext context, String label) {
    return TextFormField(
      initialValue: value,
      decoration: InputDecoration(
        labelText: attribute.isRequired ? '$label *' : label,
      ),
      onChanged: onChanged,
      validator: attribute.isRequired
          ? (v) => (v == null || v.trim().isEmpty)
              ? AppLocalizations.of(context)!.requiredField
              : null
          : null,
    );
  }
}
