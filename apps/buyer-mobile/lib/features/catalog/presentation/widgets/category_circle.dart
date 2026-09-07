import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../data/category_images.dart';
import '../../data/models/category_model.dart';

/// Width of one tile in the home category strip.
const double kCategoryCircleWidth = 92;

/// Diameter of the circular image.
const double kCategoryCircleDiameter = 66;

/// Height the strip must give its tiles at the current text scale.
///
/// French category names are long — « Téléphones & Accessoires »,
/// « Décoration & Éclairage » — so the label is a fixed two-line box: every
/// tile is the same height whether its name wraps or not, and the strip stops
/// being ragged. The box grows with the text scale instead of clipping, which
/// is what the previous magic `118` did at 1.5x. The two lines are capped
/// because a third would make the strip taller than the content it introduces.
double categoryCircleHeight(BuildContext context) {
  final scale = MediaQuery.textScalerOf(context).scale(_labelFontSize) /
      _labelFontSize;
  final labelBox = _labelLines * _labelFontSize * _labelLineHeight * scale;
  // circle + gap + two label lines + the strip's own 6 pt breathing room.
  return kCategoryCircleDiameter + TekaSpacing.xs + labelBox + 12;
}

const double _labelFontSize = 11.5;
const double _labelLineHeight = 1.15;
const int _labelLines = 2;

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
        width: kCategoryCircleWidth,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Clean white avatar — the product illustration pops on white, with
            // a soft shadow for depth (replaces the flat gray-with-border tile).
            Container(
              width: kCategoryCircleDiameter,
              height: kCategoryCircleDiameter,
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
            const SizedBox(height: TekaSpacing.xs),
            // A fixed two-line box: « Supermarché » and « Téléphones &
            // Accessoires » now occupy the same height, so the strip reads as
            // a row rather than a ragged edge. Top-aligned so short names sit
            // right under their circle.
            SizedBox(
              height: _labelLines *
                  MediaQuery.textScalerOf(context).scale(_labelFontSize) *
                  _labelLineHeight,
              child: Text(
                name,
                maxLines: _labelLines,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: _labelFontSize,
                  fontWeight: FontWeight.w600,
                  height: _labelLineHeight,
                  color: TekaColors.foreground,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
