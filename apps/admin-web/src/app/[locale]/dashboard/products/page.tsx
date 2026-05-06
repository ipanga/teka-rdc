'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api-client';

interface ProductImage {
  id: string;
  url: string;
  isCover: boolean;
}

interface Product {
  id: string;
  title: string;
  priceCDF: number;
  priceUSD?: number | null;
  status: string;
  condition: string;
  createdAt: string;
  images: ProductImage[];
  seller?: {
    id: string;
    businessName: string;
    user?: {
      firstName?: string | null;
      lastName?: string | null;
    };
  };
  category?: {
    id: string;
    name: string;
  };
}

interface PaginatedResponse {
  data: Product[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function ProductModerationPage() {
  const t = useTranslations('Moderation');
  const tCommon = useTranslations('Common');

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Rejection modal state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/products?${params}`);
      const rd = res.data;
      if (Array.isArray(rd)) { setProducts(rd); setTotalPages(1); }
      else { setProducts(rd.data); setTotalPages(rd.meta?.totalPages ?? 1); }
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleApprove = async (productId: string) => {
    try {
      await apiFetch(`/v1/admin/products/${productId}/approve`, { method: 'PATCH' });
      showFeedback('success', t('approved'));
      fetchProducts();
    } catch {
      showFeedback('error', 'Erreur');
    }
  };

  const handleReject = async () => {
    if (!rejectingId || rejectionReason.trim().length < 5) return;

    setIsSubmitting(true);
    try {
      await apiFetch(`/v1/admin/products/${rejectingId}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      showFeedback('success', t('rejected'));
      setRejectingId(null);
      setRejectionReason('');
      fetchProducts();
    } catch {
      showFeedback('error', 'Erreur');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCoverImage = (product: Product): string | null => {
    const cover = product.images?.find((img) => img.isCover);
    const url = cover?.url || product.images?.[0]?.url;
    if (!url) return null;
    // Cloudinary thumbnail optimization
    return url.replace('/upload/', '/upload/w_80,h_80,c_fill,f_auto/');
  };

  const formatPrice = (cdf: number, usd?: number | null) => {
    const cdfFormatted = new Intl.NumberFormat('fr-CD', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cdf / 100);

    if (usd) {
      const usdFormatted = new Intl.NumberFormat('fr-CD', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(usd / 100);
      return `${cdfFormatted} CDF / ${usdFormatted} USD`;
    }
    return `${cdfFormatted} CDF`;
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
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('pendingProducts')}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('thumbnail')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('product')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('seller')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('price')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('date')}
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
                  {t('loading')}
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {t('noProducts')}
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const coverUrl = getCoverImage(product);
                return (
                  <tr
                    key={product.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={product.title}
                          className="w-10 h-10 rounded-lg object-cover bg-muted"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                        {product.title}
                      </p>
                      {product.category && (
                        <p className="text-xs text-muted-foreground">{product.category.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {product.seller?.businessName || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                      {formatPrice(product.priceCDF, product.priceUSD)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(product.createdAt).toLocaleDateString('fr-CD')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        product.status === 'APPROVED'
                          ? 'bg-success/10 text-success'
                          : product.status === 'REJECTED'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-warning/10 text-warning'
                      }`}>
                        {product.status === 'APPROVED'
                          ? t('status_approved')
                          : product.status === 'REJECTED'
                            ? t('status_rejected')
                            : t('status_pending')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/dashboard/products/${product.id}`}
                          className="px-2.5 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                          {t('view')}
                        </Link>
                        {product.status === 'PENDING_REVIEW' && (
                          <>
                            <button
                              onClick={() => handleApprove(product.id)}
                              className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                            >
                              {t('approve')}
                            </button>
                            <button
                              onClick={() => {
                                setRejectingId(product.id);
                                setRejectionReason('');
                              }}
                              className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                            >
                              {t('reject')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
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
            {t('previous')}
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('next')}
          </button>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRejectingId(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">{t('reject')}</h3>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {t('rejectionReason')} <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                  placeholder={t('rejectionPlaceholder')}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                {rejectionReason.trim().length > 0 && rejectionReason.trim().length < 5 && (
                  <p className="text-xs text-destructive mt-1">Minimum 5 caractères</p>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => {
                    setRejectingId(null);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleReject}
                  disabled={isSubmitting || rejectionReason.trim().length < 5}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '...' : t('reject')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
