import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/review_model.dart';
import 'star_rating.dart';

class ReviewTile extends StatelessWidget {
  final ReviewModel review;

  const ReviewTile({super.key, required this.review});

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd/MM/yyyy', 'fr');
    final buyerName = review.buyer?.fullName ?? '---';
    final initials = review.buyer?.initials ?? '?';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: TekaColors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: TekaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: buyer info + rating
          Row(
            children: [
              // Avatar
              CircleAvatar(
                radius: 18,
                backgroundColor: TekaColors.muted,
                backgroundImage: review.buyer?.avatar != null
                    ? NetworkImage(review.buyer!.avatar!)
                    : null,
                child: review.buyer?.avatar == null
                    ? Text(
                        initials,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: TekaColors.mutedForeground,
                        ),
                      )
                    : null,
              ),
              const SizedBox(width: 10),
              // Name + date
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      buyerName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      dateFormat.format(review.createdAtDate),
                      style: const TextStyle(
                        fontSize: 12,
                        color: TekaColors.mutedForeground,
                      ),
                    ),
                  ],
                ),
              ),
              // Stars
              StarRating(rating: review.rating, size: 16),
            ],
          ),

          // Review text
          if (review.text != null && review.text!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              review.text!,
              style: const TextStyle(
                fontSize: 14,
                height: 1.4,
                color: TekaColors.foreground,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
