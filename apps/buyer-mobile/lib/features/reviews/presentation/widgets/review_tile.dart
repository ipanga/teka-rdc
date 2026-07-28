import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/review_model.dart';
import 'star_rating.dart';

class ReviewTile extends StatelessWidget {
  final ReviewModel review;
  final bool isOwn;
  final VoidCallback? onDelete;
  /// Owner-only. Opens the form prefilled so the buyer amends in place.
  final VoidCallback? onEdit;

  const ReviewTile({
    super.key,
    required this.review,
    this.isOwn = false,
    this.onDelete,
    this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    final buyerName = review.buyer?.displayName ?? 'Acheteur';
    final dateStr = _formatDate(review.createdAt);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: TekaColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Avatar
              CircleAvatar(
                radius: 16,
                backgroundColor: TekaColors.muted,
                backgroundImage: review.buyer?.avatar != null &&
                        review.buyer!.avatar!.isNotEmpty
                    ? NetworkImage(review.buyer!.avatar!)
                    : null,
                child: review.buyer?.avatar == null ||
                        review.buyer!.avatar!.isEmpty
                    ? Text(
                        buyerName.isNotEmpty
                            ? buyerName[0].toUpperCase()
                            : 'A',
                        style: const TextStyle(
                          color: TekaColors.mutedForeground,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      )
                    : null,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      buyerName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                        color: TekaColors.foreground,
                      ),
                    ),
                    Text(
                      dateStr,
                      style: const TextStyle(
                        color: TekaColors.mutedForeground,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              if (isOwn && onEdit != null)
                IconButton(
                  icon: const Icon(
                    Icons.edit_outlined,
                    size: 20,
                    color: TekaColors.tekaRed,
                  ),
                  tooltip: 'Modifier mon avis',
                  onPressed: onEdit,
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              if (isOwn && onEdit != null) const SizedBox(width: 12),
              if (isOwn && onDelete != null)
                IconButton(
                  icon: const Icon(
                    Icons.delete_outline,
                    size: 20,
                    color: TekaColors.destructive,
                  ),
                  onPressed: onDelete,
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
            ],
          ),
          const SizedBox(height: 8),
          StarRating(rating: review.rating.toDouble(), size: 16),
          // Legacy reviews (pre-2026-07-28) carry no title: render nothing
          // rather than an empty line.
          if (review.title != null && review.title!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              review.title!,
              style: const TextStyle(
                color: TekaColors.foreground,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          if (review.text != null && review.text!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              review.text!,
              style: const TextStyle(
                color: TekaColors.foreground,
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return DateFormat('dd/MM/yyyy', 'fr').format(date);
    } catch (_) {
      return dateStr;
    }
  }
}
