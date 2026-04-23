'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface ReviewBuyer {
  firstName: string;
  lastName: string;
}

interface ReviewProduct {
  title: {
    fr: string;
    en: string;
  };
}

interface Review {
  id: string;
  productId: string;
  buyerId: string;
  orderId: string;
  rating: number;
  text: string;
  status: string;
  createdAt: string;
  buyer: ReviewBuyer;
  product: ReviewProduct;
}

interface PaginatedResponse {
  data: Review[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const STATUS_TABS = ['', 'ACTIVE', 'HIDDEN'];

const STATUS_TAB_KEYS: Record<string, string> = {
  '': 'allReviews',
  ACTIVE: 'activeReviews',
  HIDDEN: 'hiddenReviews',
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-success/10 text-success',
  HIDDEN: 'bg-warning/10 text-warning',
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'text-amber-400' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const t = useTranslations('Reviews');
  const tCommon = useTranslations('Common');

  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  // Delete modal
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Action loading
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedbackMessage = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/reviews?${params}`);
      const rd = res.data;
      if (Array.isArray(rd)) { setReviews(rd); setTotalPages(1); }
      else { setReviews(rd.data); setTotalPages(rd.pagination?.totalPages ?? 1); }
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleHide = async (reviewId: string) => {
    setActionLoadingId(reviewId);
    try {
      await apiFetch(`/v1/admin/reviews/${reviewId}/hide`, { method: 'POST' });
      showFeedbackMessage('success', t('reviewHidden'));
      fetchReviews();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnhide = async (reviewId: string) => {
    setActionLoadingId(reviewId);
    try {
      await apiFetch(`/v1/admin/reviews/${reviewId}/unhide`, { method: 'POST' });
      showFeedbackMessage('success', t('reviewUnhidden'));
      fetchReviews();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await apiFetch(`/v1/admin/reviews/${deletingId}`, { method: 'DELETE' });
      setDeletingId(null);
      showFeedbackMessage('success', t('reviewDeleted'));
      fetchReviews();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setIsDeleting(false);
    }
  };

  const truncateText = (text: string, maxLength: number = 80) => {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  return (
    <div className="p-8">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_TABS.map((status) => (
          <button
            key={status}
            onClick={() => {
              setStatusFilter(status);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === status
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-muted'
            }`}
          >
            {t(STATUS_TAB_KEYS[status])}
          </button>
        ))}
      </div>

      {/* Reviews table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('date')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('product')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('buyer')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('rating')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('text')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('status')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {tCommon('loading')}
                </td>
              </tr>
            ) : reviews.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {t('noReviews')}
                </td>
              </tr>
            ) : (
              reviews.map((review) => (
                <tr key={review.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(review.createdAt).toLocaleDateString('fr-CD')}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground max-w-[200px] truncate">
                    {review.product?.title?.fr || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                    {review.buyer
                      ? `${review.buyer.firstName} ${review.buyer.lastName}`
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StarRating rating={review.rating} />
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground max-w-[250px]">
                    <span title={review.text}>{truncateText(review.text)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_STYLES[review.status] || 'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      {review.status === 'ACTIVE' ? t('active') : t('hidden')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {review.status === 'ACTIVE' ? (
                        <button
                          onClick={() => handleHide(review.id)}
                          disabled={actionLoadingId === review.id}
                          className="px-2.5 py-1 text-xs font-medium bg-warning/10 text-warning rounded-lg hover:bg-warning/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionLoadingId === review.id ? tCommon('loading') : t('hide')}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUnhide(review.id)}
                          disabled={actionLoadingId === review.id}
                          className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionLoadingId === review.id ? tCommon('loading') : t('unhide')}
                        </button>
                      )}
                      <button
                        onClick={() => setDeletingId(review.id)}
                        disabled={actionLoadingId === review.id}
                        className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tCommon('previous')}
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tCommon('next')}
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeletingId(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('delete')}</h3>
              <p className="text-sm text-muted-foreground mb-4">{t('confirmDelete')}</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletingId(null)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? tCommon('loading') : tCommon('confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
