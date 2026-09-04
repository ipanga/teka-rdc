import 'package:flutter/material.dart';
import '../theme/teka_colors.dart';

class SellerFilterOption<T> {
  final T? value;
  final String label;
  const SellerFilterOption(this.value, this.label);
}

/// Natural height lets French labels and system text scaling keep their space.
class SellerFilterBar<T> extends StatelessWidget {
  final List<SellerFilterOption<T>> options;
  final T? selected;
  final ValueChanged<T?> onSelected;

  const SellerFilterBar({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          for (var i = 0; i < options.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: ChoiceChip(
                label: Text(options[i].label),
                selected: selected == options[i].value,
                selectedColor: TekaColors.tekaRed.withValues(alpha: 0.08),
                backgroundColor: TekaColors.background,
                checkmarkColor: TekaColors.tekaRed,
                labelStyle: TextStyle(
                  color: selected == options[i].value
                      ? TekaColors.tekaRed
                      : TekaColors.foreground,
                  fontWeight: selected == options[i].value
                      ? FontWeight.w600
                      : FontWeight.w400,
                ),
                side: BorderSide(
                  color: selected == options[i].value
                      ? TekaColors.tekaRed
                      : TekaColors.border,
                ),
                materialTapTargetSize: MaterialTapTargetSize.padded,
                onSelected: (_) => onSelected(options[i].value),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
