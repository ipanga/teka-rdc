import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/models/review_model.dart';
import '../providers/reviews_provider.dart';
import 'star_rating.dart';

/// Shared with the API and buyer-web — keep the three in sync.
const int kReviewTitleMin = 5;
const int kReviewTitleMax = 100;

/// Comment cap — the API's `UpdateReviewDto`/`CreateReviewDto` `@MaxLength`.
/// The form used to stop at 500 while buyer-web had no cap at all.
const int kReviewTextMax = 1000;

/// Public name a review is published under when the buyer has not set a
/// name (same fallback as the tile and as buyer-web).
const String kAnonymousReviewerName = 'Acheteur';

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
    // A failure left over from a previous attempt must not greet the buyer
    // when the sheet reopens.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(reviewsProvider(widget.productId).notifier).clearMutationError();
      }
    });
  }

  void _onTitleChanged() => setState(() {});

  @override
  void dispose() {
    _titleController.removeListener(_onTitleChanged);
    _titleController.dispose();
    _textController.dispose();
    super.dispose();
  }

  /// True when the signed-in buyer has no first or last name: the review
  /// will be published under the generic name, and the form says so with a
  /// way to fix it — never a blocker, never an invented name.
  bool _buyerIsNameless(Map<String, dynamic>? user) {
    if (user == null) return false;
    final first = (user['firstName'] as String? ?? '').trim();
    final last = (user['lastName'] as String? ?? '').trim();
    return first.isEmpty && last.isEmpty;
  }

  Future<void> _submit() async {
    final notifier = ref.read(reviewsProvider(widget.productId).notifier);
    final title = _titleController.text.trim();
    final text = _textController.text.trim();
    // PATCH when editing — never a second POST, so an edit cannot create a
    // duplicate review. An emptied comment is sent as '' so it is cleared.
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
            text: text.isNotEmpty ? text : null,
          );
    if (success && mounted) {
      Navigator.of(context).pop(true);
    }
    // On failure the sheet stays open: the provider's mutationError is
    // rendered below, with the buyer's input intact.
  }

  @override
  Widget build(BuildContext context) {
    final reviewsState = ref.watch(reviewsProvider(widget.productId));
    final isSubmitting = reviewsState.isSubmitting;
    final submitError = reviewsState.mutationError;
    final nameless = _buyerIsNameless(ref.watch(authProvider).user);

    return Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: 24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
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
              _isEditing ? 'Modifier mon avis' : 'Écrire un avis',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: TekaColors.foreground,
                  ),
            ),
            const SizedBox(height: 20),

            // Rating label
            const Text(
              'Votre note',
              style: TextStyle(
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
                hintText: 'Résumez votre expérience en quelques mots',
                hintStyle: const TextStyle(
                  color: TekaColors.mutedForeground,
                  fontSize: 14,
                ),
                errorText:
                    _titleController.text.trim().isNotEmpty && !_titleValid
                        ? 'Le titre doit contenir au moins $kReviewTitleMin caractères'
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

            // Comment (optional; emptying it on edit clears it)
            TextField(
              controller: _textController,
              maxLines: 4,
              maxLength: kReviewTextMax,
              decoration: InputDecoration(
                hintText: 'Partagez votre expérience avec ce produit…',
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

            if (nameless) ...[
              const SizedBox(height: 4),
              _NamelessNotice(
                onAddName: () {
                  Navigator.of(context).pop(false);
                  context.push('/profile/informations');
                },
              ),
            ],

            if (submitError != null) ...[
              const SizedBox(height: 12),
              Semantics(
                liveRegion: true,
                child: Text(
                  submitError,
                  key: const ValueKey('review-submit-error'),
                  style: const TextStyle(
                    color: TekaColors.destructive,
                    fontSize: 13,
                    height: 1.35,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 20),

            // Submit button
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _rating == 0 || !_titleValid || isSubmitting
                    ? null
                    : _submit,
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
                    : Text(
                        submitError != null
                            ? 'Réessayer'
                            : (_isEditing
                                ? 'Enregistrer les modifications'
                                : "Publier l'avis"),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// « Votre avis sera publié sous le nom « Acheteur » » + a link to the
/// personal-information screen. Informative only: a buyer without a name can
/// still publish.
class _NamelessNotice extends StatelessWidget {
  final VoidCallback onAddName;

  const _NamelessNotice({required this.onAddName});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        const Text(
          'Votre avis sera publié sous le nom « $kAnonymousReviewerName ».',
          style: TextStyle(
            color: TekaColors.mutedForeground,
            fontSize: 12,
          ),
        ),
        TextButton(
          onPressed: onAddName,
          style: TextButton.styleFrom(
            foregroundColor: TekaColors.tekaRed,
            padding: const EdgeInsets.symmetric(horizontal: 6),
            minimumSize: const Size(0, 32),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            textStyle: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          child: const Text('Ajouter mon nom'),
        ),
      ],
    );
  }
}
