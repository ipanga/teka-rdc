'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api-client';
import type { SellerWallet, SellerProduct } from '@/lib/types';

interface ProductStats {
  total: number;
  active: number;
  pending: number;
  draft: number;
}

interface ProductsResponse {
  products: SellerProduct[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function SellerDashboardPage() {
  const t = useTranslations('Dashboard');
  const tEarnings = useTranslations('Earnings');
  const tReviews = useTranslations('Reviews');
  const tMessaging = useTranslations('Messaging');
  const [stats, setStats] = useState<ProductStats>({ total: 0, active: 0, pending: 0, draft: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [wallet, setWallet] = useState<SellerWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [reviewStats, setReviewStats] = useState<{ averageRating: number; totalReviews: number }>({
    averageRating: 0,
    totalReviews: 0,
  });
  const [reviewStatsLoading, setReviewStatsLoading] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const formatPrice = (centimes: string) => {
    const amount = Number(centimes) / 100;
    return new Intl.NumberFormat('fr-CD', {
      style: 'currency',
      currency: 'CDF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  useEffect(() => {
    async function loadStats() {
      try {
        const [allRes, activeRes, pendingRes, draftRes] = await Promise.allSettled([
          apiFetch<{ meta?: { total?: number } }>('/v1/sellers/products?page=1&limit=1'),
          apiFetch<{ meta?: { total?: number } }>('/v1/sellers/products?page=1&limit=1&status=ACTIVE'),
          apiFetch<{ meta?: { total?: number } }>('/v1/sellers/products?page=1&limit=1&status=PENDING_REVIEW'),
          apiFetch<{ meta?: { total?: number } }>('/v1/sellers/products?page=1&limit=1&status=DRAFT'),
        ]);

        setStats({
          total: allRes.status === 'fulfilled' ? (allRes.value.data.meta?.total ?? 0) : 0,
          active: activeRes.status === 'fulfilled' ? (activeRes.value.data.meta?.total ?? 0) : 0,
          pending: pendingRes.status === 'fulfilled' ? (pendingRes.value.data.meta?.total ?? 0) : 0,
          draft: draftRes.status === 'fulfilled' ? (draftRes.value.data.meta?.total ?? 0) : 0,
        });
      } catch {
        // Stats stay at 0
      } finally {
        setIsLoading(false);
      }
    }

    async function loadWallet() {
      try {
        const res = await apiFetch<SellerWallet>('/v1/sellers/wallet');
        setWallet(res.data);
      } catch {
        // Wallet stays null
      } finally {
        setWalletLoading(false);
      }
    }

    async function loadReviewStats() {
      try {
        const res = await apiFetch<ProductsResponse>('/v1/sellers/products?page=1&limit=100&status=ACTIVE');
        const prods = res.data.products || [];
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
        setReviewStats({
          averageRating: ratedCount > 0 ? ratingSum / ratedCount : 0,
          totalReviews,
        });
      } catch {
        // Review stats stay at 0
      } finally {
        setReviewStatsLoading(false);
      }
    }

    async function loadUnreadMessages() {
      try {
        const res = await apiFetch<{ count: number }>('/v1/messages/unread-count');
        setUnreadMessages(res.data?.count ?? (typeof res.data === 'number' ? (res.data as unknown as number) : 0));
      } catch {
        // Unread stays at 0
      }
    }

    loadStats();
    loadWallet();
    loadReviewStats();
    loadUnreadMessages();
  }, []);

  const renderStars = (rating: number) => {
    return (
      <span className="text-lg inline-flex gap-0.5">
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

  const statCards = [
    { label: t('totalProducts'), value: stats.total, color: 'text-foreground' },
    { label: t('activeProducts'), value: stats.active, color: 'text-success' },
    { label: t('pendingReview'), value: stats.pending, color: 'text-warning' },
    { label: t('drafts'), value: stats.draft, color: 'text-muted-foreground' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('welcome')}</h1>

      {/* Wallet balance card */}
      <div className="mb-6">
        <Link
          href="/dashboard/earnings"
          className="block bg-white rounded-xl border border-border p-5 hover:shadow-sm transition-shadow"
        >
          <h3 className="text-sm font-medium text-muted-foreground">{tEarnings('walletBalance')}</h3>
          <p className="text-3xl font-bold mt-2 text-primary">
            {walletLoading ? (
              <span className="inline-block w-24 h-8 bg-muted rounded animate-pulse" />
            ) : (
              formatPrice(wallet?.balanceCDF ?? '0')
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{tEarnings('title')}</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-medium text-muted-foreground">{card.label}</h3>
            <p className={`text-3xl font-bold mt-2 ${card.color}`}>
              {isLoading ? (
                <span className="inline-block w-10 h-8 bg-muted rounded animate-pulse" />
              ) : (
                card.value
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Reviews + Messages cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* Reviews stats card */}
        <Link
          href="/dashboard/reviews"
          className="block bg-white rounded-xl border border-border p-5 hover:shadow-sm transition-shadow"
        >
          <h3 className="text-sm font-medium text-muted-foreground">{tReviews('averageRating')}</h3>
          <div className="flex items-center gap-3 mt-2">
            {reviewStatsLoading ? (
              <span className="inline-block w-16 h-8 bg-muted rounded animate-pulse" />
            ) : (
              <>
                <span className="text-3xl font-bold text-foreground">
                  {reviewStats.averageRating.toFixed(1)}
                </span>
                {renderStars(reviewStats.averageRating)}
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {reviewStatsLoading ? (
              <span className="inline-block w-20 h-3 bg-muted rounded animate-pulse" />
            ) : (
              `${reviewStats.totalReviews} ${tReviews('totalReviews').toLowerCase()}`
            )}
          </p>
        </Link>

        {/* Messages card */}
        <Link
          href="/dashboard/messages"
          className="block bg-white rounded-xl border border-border p-5 hover:shadow-sm transition-shadow"
        >
          <h3 className="text-sm font-medium text-muted-foreground">{tMessaging('title')}</h3>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-3xl">{'\u2709'}</span>
            {unreadMessages > 0 && (
              <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {unreadMessages > 0
              ? `${unreadMessages} ${tMessaging('unread')}`
              : tMessaging('conversations')
            }
          </p>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">{t('quickActions')}</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/products/new"
            className="inline-flex items-center px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            + {t('newProduct')}
          </Link>
          <Link
            href="/dashboard/products"
            className="inline-flex items-center px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg font-medium text-sm hover:bg-secondary/80 transition-colors"
          >
            {t('viewAllProducts')}
          </Link>
          <Link
            href="/dashboard/earnings"
            className="inline-flex items-center px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg font-medium text-sm hover:bg-secondary/80 transition-colors"
          >
            {tEarnings('title')}
          </Link>
        </div>
      </div>
    </div>
  );
}
