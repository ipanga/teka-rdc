import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/category_images.dart';
import '../../data/models/category_model.dart';

/// Round category tile — a bundled product photo in a circle with the label
/// below (falls back to the emoji when the category has no bundled image).
/// Replaces the old horizontal pill on the home categories strip.
class CategoryCircle extends StatelessWidget {
  final CategoryModel category;

  const CategoryCircle({super.key, required this.category});

  @override
  Widget build(BuildContext context) {
    final name = category.name;
    final asset = categoryImageAsset(category.slug);

    return GestureDetector(
      onTap: () => context.push(
        '/categories/${category.id}',
        extra: {'categoryName': name},
      ),
      child: SizedBox(
        width: 76,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: TekaColors.surfaceMuted,
                shape: BoxShape.circle,
                border: Border.all(color: TekaColors.border),
              ),
              clipBehavior: Clip.antiAlias,
              alignment: Alignment.center,
              child: asset != null
                  ? Padding(
                      padding: const EdgeInsets.all(10),
                      child: Image.asset(asset, fit: BoxFit.contain),
                    )
                  : Text(
                      category.emoji ?? '📦',
                      style: const TextStyle(fontSize: 26),
                    ),
            ),
            const SizedBox(height: 6),
            Text(
              name,
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                height: 1.15,
                color: TekaColors.foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
