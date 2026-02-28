import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/category_model.dart';

class CategoryChip extends StatelessWidget {
  final CategoryModel category;
  final bool isSelected;

  const CategoryChip({
    super.key,
    required this.category,
    this.isSelected = false,
  });

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final name = category.localizedName(locale);
    final emoji = category.emoji ?? '';

    return GestureDetector(
      onTap: () => context.push(
        '/categories/${category.id}',
        extra: {'categoryName': name},
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? TekaColors.tekaRed : TekaColors.muted,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? TekaColors.tekaRed : TekaColors.border,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (emoji.isNotEmpty) ...[
              Text(emoji, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 4),
            ],
            Text(
              name,
              style: TextStyle(
                color: isSelected ? Colors.white : TekaColors.foreground,
                fontSize: 13,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
