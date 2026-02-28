import 'package:flutter/material.dart';

class StarRating extends StatelessWidget {
  final int rating;
  final double size;
  final Color? color;
  final Color? emptyColor;

  const StarRating({
    super.key,
    required this.rating,
    this.size = 16,
    this.color,
    this.emptyColor,
  });

  @override
  Widget build(BuildContext context) {
    final starColor = color ?? Colors.amber;
    final emptyStarColor = emptyColor ?? Colors.grey.shade300;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (index) {
        return Icon(
          index < rating ? Icons.star_rounded : Icons.star_outline_rounded,
          size: size,
          color: index < rating ? starColor : emptyStarColor,
        );
      }),
    );
  }
}

class StarRatingDouble extends StatelessWidget {
  final double rating;
  final double size;
  final Color? color;
  final Color? emptyColor;

  const StarRatingDouble({
    super.key,
    required this.rating,
    this.size = 16,
    this.color,
    this.emptyColor,
  });

  @override
  Widget build(BuildContext context) {
    final starColor = color ?? Colors.amber;
    final emptyStarColor = emptyColor ?? Colors.grey.shade300;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (index) {
        final diff = rating - index;
        IconData icon;
        Color iconColor;

        if (diff >= 1) {
          icon = Icons.star_rounded;
          iconColor = starColor;
        } else if (diff >= 0.5) {
          icon = Icons.star_half_rounded;
          iconColor = starColor;
        } else {
          icon = Icons.star_outline_rounded;
          iconColor = emptyStarColor;
        }

        return Icon(icon, size: size, color: iconColor);
      }),
    );
  }
}
