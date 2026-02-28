import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/reviews_provider.dart';
import 'star_rating.dart';

class ReviewFormDialog extends ConsumerStatefulWidget {
  final String productId;
  final String orderId;

  const ReviewFormDialog({
    super.key,
    required this.productId,
    required this.orderId,
  });

  @override
  ConsumerState<ReviewFormDialog> createState() => _ReviewFormDialogState();
}

class _ReviewFormDialogState extends ConsumerState<ReviewFormDialog> {
  int _rating = 0;
  final _textController = TextEditingController();

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final reviewsState = ref.watch(reviewsProvider(widget.productId));
    final isSubmitting = reviewsState.isSubmitting;

    return Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: 24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle bar
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: TekaColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Title
          Text(
            l10n.writeReview,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: TekaColors.foreground,
                ),
          ),
          const SizedBox(height: 20),

          // Rating label
          Text(
            l10n.yourRating,
            style: const TextStyle(
              color: TekaColors.foreground,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),

          // Interactive stars
          Center(
            child: InteractiveStarRating(
              rating: _rating,
              size: 40,
              onChanged: (value) {
                setState(() {
                  _rating = value;
                });
              },
            ),
          ),
          const SizedBox(height: 20),

          // Text field
          TextField(
            controller: _textController,
            maxLines: 4,
            maxLength: 500,
            decoration: InputDecoration(
              hintText: l10n.reviewPlaceholder,
              hintStyle: const TextStyle(
                color: TekaColors.mutedForeground,
                fontSize: 14,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: TekaColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: TekaColors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: TekaColors.tekaRed),
              ),
              contentPadding: const EdgeInsets.all(12),
            ),
            style: const TextStyle(fontSize: 14),
          ),
          const SizedBox(height: 20),

          // Submit button
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _rating == 0 || isSubmitting
                  ? null
                  : () async {
                      final success = await ref
                          .read(reviewsProvider(widget.productId).notifier)
                          .submitReview(
                            orderId: widget.orderId,
                            rating: _rating,
                            text: _textController.text.isNotEmpty
                                ? _textController.text
                                : null,
                          );
                      if (success && context.mounted) {
                        Navigator.of(context).pop(true);
                      }
                    },
              style: FilledButton.styleFrom(
                backgroundColor: TekaColors.tekaRed,
                disabledBackgroundColor: TekaColors.muted,
                padding: const EdgeInsets.symmetric(vertical: 14),
                textStyle: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              child: isSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(l10n.submitReview),
            ),
          ),
        ],
      ),
    );
  }
}
