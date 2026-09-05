'use client';

import { formatFC } from '@teka/shared';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api-client';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/page-header';
import {
  buildActionQueues,
  totalPendingActions,
  type ActionCenterStats,
  type QueueTone,
} from '@/lib/action-center';
import {
  ResponsiveContainer,
  AreaChart,
  BarChart,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  Area,
  Bar,
  Line,
  CartesianGrid,
} from 'recharts';

interface OrderOps {
  awaitingConfirmation: number;
  readyForPickup: number;
  receivedAtTeka: number;
  outForDelivery: number;
  deliveredToday: number;
  pendingReturns: number;
}

interface AdminStats {
  totalUsers: number;
  totalSellers: number;
  totalOrders: number;
  totalRevenueCDF: string;
  pendingSellerApplicationsCount: number;
  pendingProductsCount: number;
  orderOps?: OrderOps;
  actionCenter?: ActionCenterStats;
}

const TONE_STYLES: Record<QueueTone, { count: string; ring: string }> = {
  finance: { count: 'text-primary', ring: 'hover:border-primary/40' },
  moderation: { count: 'text-warning', ring: 'hover:border-warning/40' },
  returns: { count: 'text-destructive', ring: 'hover:border-destructive/40' },
  logistics: { count: 'text-indigo-700', ring: 'hover:border-indigo-300' },
};

interface TrendPoint {
  date: string;
  value: number;
}

interface TrendsData {
  revenueDaily: TrendPoint[];
  ordersDaily: TrendPoint[];
  usersDaily: TrendPoint[];
  gmvDaily: TrendPoint[];
}

type Period = '7d' | '30d' | '90d';

const PERIOD_OPTIONS: Period[] = ['7d', '30d', '90d'];

// Placeholder tiles while the stats load — same shape, no fabricated counts.
const SKELETON_QUEUES = buildActionQueues({
  sellerApplicationsPending: 0,
  sellerVerificationsPending: 0,
  productsPendingReview: 0,
  returnsPending: 0,
  ordersReadyForPickup: 0,
  ordersReceivedAtTeka: 0,
  payoutsAwaitingReview: { count: 0, amountCDF: '0' },
  payoutsAwaitingPayment: { count: 0, processingCount: 0, amountCDF: '0' },
});

function formatDateLabel(dateStr: unknown): string {
  const d = new Date(String(dateStr));
  return d.toLocaleDateString('fr-CD', { day: '2-digit', month: 'short' });
}

function formatCDFValue(centimes: number): string {
  return formatFC(centimes);
}

function formatNumber(val: number): string {
  return new Intl.NumberFormat('fr-CD').format(val);
}

export default function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [isTrendsLoading, setIsTrendsLoading] = useState(true);
  const [trendsError, setTrendsError] = useState(false);
  const [period, setPeriod] = useState<Period>('30d');

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setStatsError(false);
    try {
      const res = await apiFetch<AdminStats>('/v1/admin/stats');
      setStats(res.data);
    } catch {
      setStatsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTrends = useCallback(async () => {
    setIsTrendsLoading(true);
    setTrendsError(false);
    try {
      const res = await apiFetch<TrendsData>(`/v1/admin/stats/trends?period=${period}`);
      setTrends(res.data);
    } catch {
      setTrendsError(true);
    } finally {
      setIsTrendsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  const formatCDF = (centimes: string) => formatFC(centimes);
  const queues = stats?.actionCenter ? buildActionQueues(stats.actionCenter) : null;
  const pendingTotal = queues ? totalPendingActions(queues) : 0;

  const periodKey = (p: Period) => {
    switch (p) {
      case '7d': return "7 jours";
      case '30d': return "30 jours";
      case '90d': return "90 jours";
    }
  };

  const ChartSkeleton = () => (
    <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
      <div className="h-5 w-32 bg-muted rounded animate-pulse mb-4" />
      <div className="h-48 bg-muted rounded animate-pulse" />
    </div>
  );

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Pilotage"
        title="Tableau de bord"
        description={`Bonjour ${user?.firstName ?? ''}. Les validations et opérations prioritaires sont regroupées ici.`}
        actions={(
          <Link href="/dashboard/orders" className="admin-button-secondary">
            Suivre les commandes
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        )}
      />


      {/* À traiter — the first question the dashboard answers. Every tile's
          count comes from the same server-side filter its link opens. */}
      <section className="space-y-4" aria-labelledby="action-center-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Centre d’actions</p>
            <h2 id="action-center-title" className="mt-1 text-lg font-semibold text-foreground">À traiter maintenant</h2>
          </div>
          {!isLoading && queues && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {pendingTotal === 0
                ? 'Rien à traiter pour le moment.'
                : `${formatNumber(pendingTotal)} élément${pendingTotal > 1 ? 's' : ''} en attente d’une action.`}
            </p>
          )}
        </div>

        {statsError && !isLoading ? (
          <div className="admin-card p-6 text-center" role="alert">
            <h3 className="font-semibold text-foreground">Files d’attente indisponibles</h3>
            <p className="mt-2 text-sm text-muted-foreground">Les compteurs n’ont pas pu être chargés ; aucune valeur n’est affichée à leur place.</p>
            <button type="button" onClick={fetchStats} className="admin-button-secondary mt-4">Réessayer</button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={isLoading}>
            {(queues ?? SKELETON_QUEUES).map((q) => {
              const tone = TONE_STYLES[q.tone];
              const idle = !isLoading && q.count === 0;
              return (
                <li key={q.key}>
                  <Link
                    href={q.href}
                    aria-label={isLoading ? q.label : `${q.label} : ${q.count}`}
                    className={`admin-card flex h-full flex-col gap-2 p-4 transition-colors ${idle ? 'opacity-70' : tone.ring} hover:bg-primary/[0.02]`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {isLoading ? (
                        <div className="h-8 w-12 animate-pulse rounded bg-muted" />
                      ) : (
                        <p className={`text-3xl font-bold leading-none ${idle ? 'text-muted-foreground' : tone.count}`}>{formatNumber(q.count)}</p>
                      )}
                      {!isLoading && q.amountCDF && q.count > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">{formatCDF(q.amountCDF)}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{q.label}</p>
                      <p className="text-xs text-muted-foreground">{q.detail}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Informational KPIs — context, not actions. */}
      <section className="space-y-4" aria-labelledby="kpi-title">
        <h2 id="kpi-title" className="text-lg font-semibold text-foreground">Indicateurs</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {([
            { label: 'Utilisateurs', value: stats?.totalUsers !== undefined ? formatNumber(stats.totalUsers) : '--' },
            { label: 'Vendeurs', value: stats?.totalSellers !== undefined ? formatNumber(stats.totalSellers) : '--' },
            { label: 'Commandes', value: stats?.totalOrders !== undefined ? formatNumber(stats.totalOrders) : '--' },
            { label: 'Chiffre d’affaires', value: stats?.totalRevenueCDF ? formatCDF(stats.totalRevenueCDF) : '-- FC' },
          ]).map((k) => (
            <div key={k.label} className="admin-card p-5">
              <h3 className="text-sm font-medium text-muted-foreground">{k.label}</h3>
              {isLoading ? (
                <div className="mt-2 h-9 animate-pulse rounded bg-muted" />
              ) : (
                <p className="mt-2 text-3xl font-bold text-foreground">{k.value}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Logistics follow-up — states that need no admin action right now. */}
      <section className="space-y-4" aria-labelledby="logistics-title">
        <h2 id="logistics-title" className="text-lg font-semibold text-foreground">Suivi logistique</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([
            { label: 'Nouvelles commandes', sub: 'à confirmer par le vendeur', value: stats?.orderOps?.awaitingConfirmation, href: '/dashboard/orders?status=PENDING' },
            { label: 'En livraison', sub: 'chez l’acheteur', value: stats?.orderOps?.outForDelivery, href: '/dashboard/orders?status=OUT_FOR_DELIVERY' },
            { label: 'Livrées aujourd’hui', sub: 'encaissement confirmé', value: stats?.orderOps?.deliveredToday, href: '/dashboard/orders?status=DELIVERED' },
          ]).map((c) => (
            <Link key={c.label} href={c.href} className="admin-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]">
              {isLoading ? (
                <div className="h-8 w-10 animate-pulse rounded bg-muted" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{c.value === undefined ? '--' : formatNumber(c.value)}</p>
              )}
              <p className="mt-1 text-xs font-medium leading-tight text-foreground">{c.label}</p>
              <p className="text-[11px] leading-tight text-muted-foreground">{c.sub}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Trends Section */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">Tendances</h2>
          <div className="flex w-fit rounded-lg border border-border bg-white p-1 shadow-sm">
            {PERIOD_OPTIONS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {periodKey(p)}
              </button>
            ))}
          </div>
        </div>

        {isTrendsLoading ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        ) : trendsError ? (
          <div className="admin-card p-8 text-center" role="alert">
            <h3 className="font-semibold text-foreground">Impossible de charger les tendances</h3>
            <p className="mt-2 text-sm text-muted-foreground">Les opérations restent disponibles. Réessayez pour afficher les graphiques.</p>
            <button type="button" onClick={fetchTrends} className="admin-button-secondary mt-5">Réessayer</button>
          </div>
        ) : trends ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Revenue Chart - Area */}
            <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Revenus</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trends.revenueDaily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateLabel}
                    tick={{ fontSize: 11 }}
                    stroke="#999"
                  />
                  <YAxis
                    tickFormatter={(v) => formatCDFValue(Number(v))}
                    tick={{ fontSize: 11 }}
                    stroke="#999"
                    width={90}
                  />
                  <Tooltip
                    formatter={(value) => [formatCDFValue(Number(value ?? 0)), "Revenus"]}
                    labelFormatter={formatDateLabel}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Orders Chart - Bar */}
            <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Commandes</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trends.ordersDaily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateLabel}
                    tick={{ fontSize: 11 }}
                    stroke="#999"
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="#999" />
                  <Tooltip
                    formatter={(value) => [formatNumber(Number(value ?? 0)), "Commandes"]}
                    labelFormatter={formatDateLabel}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* New Users Chart - Line */}
            <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Nouveaux utilisateurs</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trends.usersDaily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateLabel}
                    tick={{ fontSize: 11 }}
                    stroke="#999"
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="#999" />
                  <Tooltip
                    formatter={(value) => [formatNumber(Number(value ?? 0)), "Nouveaux utilisateurs"]}
                    labelFormatter={formatDateLabel}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* GMV Chart - Area */}
            <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Volume brut (GMV)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trends.gmvDaily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateLabel}
                    tick={{ fontSize: 11 }}
                    stroke="#999"
                  />
                  <YAxis
                    tickFormatter={(v) => formatCDFValue(Number(v))}
                    tick={{ fontSize: 11 }}
                    stroke="#999"
                    width={90}
                  />
                  <Tooltip
                    formatter={(value) => [formatCDFValue(Number(value ?? 0)), "Volume brut (GMV)"]}
                    labelFormatter={formatDateLabel}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#8b5cf6"
                    fill="#8b5cf6"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        )}
      </div>
    </div>
  );
}
