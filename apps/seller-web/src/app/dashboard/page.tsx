'use client';

import { formatFC } from '@teka/shared';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import type { SellerWallet, SellerProduct } from '@/lib/types';

interface ProductStats {
  total: number;
  active: number;
  pending: number;
  draft: number;
}

interface OrderSummary {
  nouvelles: number;
  aPreparer: number;
  pretesPourCollecte: number;
  enLivraison: number;
  livrees: number;
  annulees: number;
  retours: number;
}

// Canonical paginated response shape across all admin/seller APIs.
// Used to be `{ products, meta }` here — that didn't match the API's
// `{ data, pagination }` envelope, so stats cards silently rendered 0.
interface ProductsResponse {
  data: SellerProduct[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function SellerDashboardPage() {
  const [stats, setStats] = useState<ProductStats>({ total: 0, active: 0, pending: 0, draft: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [wallet, setWallet] = useState<SellerWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [reviewStats, setReviewStats] = useState<{ averageRating: number; totalReviews: number }>({
    averageRating: 0,
    totalReviews: 0,
  });
  const [reviewStatsLoading, setReviewStatsLoading] = useState(true);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [orderSummaryLoading, setOrderSummaryLoading] = useState(true);

  const formatPrice = (centimes: string) => formatFC(centimes);

  useEffect(() => {
    async function loadStats() {
      try {
        // Single server-computed grouped count (replaces 4 paginated calls).
        const res = await apiFetch<{
          total: number;
          active: number;
          pendingReview: number;
          draft: number;
        }>('/v1/sellers/products/stats');
        setStats({
          total: res.data.total ?? 0,
          active: res.data.active ?? 0,
          pending: res.data.pendingReview ?? 0,
          draft: res.data.draft ?? 0,
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
        const prods = res.data.data || [];
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

    async function loadOrderSummary() {
      try {
        const res = await apiFetch<{ summary: OrderSummary }>('/v1/sellers/orders/stats');
        setOrderSummary(res.data.summary);
      } catch {
        // Order summary stays null
      } finally {
        setOrderSummaryLoading(false);
      }
    }

    loadStats();
    loadWallet();
    loadReviewStats();
    loadOrderSummary();
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
    { label: "Total produits", value: stats.total, color: 'text-foreground' },
    { label: "Produits actifs", value: stats.active, color: 'text-success' },
    { label: "En attente de validation", value: stats.pending, color: 'text-warning' },
    { label: "Brouillons", value: stats.draft, color: 'text-muted-foreground' },
  ];

  const pendingOrdersLabel = stats.pending > 0
    ? `${stats.pending} produit${stats.pending > 1 ? 's' : ''} en validation`
    : 'Catalogue prêt à vendre';

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-primary/15 bg-gradient-to-br from-primary to-[#8f0b21] p-5 sm:p-6 text-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-white/75">{"Espace Vendeur"}</p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold">
              {"Pilotez vos ventes Teka RDC"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base text-white/80">
              {"Suivez vos produits, commandes, revenus et avis depuis un tableau de bord unique."}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard/products/new"
              className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-white/90"
            >
              + Nouveau produit
            </Link>
            <Link
              href="/dashboard/orders"
              className="inline-flex items-center justify-center rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/15"
            >
              Voir les commandes
            </Link>
          </div>
        </div>
      </section>

      {/* Wallet balance card */}
      <div>
        <Link
          href="/dashboard/earnings"
          className="block rounded-lg border border-border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Solde disponible</h3>
              <p className="text-3xl font-bold mt-2 text-primary">
                {walletLoading ? (
                  <span className="inline-block w-24 h-8 bg-muted rounded animate-pulse" />
                ) : (
                  formatPrice(wallet?.balanceCDF ?? '0')
                )}
              </p>
            </div>
            <div className="inline-flex w-fit items-center rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
              {pendingOrdersLabel}
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-border bg-white p-5 shadow-sm">
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

      {/* Order status summary */}
      <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Commandes</h2>
          <Link href="/dashboard/orders" className="text-sm font-medium text-primary hover:underline">
            Voir tout
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
          {([
            { label: 'Nouvelles', value: orderSummary?.nouvelles ?? 0, color: 'text-warning' },
            { label: 'À préparer', value: orderSummary?.aPreparer ?? 0, color: 'text-blue-700' },
            { label: 'Prêtes pour collecte', value: orderSummary?.pretesPourCollecte ?? 0, color: 'text-indigo-700' },
            { label: 'En livraison', value: orderSummary?.enLivraison ?? 0, color: 'text-indigo-700' },
            { label: 'Livrées', value: orderSummary?.livrees ?? 0, color: 'text-success' },
            { label: 'Annulées / rejetées', value: orderSummary?.annulees ?? 0, color: 'text-destructive' },
            { label: 'Retours', value: orderSummary?.retours ?? 0, color: 'text-muted-foreground' },
          ]).map((card) => (
            <Link
              key={card.label}
              href="/dashboard/orders"
              className="rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
            >
              <p className={`text-2xl font-bold ${card.color}`}>
                {orderSummaryLoading ? (
                  <span className="inline-block w-8 h-7 bg-muted rounded animate-pulse" />
                ) : (
                  card.value
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-tight">{card.label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Reviews stats */}
      <div>
        <Link
          href="/dashboard/reviews"
          className="block rounded-lg border border-border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <h3 className="text-sm font-medium text-muted-foreground">Note moyenne</h3>
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
              `${reviewStats.totalReviews} ${"Total des avis".toLowerCase()}`
            )}
          </p>
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">Actions rapides</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/products/new"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            + Nouveau produit
          </Link>
          <Link
            href="/dashboard/products"
            className="inline-flex items-center rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Voir tous les produits
          </Link>
          <Link
            href="/dashboard/earnings"
            className="inline-flex items-center rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Revenus
          </Link>
        </div>
      </div>
    </div>
  );
}
