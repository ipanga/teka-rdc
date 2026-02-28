'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('Reviews');

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

function ReviewModal({
  productId,
  onClose,
  onSubmitted,
}: {
  productId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const t = useTranslations('Reviews');
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (rating === 0) return;
    setIsSubmitting(true);
    setError('');

    try {
      await apiFetch('/v1/reviews', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          rating,
          text: text.trim() || undefined,
        }),
      });
      onSubmitted();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

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
            {t('writeReview')}
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
            {t('yourRating')}
          </label>
          <StarSelector value={rating} onChange={setRating} />
        </div>

        {/* Text area */}
        <div className="mb-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('reviewPlaceholder')}
            rows={4}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="mb-3 text-sm text-destructive">{error}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || isSubmitting}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <svg className="animate-spin w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            t('submit')
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
  const t = useTranslations('Reviews');
  const user = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [canReviewReason, setCanReviewReason] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [feedback, setFeedback] = useState('');
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
        const res = await apiFetch<PaginatedReviews>(
          `/v1/reviews/products/${productId}?page=${p}&limit=10&sort=newest`,
        );
        setReviews(res.data.data);
        setTotalPages(Math.ceil(res.data.meta.total / res.data.meta.limit) || 1);
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
      const res = await apiFetch<{ canReview: boolean; reason?: string }>(
        `/v1/reviews/products/${productId}/can-review`,
      );
      setCanReview(res.data.canReview);
      setCanReviewReason(res.data.reason || '');
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
    setFeedback(t('reviewSubmitted'));
    setTimeout(() => setFeedback(''), 3000);
    // Refresh data
    await Promise.all([fetchStats(), fetchReviews(1), fetchMyReview(), checkCanReview()]);
    setPage(1);
  }

  async function handleDeleteReview(reviewId: string) {
    try {
      await apiFetch(`/v1/reviews/${reviewId}`, { method: 'DELETE' });
      setFeedback(t('reviewDeleted'));
      setTimeout(() => setFeedback(''), 3000);
      setConfirmDeleteId(null);
      // Refresh data
      await Promise.all([fetchStats(), fetchReviews(1), fetchMyReview(), checkCanReview()]);
      setPage(1);
    } catch {
      // delete failed
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
    const parts = [review.user.firstName, review.user.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Utilisateur';
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
        {t('title')}
      </h2>

      {/* Feedback banner */}
      {feedback && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
              {stats.totalReviews} {stats.totalReviews === 1 ? t('star') : t('stars')}
            </span>
          </div>

          {/* Distribution */}
          <div className="flex-1 max-w-sm">
            <RatingDistribution distribution={stats.distribution} total={stats.totalReviews} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-4">{t('noReviews')}</p>
      )}

      {/* Write review button or status */}
      {user && (
        <div className="mb-6">
          {myReview ? (
            <p className="text-sm text-muted-foreground">{t('alreadyReviewed')}</p>
          ) : canReview ? (
            <button
              onClick={() => setShowModal(true)}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t('writeReview')}
            </button>
          ) : canReviewReason === 'already_reviewed' ? (
            <p className="text-sm text-muted-foreground">{t('alreadyReviewed')}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('mustDelivered')}</p>
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
                  {t('verifiedBuyer')}
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
                    {t('deleteReview')}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(myReview.id)}
                  className="text-xs text-destructive hover:underline"
                >
                  {t('deleteReview')}
                </button>
              )}
            </div>
          </div>
          {myReview.text && (
            <p className="text-sm text-foreground mt-2">{myReview.text}</p>
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
                    {t('verifiedBuyer')}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <StarRating rating={review.rating} size="sm" />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
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

      {/* Review modal */}
      {showModal && (
        <ReviewModal
          productId={productId}
          onClose={() => setShowModal(false)}
          onSubmitted={handleReviewSubmitted}
        />
      )}
    </div>
  );
}
