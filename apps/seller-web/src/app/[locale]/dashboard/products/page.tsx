'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ProductStatusBadge } from '@/components/product/product-status-badge';

interface ProductImage {
  id: string;
  url: string;
  order: number;
}

interface Product {
  id: string;
  title: { fr?: string; en?: string };
  priceCDF: string;
  priceUSD?: string | null;
  quantity: number;
  status: string;
  condition: string;
  images: ProductImage[];
  createdAt: string;
}

interface ProductsResponse {
  products: Product[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

type StatusFilter = '' | 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'ARCHIVED';

const LIMIT = 20;

export default function ProductsListPage() {
  const t = useTranslations('Products');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (statusFilter) {
        params.set('status', statusFilter);
      }
      const res = await apiFetch<ProductsResponse>(`/v1/sellers/products?${params}`);
      setProducts(res.data.products || []);
      setTotalPages(res.data.meta?.totalPages ?? 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('errorLoadingProducts'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, t]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleFilterChange = (newFilter: StatusFilter) => {
    setStatusFilter(newFilter);
    setPage(1);
  };

  const handleArchive = async (productId: string) => {
    if (!confirm(t('confirmArchive'))) return;
    setArchivingId(productId);
    try {
      await apiFetch(`/v1/sellers/products/${productId}`, { method: 'DELETE' });
      loadProducts();
    } catch {
      // ignore
    } finally {
      setArchivingId(null);
    }
  };

  const handleSubmit = async (productId: string) => {
    setSubmittingId(productId);
    try {
      await apiFetch(`/v1/sellers/products/${productId}/submit`, { method: 'PATCH' });
      loadProducts();
    } catch {
      // ignore
    } finally {
      setSubmittingId(null);
    }
  };

  const formatPrice = (centimes: string) => {
    const amount = Number(centimes) / 100;
    return new Intl.NumberFormat('fr-CD', {
      style: 'currency',
      currency: 'CDF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat('fr-CD', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
  };

  const getProductTitle = (product: Product) => {
    return product.title?.fr || product.title?.en || '---';
  };

  const getThumbUrl = (product: Product) => {
    if (!product.images || product.images.length === 0) return null;
    const sorted = [...product.images].sort((a, b) => a.order - b.order);
    const url = sorted[0].url;
    return url.replace('/upload/', '/upload/w_80,h_80,c_fill/');
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: '', label: t('filterAll') },
    { key: 'DRAFT', label: t('filterDraft') },
    { key: 'PENDING_REVIEW', label: t('filterPending') },
    { key: 'ACTIVE', label: t('filterActive') },
    { key: 'REJECTED', label: t('filterRejected') },
    { key: 'ARCHIVED', label: t('filterArchived') },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <Link
          href="/dashboard/products/new"
          className="inline-flex items-center px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
        >
          + {t('newProduct')}
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-border">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === f.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-border p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-muted rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground mb-2">{t('noProducts')}</p>
          <p className="text-sm text-muted-foreground mb-6">{t('noProductsHint')}</p>
          <Link
            href="/dashboard/products/new"
            className="inline-flex items-center px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            + {t('newProduct')}
          </Link>
        </div>
      ) : (
        <>
          {/* Product table */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground w-16" />
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('name')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('price')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('status')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('date')}</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const thumbUrl = getThumbUrl(product);
                    const isEditable = product.status === 'DRAFT' || product.status === 'REJECTED';
                    const isSubmittable = product.status === 'DRAFT';
                    const isArchivable = product.status !== 'ARCHIVED';

                    return (
                      <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt=""
                              className="w-10 h-10 rounded object-cover bg-muted"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
                              --
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-foreground">{getProductTitle(product)}</span>
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {formatPrice(product.priceCDF)}
                        </td>
                        <td className="px-4 py-3">
                          <ProductStatusBadge status={product.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(product.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/dashboard/products/${product.id}`}
                              className="px-2.5 py-1 text-xs font-medium rounded border border-border text-foreground hover:bg-muted transition-colors"
                            >
                              {isEditable ? t('edit') : t('view')}
                            </Link>
                            {isSubmittable && (
                              <button
                                onClick={() => handleSubmit(product.id)}
                                disabled={submittingId === product.id}
                                className="px-2.5 py-1 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                              >
                                {submittingId === product.id ? '...' : t('submit')}
                              </button>
                            )}
                            {isArchivable && (
                              <button
                                onClick={() => handleArchive(product.id)}
                                disabled={archivingId === product.id}
                                className="px-2.5 py-1 text-xs font-medium rounded border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                              >
                                {archivingId === product.id ? '...' : t('archive')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('previousPage')}
              </button>
              <span className="text-sm text-muted-foreground">
                {t('pageOf', { page, total: totalPages })}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('nextPage')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
