'use client';

import { formatFC } from '@teka/shared';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api-client';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/page-header';
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
}

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

      {statsError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          <span>Impossible de charger les indicateurs opérationnels.</span>
          <button type="button" onClick={fetchStats} className="font-semibold underline underline-offset-4">Réessayer</button>
        </div>
      )}

      {/* Pending seller applications alert — only shown when there are any. */}
      {!isLoading && (stats?.pendingSellerApplicationsCount ?? 0) > 0 && (
        <Link
          href="/dashboard/sellers"
          className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-white p-4 shadow-sm transition-colors hover:bg-primary/5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-white text-sm font-bold">
              {stats?.pendingSellerApplicationsCount}
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                Demandes vendeurs en attente
              </p>
              <p className="text-xs text-muted-foreground">
                De nouvelles demandes attendent votre approbation.
              </p>
            </div>
          </div>
          <span className="text-sm font-medium text-primary whitespace-nowrap">
            Examiner les demandes
          </span>
        </Link>
      )}

      {/* Pending products alert — products awaiting moderation. */}
      {!isLoading && (stats?.pendingProductsCount ?? 0) > 0 && (
        <Link
          href="/dashboard/products?status=PENDING_REVIEW"
          className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-white p-4 shadow-sm transition-colors hover:bg-primary/5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-white text-sm font-bold">
              {stats?.pendingProductsCount}
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                Produits en attente de validation
              </p>
              <p className="text-xs text-muted-foreground">
                De nouveaux produits attendent votre validation.
              </p>
            </div>
          </div>
          <span className="text-sm font-medium text-primary whitespace-nowrap">
            Examiner les produits
          </span>
        </Link>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground">Utilisateurs</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalUsers !== undefined ? formatNumber(stats.totalUsers) : '--'}
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground">Vendeurs</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalSellers !== undefined ? formatNumber(stats.totalSellers) : '--'}
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground">Commandes</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalOrders !== undefined ? formatNumber(stats.totalOrders) : '--'}
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-border p-5 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground">Chiffre d&apos;affaires</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalRevenueCDF ? formatCDF(stats.totalRevenueCDF) : '-- FC'}
            </p>
          )}
        </div>
      </div>

      {/* Order operations (Teka logistics) */}
      <div className="space-y-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Centre d’actions</p><h2 className="mt-1 text-lg font-semibold text-foreground">Opérations commandes</h2></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {([
            { label: 'Nouvelles', sub: 'à confirmer', value: stats?.orderOps?.awaitingConfirmation ?? 0, href: '/dashboard/orders?status=PENDING', color: 'text-warning' },
            { label: 'Prêtes pour collecte', sub: 'Teka', value: stats?.orderOps?.readyForPickup ?? 0, href: '/dashboard/orders?status=READY_FOR_TEKA_PICKUP', color: 'text-indigo-700' },
            { label: 'Reçues par Teka', sub: 'entrepôt', value: stats?.orderOps?.receivedAtTeka ?? 0, href: '/dashboard/orders?status=RECEIVED_AT_TEKA', color: 'text-indigo-700' },
            { label: 'En livraison', sub: '', value: stats?.orderOps?.outForDelivery ?? 0, href: '/dashboard/orders?status=OUT_FOR_DELIVERY', color: 'text-primary' },
            { label: 'Livrées', sub: "aujourd'hui", value: stats?.orderOps?.deliveredToday ?? 0, href: '/dashboard/orders?status=DELIVERED', color: 'text-success' },
            { label: 'Retours', sub: 'à traiter', value: stats?.orderOps?.pendingReturns ?? 0, href: '/dashboard/returns?status=REQUESTED', color: 'text-destructive' },
          ]).map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="admin-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
            >
              {isLoading ? (
                <div className="h-8 w-10 bg-muted rounded animate-pulse" />
              ) : (
                <p className={`text-2xl font-bold ${c.color}`}>{stats?.orderOps ? c.value : '--'}</p>
              )}
              <p className="text-xs font-medium text-foreground mt-1 leading-tight">{c.label}</p>
              {c.sub && <p className="text-[11px] text-muted-foreground leading-tight">{c.sub}</p>}
            </Link>
          ))}
        </div>
      </div>

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
