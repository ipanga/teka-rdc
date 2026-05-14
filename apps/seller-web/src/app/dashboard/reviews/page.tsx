'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { Review, ReviewStats, SellerProduct } from '@/lib/types';

interface ProductsResponse {
  products: SellerProduct[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface ReviewsResponse {
  reviews: Review[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function ReviewsPage() {
  const t = useTranslations('Reviews');
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsTotalPages, setReviewsTotalPages] = useState(1);

  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [error, setError] = useState('');

  // Aggregate stats across all products (when no product selected)
  const [aggregateStats, setAggregateStats] = useState<{
    averageRating: number;
    totalReviews: number;
  }>({ averageRating: 0, totalReviews: 0 });

  const getProductTitle = (product: { title: string }) => {
    return product.title || '';
  };

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat('fr-CD', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
  };

  // Load seller products
  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await apiFetch<ProductsResponse>('/v1/sellers/products?page=1&limit=100&status=ACTIVE');
      const prods = res.data.products || [];
      setProducts(prods);

      // Calculate aggregate stats from products
      let totalReviews = 0;
      let ratingSum = 0;
      let ratedCount = 0;
      for (const p of prods) {
        const rc = p.reviewCount ?? 0;
        const ar = p.averageRating ?? 0;
        totalReviews += rc;
        if (rc > 0) {
          ratingSum += ar * rc;
          ratedCount += rc;
        }
      }
      setAggregateStats({
        averageRating: ratedCount > 0 ? ratingSum / ratedCount : 0,
        totalReviews,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(t('errorLoadingProducts'));
      }
    } finally {
      setProductsLoading(false);
    }
  }, [t]);

  // Load reviews for a specific product
  const loadReviews = useCallback(async (productId: string) => {
    if (!productId) {
      setReviews([]);
      setStats(null);
      return;
    }
    setReviewsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(reviewsPage),
        limit: '20',
      });
      const [reviewsRes, statsRes] = await Promise.allSettled([
        apiFetch<ReviewsResponse>(`/v1/reviews/products/${productId}?${params}`),
        apiFetch<ReviewStats>(`/v1/reviews/products/${productId}/stats`),
      ]);

      if (reviewsRes.status === 'fulfilled') {
        setReviews(reviewsRes.value.data.reviews || []);
        setReviewsTotalPages(reviewsRes.value.data.meta?.totalPages ?? 1);
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setReviewsLoading(false);
    }
  }, [reviewsPage]);

  // Load all reviews across products (first few products)
  const loadAllReviews = useCallback(async () => {
    if (products.length === 0) return;
    setReviewsLoading(true);
    setError('');
    setStats(null);
    try {
      // Fetch reviews from first few products that likely have reviews
      const productIds = products.slice(0, 10).map((p) => p.id);
      const promises = productIds.map((pid) =>
        apiFetch<ReviewsResponse>(`/v1/reviews/products/${pid}?page=1&limit=5`).catch(() => null)
      );
      const results = await Promise.all(promises);

      const allReviews: Review[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result?.data?.reviews) {
          const reviewsWithProduct = result.data.reviews.map((r: Review) => ({
            ...r,
            product: r.product || { id: productIds[i], title: products[i].title },
          }));
          allReviews.push(...reviewsWithProduct);
        }
      }

      // Sort by date desc
      allReviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReviews(allReviews.slice(0, 20));
      setReviewsTotalPages(1);
    } catch {
      setError(t('errorLoading'));
    } finally {
      setReviewsLoading(false);
    }
  }, [products, t]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (selectedProductId) {
      loadReviews(selectedProductId);
    } else if (!productsLoading && products.length > 0) {
      loadAllReviews();
    }
  }, [selectedProductId, reviewsPage, productsLoading, products.length, loadReviews, loadAllReviews]);

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    setReviewsPage(1);
  };

  const renderStars = (rating: number, size: 'sm' | 'lg' = 'sm') => {
    const sizeClass = size === 'lg' ? 'text-2xl' : 'text-base';
    return (
      <span className={`${sizeClass} inline-flex gap-0.5`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={star <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-200'}
          >
            {'\u2605'}
          </span>
        ))}
      </span>
    );
  };

  const displayedAvgRating = stats?.averageRating ?? aggregateStats.averageRating;
  const displayedTotalReviews = stats?.totalReviews ?? aggregateStats.totalReviews;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-muted-foreground">{t('averageRating')}</h3>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-3xl font-bold text-foreground">
              {productsLoading || statsLoading ? (
                <span className="inline-block w-12 h-8 bg-muted rounded animate-pulse" />
              ) : (
                displayedAvgRating.toFixed(1)
              )}
            </p>
            {!productsLoading && !statsLoading && (
              <div className="flex flex-col">
                {renderStars(displayedAvgRating, 'lg')}
                <span className="text-xs text-muted-foreground mt-0.5">
                  {t('outOf5')}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-muted-foreground">{t('totalReviews')}</h3>
          <p className="text-3xl font-bold mt-2 text-foreground">
            {productsLoading || statsLoading ? (
              <span className="inline-block w-12 h-8 bg-muted rounded animate-pulse" />
            ) : (
              displayedTotalReviews
            )}
          </p>
        </div>
      </div>

      {/* Product filter */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-foreground mb-1">
          {t('filterByProduct')}
        </label>
        <select
          value={selectedProductId}
          onChange={(e) => handleProductChange(e.target.value)}
          disabled={productsLoading}
          className="w-full sm:w-80 rounded-lg border border-border px-3 py-2 text-sm text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
        >
          <option value="">{t('allProducts')}</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {getProductTitle(product)} {product.reviewCount ? `(${product.reviewCount})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Rating distribution (only when a specific product is selected) */}
      {selectedProductId && stats && stats.distribution && (
        <div className="bg-white rounded-xl border border-border p-5 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('distribution')}</h3>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.distribution[star as keyof typeof stats.distribution] || 0;
              const total = stats.totalReviews || 1;
              const percentage = (count / total) * 100;
              return (
                <div key={star} className="flex items-center gap-3">
                  <span className="text-sm text-foreground w-12 text-right">
                    {star} {star === 1 ? t('star') : t('stars')}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-yellow-400 h-full rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-8">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reviews list */}
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-foreground">
          {selectedProductId ? t('recentReviews') : t('recentReviews')}
        </h2>
      </div>

      {reviewsLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-border p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <div className="text-4xl text-muted-foreground/40 mb-3">{'\u2605'}</div>
          <p className="text-muted-foreground font-medium">{t('noReviews')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('noReviewsDesc')}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="bg-white rounded-xl border border-border p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground">
                        {review.buyer?.firstName} {review.buyer?.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                        {t('verifiedBuyer')}
                      </span>
                    </div>
                    {review.product && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t('product')}: {getProductTitle(review.product)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {renderStars(review.rating)}
                      <span className="text-xs text-muted-foreground">
                        {review.rating}/5
                      </span>
                    </div>
                    {review.comment && (
                      <p className="text-sm text-foreground mt-2 leading-relaxed">
                        {review.comment}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination (only for single product view) */}
          {selectedProductId && reviewsTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setReviewsPage((p) => Math.max(1, p - 1))}
                disabled={reviewsPage <= 1}
                className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {'\u2190'}
              </button>
              <span className="text-sm text-muted-foreground">
                {reviewsPage} / {reviewsTotalPages}
              </span>
              <button
                onClick={() => setReviewsPage((p) => Math.min(reviewsTotalPages, p + 1))}
                disabled={reviewsPage >= reviewsTotalPages}
                className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {'\u2192'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
