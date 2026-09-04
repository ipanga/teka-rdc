'use client';

import { formatFC } from '@teka/shared';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import type { SellerProduct, SellerWallet } from '@/lib/types';
import { Icon, type IconName } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/page-header';

interface ProductStats {
  total: number;
  active: number;
  pendingReview: number;
  draft: number;
  rejected: number;
}

interface OrderStats {
  byStatus: Record<string, number | undefined>;
  summary: {
    nouvelles: number;
    aPreparer: number;
    pretesPourCollecte: number;
    enLivraison: number;
    livrees: number;
    annulees: number;
    retours: number;
  };
}

interface ProductsResponse {
  data: SellerProduct[];
}

function LoadingValue({ wide = false }: { wide?: boolean }) {
  return <span className={`inline-block h-8 animate-pulse rounded bg-muted ${wide ? 'w-32' : 'w-12'}`} />;
}

function InlineError({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
      <span>Impossible de charger ces données.</span>
      <button type="button" onClick={retry} className="font-semibold underline underline-offset-4">
        Réessayer
      </button>
    </div>
  );
}

export default function SellerDashboardPage() {
  const [productStats, setProductStats] = useState<ProductStats | null>(null);
  const [productError, setProductError] = useState(false);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [orderError, setOrderError] = useState(false);
  const [wallet, setWallet] = useState<SellerWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [reviewStats, setReviewStats] = useState({ averageRating: 0, totalReviews: 0 });
  const [reviewStatsLoading, setReviewStatsLoading] = useState(true);

  const loadProductStats = useCallback(async () => {
    setProductError(false);
    try {
      const response = await apiFetch<ProductStats>('/v1/sellers/products/stats');
      setProductStats(response.data);
    } catch {
      setProductError(true);
    }
  }, []);

  const loadOrderStats = useCallback(async () => {
    setOrderError(false);
    try {
      const response = await apiFetch<OrderStats>('/v1/sellers/orders/stats');
      setOrderStats(response.data);
    } catch {
      setOrderError(true);
    }
  }, []);

  useEffect(() => {
    loadProductStats();
    loadOrderStats();

    apiFetch<SellerWallet>('/v1/sellers/wallet')
      .then((response) => setWallet(response.data))
      .catch(() => {})
      .finally(() => setWalletLoading(false));

    apiFetch<ProductsResponse>('/v1/sellers/products?page=1&limit=100&status=ACTIVE')
      .then((response) => {
        let totalReviews = 0;
        let weightedRating = 0;
        for (const product of response.data.data ?? []) {
          const count = product.reviewCount ?? 0;
          totalReviews += count;
          weightedRating += (product.averageRating ?? 0) * count;
        }
        setReviewStats({
          averageRating: totalReviews > 0 ? weightedRating / totalReviews : 0,
          totalReviews,
        });
      })
      .catch(() => {})
      .finally(() => setReviewStatsLoading(false));
  }, [loadOrderStats, loadProductStats]);

  const orderCount = (status: string) => orderStats?.byStatus[status] ?? 0;
  const actions: {
    label: string;
    detail: string;
    count: number;
    href: string;
    icon: IconName;
  }[] = [
    {
      label: 'Commandes à confirmer',
      detail: 'Acceptez ou refusez les nouvelles commandes.',
      count: orderCount('PENDING'),
      href: '/dashboard/orders?status=PENDING',
      icon: 'orders',
    },
    {
      label: 'Commandes à préparer',
      detail: 'Commencez la préparation des articles.',
      count: orderCount('CONFIRMED'),
      href: '/dashboard/orders?status=CONFIRMED',
      icon: 'orders',
    },
    {
      label: 'Préparations à terminer',
      detail: 'Signalez les colis prêts pour la collecte Teka.',
      count: orderCount('PROCESSING'),
      href: '/dashboard/orders?status=PROCESSING',
      icon: 'orders',
    },
    {
      label: 'Produits à corriger',
      detail: 'Consultez le motif du rejet avant de modifier la fiche.',
      count: productStats?.rejected ?? 0,
      href: '/dashboard/products?status=REJECTED',
      icon: 'products',
    },
  ];
  const actionTotal = actions.reduce((total, action) => total + action.count, 0);

  const catalogueCards = [
    { label: 'Total', value: productStats?.total ?? 0 },
    { label: 'Actifs', value: productStats?.active ?? 0 },
    { label: 'En validation', value: productStats?.pendingReview ?? 0 },
    { label: 'Brouillons', value: productStats?.draft ?? 0 },
  ];

  return (
    <div className="seller-page">
      <PageHeader
        eyebrow="Vue d’ensemble"
        title="Tableau de bord"
        description="Les actions importantes, votre catalogue et vos résultats en un coup d’œil."
        actions={
          <Link href="/dashboard/products/new" className="seller-button-primary">
            <Icon name="plus" className="h-4 w-4" />
            Nouveau produit
          </Link>
        }
      />

      <section className="seller-card overflow-hidden" aria-labelledby="actions-title">
        <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="actions-title" className="text-lg font-semibold text-foreground">Actions requises</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {orderError || productError
                ? 'Certaines tâches n’ont pas pu être actualisées.'
                : actionTotal > 0
                  ? `${actionTotal} élément${actionTotal > 1 ? 's' : ''} demande${actionTotal > 1 ? 'nt' : ''} votre attention.`
                  : 'Votre activité est à jour.'}
            </p>
          </div>
          {!orderError && !productError && actionTotal === 0 && (
            <span className="inline-flex w-fit rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              Aucune action en attente
            </span>
          )}
        </div>
        {(orderError || productError) && (
          <div className="space-y-2 border-b border-border p-4">
            {orderError && <InlineError retry={loadOrderStats} />}
            {productError && <InlineError retry={loadProductStats} />}
          </div>
        )}
        <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {actions.map((action, index) => {
            const loading = action.icon === 'orders' ? !orderStats && !orderError : !productStats && !productError;
            return (
              <Link
                key={action.label}
                href={action.href}
                className={`group flex min-h-28 items-center gap-4 p-5 transition-colors hover:bg-muted/40 ${index > 1 ? 'lg:border-t lg:border-border' : ''}`}
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={action.icon} className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-foreground">{action.label}</h3>
                    <span className={`min-w-8 rounded-full px-2 py-1 text-center text-sm font-bold ${action.count > 0 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                      {loading ? '…' : action.count}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{action.detail}</p>
                </div>
                <Icon name="arrow-right" className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="seller-card p-5" aria-labelledby="catalogue-title">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 id="catalogue-title" className="text-lg font-semibold">Catalogue</h2>
              <p className="mt-1 text-sm text-muted-foreground">État de vos fiches produit.</p>
            </div>
            <Link href="/dashboard/products" className="text-sm font-semibold text-primary hover:underline">Voir tout</Link>
          </div>
          {productError ? (
            <InlineError retry={loadProductStats} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {catalogueCards.map((card) => (
                <div key={card.label} className="rounded-xl bg-muted/60 p-4">
                  <p className="text-2xl font-bold text-foreground">{productStats ? card.value : <LoadingValue />}</p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{card.label}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <Link href="/dashboard/earnings" className="seller-card group p-5 transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Solde disponible</p>
              <p className="mt-3 break-words text-3xl font-bold text-primary">
                {walletLoading ? <LoadingValue wide /> : formatFC(wallet?.balanceCDF ?? '0')}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Consultez vos gains et virements.</p>
            </div>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon name="earnings" className="h-5 w-5" />
            </div>
          </div>
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="seller-card p-5" aria-labelledby="tracking-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="tracking-title" className="text-lg font-semibold">Suivi des commandes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Étapes gérées par Teka après votre préparation.</p>
            </div>
            <Link href="/dashboard/orders" className="text-sm font-semibold text-primary hover:underline">Voir tout</Link>
          </div>
          {orderError ? (
            <InlineError retry={loadOrderStats} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Prêtes à collecter', orderStats?.summary.pretesPourCollecte ?? 0],
                ['En livraison', orderStats?.summary.enLivraison ?? 0],
                ['Livrées', orderStats?.summary.livrees ?? 0],
                ['Retours', orderStats?.summary.retours ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-border p-4">
                  <p className="text-2xl font-bold">{orderStats ? value : <LoadingValue />}</p>
                  <p className="mt-1 text-xs leading-4 text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <Link href="/dashboard/reviews" className="seller-card p-5 transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Satisfaction clients</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold">{reviewStatsLoading ? '…' : reviewStats.averageRating.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">/ 5</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {reviewStatsLoading ? 'Chargement…' : `${reviewStats.totalReviews} avis`}
              </p>
            </div>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-warning/10 text-amber-700">
              <Icon name="reviews" className="h-5 w-5" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
