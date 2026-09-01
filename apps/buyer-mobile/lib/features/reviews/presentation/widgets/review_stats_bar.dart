import 'package:flutter/material.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/review_model.dart';
import 'star_rating.dart';

class ReviewStatsBar extends StatelessWidget {
  final ReviewStatsModel stats;

  const ReviewStatsBar({super.key, required this.stats});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: TekaColors.muted,
        borderRadius: BorderRadius.circular(8),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final stackContent = constraints.maxWidth < 340 ||
              MediaQuery.textScalerOf(context).scale(1) > 1.3;
          final summary = _ReviewAverage(stats: stats);
          final distribution = _ReviewDistribution(stats: stats);

          if (stackContent) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                summary,
                const SizedBox(height: 16),
                distribution,
              ],
            );
          }

          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              summary,
              const SizedBox(width: 24),
              Expanded(child: distribution),
            ],
          );
        },
      ),
    );
  }
}

class _ReviewAverage extends StatelessWidget {
  final ReviewStatsModel stats;

  const _ReviewAverage({required this.stats});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
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
          '${stats.totalReviews} avis',
          style: const TextStyle(
            color: TekaColors.mutedForeground,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}

class _ReviewDistribution extends StatelessWidget {
  final ReviewStatsModel stats;

  const _ReviewDistribution({required this.stats});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(5, (index) {
        final star = 5 - index;
        final count = stats.distribution[star] ?? 0;
        final fraction =
            stats.totalReviews > 0 ? count / stats.totalReviews : 0.0;

        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            children: [
              SizedBox(
                width: 24,
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
                width: 32,
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
    );
  }
}
