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
        width: 78,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Clean white avatar — the product illustration pops on white, with
            // a soft shadow for depth (replaces the flat gray-with-border tile).
            Container(
              width: 66,
              height: 66,
              decoration: BoxDecoration(
                color: TekaColors.surface,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: TekaColors.foreground.withValues(alpha: 0.06),
                    blurRadius: 7,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              clipBehavior: Clip.antiAlias,
              alignment: Alignment.center,
              child: asset != null
                  ? Padding(
                      padding: const EdgeInsets.all(11),
                      child: Image.asset(asset, fit: BoxFit.contain),
                    )
                  : Text(
                      category.emoji ?? '📦',
                      style: const TextStyle(fontSize: 28),
                    ),
            ),
            const SizedBox(height: 8),
            Text(
              name,
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                height: 1.2,
                color: TekaColors.foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
