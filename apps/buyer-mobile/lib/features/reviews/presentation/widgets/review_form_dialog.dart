import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../data/models/review_model.dart';
import '../providers/reviews_provider.dart';
import 'star_rating.dart';

/// Shared with the API and buyer-web — keep the three in sync.
const int kReviewTitleMin = 5;
const int kReviewTitleMax = 100;

class ReviewFormDialog extends ConsumerStatefulWidget {
  final String productId;
  final String orderId;

  /// When set, the dialog EDITS this review in place instead of creating one.
  /// Only the owner ever reaches this path; the API re-checks ownership.
  final ReviewModel? existingReview;

  const ReviewFormDialog({
    super.key,
    required this.productId,
    required this.orderId,
    this.existingReview,
  });

  @override
  ConsumerState<ReviewFormDialog> createState() => _ReviewFormDialogState();
}

class _ReviewFormDialogState extends ConsumerState<ReviewFormDialog> {
  late int _rating;
  late final TextEditingController _titleController;
  late final TextEditingController _textController;

  bool get _isEditing => widget.existingReview != null;

  bool get _titleValid {
    final t = _titleController.text.trim();
    return t.length >= kReviewTitleMin && t.length <= kReviewTitleMax;
  }

  @override
  void initState() {
    super.initState();
    // Prefill every field when editing so the buyer amends rather than retypes.
    final existing = widget.existingReview;
    _rating = existing?.rating ?? 0;
    _titleController = TextEditingController(text: existing?.title ?? '');
    _textController = TextEditingController(text: existing?.text ?? '');
    // The submit button enables/disables on title length.
    _titleController.addListener(_onTitleChanged);
  }

  void _onTitleChanged() => setState(() {});

  @override
  void dispose() {
    _titleController.removeListener(_onTitleChanged);
    _titleController.dispose();
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
            "Ecrire un avis",
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: TekaColors.foreground,
                ),
          ),
          const SizedBox(height: 20),

          // Rating label
          Text(
            "Votre note",
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

          // Title — required for new AND edited reviews
          TextField(
            controller: _titleController,
            maxLength: kReviewTitleMax,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: "Titre de l'avis",
              hintText: "Résumez votre expérience en quelques mots",
              hintStyle: const TextStyle(
                color: TekaColors.mutedForeground,
                fontSize: 14,
              ),
              errorText: _titleController.text.trim().isNotEmpty && !_titleValid
                  ? "Le titre doit contenir au moins $kReviewTitleMin caractères"
                  : null,
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
          const SizedBox(height: 12),

          // Comment
          TextField(
            controller: _textController,
            maxLines: 4,
            maxLength: 500,
            decoration: InputDecoration(
              hintText: "Partagez votre experience avec ce produit...",
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
              onPressed: _rating == 0 || !_titleValid || isSubmitting
                  ? null
                  : () async {
                      final notifier = ref
                          .read(reviewsProvider(widget.productId).notifier);
                      final title = _titleController.text.trim();
                      final text = _textController.text.trim().isNotEmpty
                          ? _textController.text.trim()
                          : null;
                      // PATCH when editing — never a second POST, so an edit
                      // cannot create a duplicate review.
                      final success = _isEditing
                          ? await notifier.updateReview(
                              reviewId: widget.existingReview!.id,
                              rating: _rating,
                              title: title,
                              text: text,
                            )
                          : await notifier.submitReview(
                              orderId: widget.orderId,
                              rating: _rating,
                              title: title,
                              text: text,
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
                  : Text("Soumettre l'avis"),
            ),
          ),
        ],
      ),
    );
  }
}
