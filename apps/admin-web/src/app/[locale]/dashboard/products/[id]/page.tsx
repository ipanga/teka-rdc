'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api-client';

interface ProductImage {
  id: string;
  url: string;
  isCover: boolean;
  sortOrder: number;
}

interface ProductSpecification {
  id: string;
  name: string;
  value: string;
}

interface ProductDetail {
  id: string;
  title: string;
  description: string;
  priceCDF: number;
  priceUSD?: number | null;
  stock: number;
  condition: string;
  status: string;
  rejectionReason?: string | null;
  createdAt: string;
  images: ProductImage[];
  specifications: ProductSpecification[];
  seller?: {
    id: string;
    businessName: string;
    user?: {
      firstName?: string | null;
      lastName?: string | null;
      phone: string;
    };
  };
  category?: {
    id: string;
    name: string;
    parent?: {
      id: string;
      name: string;
    } | null;
  };
}

export default function ProductDetailPage() {
  const t = useTranslations('Moderation');
  const tCommon = useTranslations('Common');
  const params = useParams();
  const productId = params.id as string;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Rejection state
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchProduct = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<ProductDetail>(`/v1/admin/products/${productId}`);
      setProduct(res.data);
      // Set initial selected image
      const cover = res.data.images?.find((img) => img.isCover);
      setSelectedImage(cover?.url || res.data.images?.[0]?.url || null);
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const handleApprove = async () => {
    if (!product) return;

    setIsSubmitting(true);
    try {
      await apiFetch(`/v1/admin/products/${product.id}/approve`, { method: 'PATCH' });
      showFeedback('success', t('approved'));
      fetchProduct();
    } catch {
      showFeedback('error', 'Erreur');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!product || rejectionReason.trim().length < 5) return;

    setIsSubmitting(true);
    try {
      await apiFetch(`/v1/admin/products/${product.id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      showFeedback('success', t('rejected'));
      setShowRejectForm(false);
      setRejectionReason('');
      fetchProduct();
    } catch {
      showFeedback('error', 'Erreur');
    } finally {
      setIsSubmitting(false);
    }
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

  const getOptimizedUrl = (url: string, width: number) => {
    return url.replace('/upload/', `/upload/w_${width},c_limit,f_auto/`);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Produit introuvable</p>
        <Link
          href="/dashboard/products"
          className="text-primary hover:underline text-sm mt-2 inline-block"
        >
          {t('backToList')}
        </Link>
      </div>
    );
  }

  const categoryBreadcrumb = product.category
    ? product.category.parent
      ? `${product.category.parent.name} > ${product.category.name}`
      : product.category.name
    : '-';

  const isPending = product.status === 'PENDING_REVIEW';

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

      {/* Back link */}
      <Link
        href="/dashboard/products"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t('backToList')}
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('productDetail')}</h1>
        <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Images */}
        <div className="bg-white rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t('images')}
          </h2>

          {/* Main image */}
          <div className="aspect-square bg-muted rounded-lg overflow-hidden mb-3">
            {selectedImage ? (
              <img
                src={getOptimizedUrl(selectedImage, 600)}
                alt={product.title}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-16 h-16 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.images
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(img.url)}
                    className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-colors ${
                      selectedImage === img.url
                        ? 'border-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <img
                      src={getOptimizedUrl(img.url, 80)}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Right: Product Info */}
        <div className="space-y-4">
          {/* Title & Price */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h2 className="text-xl font-bold text-foreground mb-3">{product.title}</h2>
            <p className="text-2xl font-bold text-primary">
              {formatPrice(product.priceCDF, product.priceUSD)}
            </p>
            <div className="flex gap-4 mt-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('condition')}: </span>
                <span className="font-medium text-foreground">
                  {product.condition === 'NEW' ? t('condition_NEW') : t('condition_USED')}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('stock')}: </span>
                <span className="font-medium text-foreground">{product.stock}</span>
              </div>
            </div>
            <div className="mt-2 text-sm">
              <span className="text-muted-foreground">{t('category')}: </span>
              <span className="font-medium text-foreground">{categoryBreadcrumb}</span>
            </div>
            <div className="mt-2 text-sm">
              <span className="text-muted-foreground">{t('date')}: </span>
              <span className="text-foreground">
                {new Date(product.createdAt).toLocaleDateString('fr-CD', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {t('description')}
            </h3>
            <div className="text-sm text-foreground whitespace-pre-wrap">
              {product.description || '-'}
            </div>
          </div>

          {/* Specifications */}
          {product.specifications && product.specifications.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t('specifications')}
              </h3>
              <div className="space-y-1">
                {product.specifications.map((spec) => (
                  <div key={spec.id} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                    <span className="text-muted-foreground">{spec.name}</span>
                    <span className="text-foreground font-medium">{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seller Info */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {t('sellerInfo')}
            </h3>
            {product.seller ? (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('seller')}</span>
                  <span className="text-foreground font-medium">{product.seller.businessName}</span>
                </div>
                {product.seller.user && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contact</span>
                      <span className="text-foreground">
                        {product.seller.user.firstName} {product.seller.user.lastName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Téléphone</span>
                      <span className="text-foreground">{product.seller.user.phone}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">-</p>
            )}
          </div>

          {/* Rejection Reason (if already rejected) */}
          {product.status === 'REJECTED' && product.rejectionReason && (
            <div className="bg-destructive/5 rounded-xl border border-destructive/20 p-4">
              <h3 className="text-sm font-semibold text-destructive mb-1">{t('rejectionReason')}</h3>
              <p className="text-sm text-foreground">{product.rejectionReason}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons (only for pending products) */}
      {isPending && (
        <div className="mt-6 bg-white rounded-xl border border-border p-4">
          {!showRejectForm ? (
            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-medium text-white bg-success rounded-lg hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? tCommon('loading') : t('approve')}
              </button>
              <button
                onClick={() => setShowRejectForm(true)}
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-medium text-white bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('reject')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">
                {t('rejectionReason')} <span className="text-destructive">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                placeholder={t('rejectionPlaceholder')}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              {rejectionReason.trim().length > 0 && rejectionReason.trim().length < 5 && (
                <p className="text-xs text-destructive">Minimum 5 caractères</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleReject}
                  disabled={isSubmitting || rejectionReason.trim().length < 5}
                  className="px-6 py-2.5 text-sm font-medium text-white bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? tCommon('loading') : t('reject')}
                </button>
                <button
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectionReason('');
                  }}
                  className="px-6 py-2.5 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
