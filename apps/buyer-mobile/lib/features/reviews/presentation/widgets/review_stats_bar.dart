import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/models/review_model.dart';
import 'star_rating.dart';

class ReviewStatsBar extends StatelessWidget {
  final ReviewStatsModel stats;

  const ReviewStatsBar({super.key, required this.stats});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: TekaColors.muted,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Left: average and stars
          Column(
            children: [
              Text(
                stats.avgRating.toStringAsFixed(1),
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: TekaColors.foreground,
                    ),
              ),
              const SizedBox(height: 4),
              StarRating(rating: stats.avgRating, size: 16),
              const SizedBox(height: 4),
              Text(
                '${stats.totalReviews} ${l10n.reviewsTitle.toLowerCase()}',
                style: const TextStyle(
                  color: TekaColors.mutedForeground,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(width: 24),
          // Right: distribution bars
          Expanded(
            child: Column(
              children: List.generate(5, (index) {
                final star = 5 - index;
                final count = stats.distribution[star] ?? 0;
                final fraction = stats.totalReviews > 0
                    ? count / stats.totalReviews
                    : 0.0;

                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 14,
                        child: Text(
                          '$star',
                          style: const TextStyle(
                            fontSize: 12,
                            color: TekaColors.mutedForeground,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.star, size: 12, color: TekaColors.warning),
                      const SizedBox(width: 6),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(2),
                          child: LinearProgressIndicator(
                            value: fraction,
                            minHeight: 8,
                            backgroundColor: TekaColors.border,
                            valueColor: const AlwaysStoppedAnimation<Color>(
                              TekaColors.warning,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      SizedBox(
                        width: 24,
                        child: Text(
                          '$count',
                          style: const TextStyle(
                            fontSize: 11,
                            color: TekaColors.mutedForeground,
                          ),
                          textAlign: TextAlign.end,
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}
