import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';

/// Read-only star rating display.
class StarRating extends StatelessWidget {
  final double rating;
  final double size;
  final Color color;

  const StarRating({
    super.key,
    required this.rating,
    this.size = 18,
    this.color = const Color(0xFFF59E0B),
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (index) {
        final starValue = index + 1;
        if (rating >= starValue) {
          return Icon(Icons.star, size: size, color: color);
        } else if (rating >= starValue - 0.5) {
          return Icon(Icons.star_half, size: size, color: color);
        } else {
          return Icon(Icons.star_border, size: size, color: color);
        }
      }),
    );
  }
}

/// Interactive star rating for review forms.
class InteractiveStarRating extends StatelessWidget {
  final int rating;
  final double size;
  final ValueChanged<int> onChanged;

  const InteractiveStarRating({
    super.key,
    required this.rating,
    this.size = 36,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (index) {
        final starValue = index + 1;
        return GestureDetector(
          onTap: () => onChanged(starValue),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Icon(
              starValue <= rating ? Icons.star : Icons.star_border,
              size: size,
              color: starValue <= rating
                  ? TekaColors.warning
                  : TekaColors.mutedForeground,
            ),
          ),
        );
      }),
    );
  }
}
