'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import type { Review, ReviewStats, PaginatedReviews } from '@/lib/types';

// ========================
// Star display component
// ========================

function StarRating({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`${sizeClass} ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ========================
// Clickable star selector
// ========================

function StarSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="p-0.5 focus:outline-none"
        >
          <svg
            className={`w-8 h-8 transition-colors ${
              star <= (hovered || value) ? 'text-yellow-400' : 'text-gray-300'
            }`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// ========================
// Rating distribution bars
// ========================

function RatingDistribution({
  distribution,
  total,
}: {
  distribution: ReviewStats['distribution'];
  total: number;
}) {

  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[star as keyof typeof distribution] || 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-sm">
            <span className="w-6 text-right text-muted-foreground">{star}</span>
            <svg className="w-4 h-4 text-yellow-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 text-xs text-muted-foreground text-right">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ========================
// Review modal
// ========================

/** Shared with the API and buyer-mobile — keep the three in sync. */
const TITLE_MIN = 5;
const TITLE_MAX = 100;
/** Comment cap — the API's `@MaxLength(1000)`; there was no cap here before. */
const TEXT_MAX = 1000;
/** Public name of a reviewer without a name — same word as buyer-mobile. */
const ANONYMOUS_REVIEWER = 'Acheteur';

function ReviewModal({
  productId,
  orderId,
  existingReview,
  onClose,
  onSubmitted,
}: {
  productId: string;
  orderId: string;
  /** When set, the modal edits this review in place instead of creating one. */
  existingReview?: Review | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const isEditing = !!existingReview;
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [title, setTitle] = useState(existingReview?.title ?? '');
  const [text, setText] = useState(existingReview?.text ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const trimmedTitle = title.trim();
  const titleInvalid =
    trimmedTitle.length < TITLE_MIN || trimmedTitle.length > TITLE_MAX;

  async function handleSubmit() {
    if (rating === 0 || titleInvalid) return;
    setIsSubmitting(true);
    setError('');

    try {
      // PATCH updates the existing row — it can never create a second review.
      await apiFetch(
        isEditing ? `/v1/reviews/${existingReview!.id}` : '/v1/reviews',
        {
          method: isEditing ? 'PATCH' : 'POST',
          body: JSON.stringify(
            isEditing
              // `text` is always sent on edit: an empty string CLEARS the
              // comment (stored as null). Omitting it kept the old comment,
              // so a buyer could never remove one — same fix as buyer-mobile.
              ? { rating, title: trimmedTitle, text: text.trim() }
              : {
                  productId,
                  orderId,
                  rating,
                  title: trimmedTitle,
                  text: text.trim() || undefined,
                },
          ),
        },
      );
      onSubmitted();
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Impossible d'enregistrer votre avis. Réessayez.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const authUser = useAuthStore((s) => s.user);
  const nameless =
    !!authUser &&
    !(authUser.firstName ?? '').trim() &&
    !(authUser.lastName ?? '').trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            {isEditing ? "Modifier mon avis" : "Donner votre avis"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Star selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">
            {"Votre note"}
          </label>
          <StarSelector value={rating} onChange={setRating} />
        </div>

        {/* Title — required for new and edited reviews alike */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">
            {"Titre de l'avis"}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={"Résumez votre expérience en quelques mots"}
            maxLength={TITLE_MAX}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
          {trimmedTitle.length > 0 && trimmedTitle.length < TITLE_MIN && (
            <p className="mt-1 text-xs text-destructive">
              {`Le titre doit contenir au moins ${TITLE_MIN} caractères`}
            </p>
          )}
        </div>

        {/* Comment */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">
            {"Votre avis"}
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Partagez votre expérience avec ce produit..."}
            rows={4}
            maxLength={TEXT_MAX}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
          />
          {nameless && (
            <p className="mt-1 text-xs text-muted-foreground">
              {`Votre avis sera publié sous le nom « ${ANONYMOUS_REVIEWER} ». `}
              <Link href="/profil" className="font-semibold text-primary hover:underline">
                {"Ajouter mon nom"}
              </Link>
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="mb-3 text-sm text-destructive">{error}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || titleInvalid || isSubmitting}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <svg className="animate-spin w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            isEditing ? "Enregistrer" : "Soumettre"
          )}
        </button>
      </div>
    </div>
  );
}

// ========================
// Main ProductReviews component
// ========================

interface ProductReviewsProps {
  productId: string;
}

export function ProductReviews({ productId }: ProductReviewsProps) {
  const user = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [canReviewReason, setCanReviewReason] = useState('');
  // The eligible DELIVERED order id — required by POST /v1/reviews. Without it
  // the create DTO rejects the submission with a 400.
  const [canReviewOrderId, setCanReviewOrderId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  // When set, the modal opens in edit mode for the buyer's own review.
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch<ReviewStats>(
        `/v1/reviews/products/${productId}/stats`,
      );
      setStats(res.data);
    } catch {
      // stats unavailable
    }
  }, [productId]);

  const fetchReviews = useCallback(
    async (p: number) => {
      try {
        const res = await apiFetch<PaginatedReviews | Review[]>(
          `/v1/reviews/products/${productId}?page=${p}&limit=10&sort=newest`,
        );
        if (Array.isArray(res.data)) {
          setReviews(res.data);
          setTotalPages(1);
        } else {
          setReviews(res.data.data);
          setTotalPages(Math.ceil(res.data.meta.total / res.data.meta.limit) || 1);
        }
      } catch {
        // reviews unavailable
      }
    },
    [productId],
  );

  const fetchMyReview = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<Review>(
        `/v1/reviews/products/${productId}/mine`,
      );
      setMyReview(res.data);
    } catch {
      setMyReview(null);
    }
  }, [productId, user]);

  const checkCanReview = useCallback(async () => {
    if (!user) {
      setCanReview(false);
      return;
    }
    try {
      const res = await apiFetch<{
        canReview: boolean;
        reason?: string;
        orderId?: string;
      }>(`/v1/reviews/products/${productId}/can-review`);
      setCanReview(res.data.canReview);
      setCanReviewReason(res.data.reason || '');
      setCanReviewOrderId(res.data.orderId ?? null);
    } catch {
      setCanReview(false);
    }
  }, [productId, user]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchStats(), fetchReviews(1), fetchMyReview(), checkCanReview()]).finally(
      () => setIsLoading(false),
    );
  }, [fetchStats, fetchReviews, fetchMyReview, checkCanReview]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchReviews(newPage);
  }

  async function handleReviewSubmitted() {
    setShowModal(false);
    setFeedback("Avis soumis avec succès");
    setFeedbackIsError(false);
    setTimeout(() => setFeedback(''), 3000);
    // Refresh data
    await Promise.all([fetchStats(), fetchReviews(1), fetchMyReview(), checkCanReview()]);
    setPage(1);
  }

  async function handleDeleteReview(reviewId: string) {
    try {
      await apiFetch(`/v1/reviews/${reviewId}`, { method: 'DELETE' });
      setFeedback("Avis supprimé");
      setFeedbackIsError(false);
      setTimeout(() => setFeedback(''), 3000);
      setConfirmDeleteId(null);
      // Refresh data
      await Promise.all([fetchStats(), fetchReviews(1), fetchMyReview(), checkCanReview()]);
      setPage(1);
    } catch (err: unknown) {
      // A failed delete used to vanish silently; the review is still there.
      setFeedback(
        err instanceof Error && err.message
          ? err.message
          : "Impossible de supprimer l'avis. Réessayez.",
      );
      setFeedbackIsError(true);
      setTimeout(() => setFeedback(''), 4000);
      setConfirmDeleteId(null);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('fr-CD', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getReviewerName(review: Review) {
    // Optional-chained deliberately: the reviewer is `buyer` (not `user`), and
    // it is optional. A missing reviewer must degrade to a fallback name — it
    // must never throw, because this runs inside the review list's .map() and
    // an exception there takes down the WHOLE product page via the route error
    // boundary, not just this one row.
    const parts = [review.buyer?.firstName, review.buyer?.lastName].filter(
      Boolean,
    );
    return parts.length > 0 ? parts.join(' ') : ANONYMOUS_REVIEWER;
  }

  if (isLoading) {
    return (
      <div className="py-6 border-t border-border">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-48" />
          <div className="flex gap-8">
            <div className="h-24 bg-muted rounded w-32" />
            <div className="flex-1 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-3 bg-muted rounded" />
              ))}
            </div>
          </div>
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-muted rounded w-32" />
              <div className="h-3 bg-muted rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 border-t border-border">
      <h2 className="text-lg font-semibold text-foreground mb-4">
        {"Avis clients"}
      </h2>

      {/* Feedback banner */}
      {feedback && (
        <div
          role={feedbackIsError ? 'alert' : 'status'}
          className={
            feedbackIsError
              ? 'mb-4 flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive'
              : 'mb-4 flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success'
          }
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {feedbackIsError ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M12 3l9 16H3L12 3z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            )}
          </svg>
          {feedback}
        </div>
      )}

      {/* Stats + Distribution */}
      {stats && stats.totalReviews > 0 ? (
        <div className="flex flex-col sm:flex-row gap-6 mb-6">
          {/* Average rating */}
          <div className="flex flex-col items-center justify-center px-4">
            <span className="text-4xl font-bold text-foreground">
              {stats.avgRating.toFixed(1)}
            </span>
            <StarRating rating={Math.round(stats.avgRating)} size="md" />
            <span className="text-sm text-muted-foreground mt-1">
              {stats.totalReviews} {stats.totalReviews === 1 ? "étoile" : "étoiles"}
            </span>
          </div>

          {/* Distribution */}
          <div className="flex-1 max-w-sm">
            <RatingDistribution distribution={stats.distribution} total={stats.totalReviews} />
          </div>
        </div>
      ) : (
        <div className="mb-4 flex flex-col items-center text-center py-6">
          <svg className="w-10 h-10 text-border mb-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.27 6.2 19.86l1.11-6.46-4.7-4.58 6.49-.94L12 2z" />
          </svg>
          <p className="text-sm font-medium text-foreground">{"Aucun avis pour ce produit."}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{"Soyez le premier à laisser un avis."}</p>
        </div>
      )}

      {/* Write review button or status */}
      {user && (
        <div className="mb-6">
          {myReview ? (
            <p className="text-sm text-muted-foreground">{"Vous avez déjà donné votre avis"}</p>
          ) : canReview ? (
            <button
              onClick={() => setShowModal(true)}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {"Donner votre avis"}
            </button>
          ) : canReviewReason === 'already_reviewed' ? (
            <p className="text-sm text-muted-foreground">{"Vous avez déjà donné votre avis"}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{"Vous pourrez donner votre avis après livraison"}</p>
          )}
        </div>
      )}

      {/* My review (highlighted) */}
      {myReview && (
        <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-foreground">
                  {getReviewerName(myReview)}
                </span>
                <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                  {"Acheteur vérifié"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <StarRating rating={myReview.rating} size="sm" />
                <span className="text-xs text-muted-foreground">
                  {formatDate(myReview.createdAt)}
                </span>
              </div>
            </div>
            <div>
              {confirmDeleteId === myReview.id ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteReview(myReview.id)}
                    className="text-xs px-3 py-1.5 bg-destructive text-white rounded-lg hover:bg-destructive/90 transition-colors"
                  >
                    {"Supprimer mon avis"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setEditingReview(myReview);
                      setShowModal(true);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    {"Modifier mon avis"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(myReview.id)}
                    className="text-xs text-destructive hover:underline"
                  >
                    {"Supprimer mon avis"}
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Legacy reviews (pre-2026-07-28) have no title: render nothing
              rather than an empty heading. */}
          {myReview.title && (
            <p className="text-sm font-semibold text-foreground mt-2">
              {myReview.title}
            </p>
          )}
          {myReview.text && (
            <p className="text-sm text-foreground mt-1">{myReview.text}</p>
          )}
        </div>
      )}

      {/* Review list */}
      {reviews.length > 0 && (
        <div className="space-y-4">
          {reviews
            .filter((r) => r.id !== myReview?.id)
            .map((review) => (
              <div
                key={review.id}
                className="py-4 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-foreground">
                    {getReviewerName(review)}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                    {"Acheteur vérifié"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <StarRating rating={review.rating} size="sm" />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
                {review.title && (
                  <p className="text-sm font-semibold text-foreground mb-0.5">
                    {review.title}
                  </p>
                )}
                {review.text && (
                  <p className="text-sm text-muted-foreground">{review.text}</p>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            &laquo;
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => handlePageChange(p)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                p === page
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border hover:bg-muted'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            &raquo;
          </button>
        </div>
      )}

      {/* Review modal. In EDIT mode there is no canReviewOrderId — canReview()
          reports ALREADY_REVIEWED once a review exists — so the guard must not
          require it. PATCH does not send orderId anyway; the review's link to
          its delivered order is fixed at creation and is not editable. */}
      {showModal && (editingReview || canReviewOrderId) && (
        <ReviewModal
          productId={productId}
          orderId={canReviewOrderId ?? ''}
          existingReview={editingReview}
          onClose={() => {
            setShowModal(false);
            setEditingReview(null);
          }}
          onSubmitted={handleReviewSubmitted}
        />
      )}
    </div>
  );
}
