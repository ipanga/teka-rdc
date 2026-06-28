'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api-client';
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

interface AdminStats {
  totalUsers: number;
  totalSellers: number;
  totalOrders: number;
  totalRevenueCDF: string;
  pendingSellerApplicationsCount: number;
  pendingProductsCount: number;
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
  return `${new Intl.NumberFormat('fr-CD', {
    maximumFractionDigits: 0,
  }).format(centimes / 100)} FC`;
}

function formatNumber(val: number): string {
  return new Intl.NumberFormat('fr-CD').format(val);
}

export default function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [isTrendsLoading, setIsTrendsLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('30d');

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<AdminStats>('/v1/admin/stats');
      setStats(res.data);
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTrends = useCallback(async () => {
    setIsTrendsLoading(true);
    try {
      const res = await apiFetch<TrendsData>(`/v1/admin/stats/trends?period=${period}`);
      setTrends(res.data);
    } catch {
      // Error handled by apiFetch
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

  const formatCDF = (centimes: string) => {
    return `${new Intl.NumberFormat('fr-CD', {
      maximumFractionDigits: 0,
    }).format(Number(centimes) / 100)} FC`;
  };

  const periodKey = (p: Period) => {
    switch (p) {
      case '7d': return "7 jours";
      case '30d': return "30 jours";
      case '90d': return "90 jours";
    }
  };

  const ChartSkeleton = () => (
    <div className="bg-white rounded-xl border border-border p-6">
      <div className="h-5 w-32 bg-muted rounded animate-pulse mb-4" />
      <div className="h-48 bg-muted rounded animate-pulse" />
    </div>
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-foreground mb-2">Tableau de bord</h1>
      <p className="text-muted-foreground mb-8">
        Bienvenue, {user?.firstName}
      </p>

      {/* Pending seller applications alert — only shown when there are any. */}
      {!isLoading && (stats?.pendingSellerApplicationsCount ?? 0) > 0 && (
        <Link
          href="/dashboard/sellers"
          className="flex items-center justify-between gap-4 mb-6 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
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
            Examiner les demandes &rarr;
          </span>
        </Link>
      )}

      {/* Pending products alert — products awaiting moderation. */}
      {!isLoading && (stats?.pendingProductsCount ?? 0) > 0 && (
        <Link
          href="/dashboard/products?status=PENDING_REVIEW"
          className="flex items-center justify-between gap-4 mb-6 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
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
            Examiner les produits &rarr;
          </span>
        </Link>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground">Utilisateurs</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalUsers ?? '--'}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground">Vendeurs</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalSellers ?? '--'}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground">Commandes</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalOrders ?? '--'}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-border p-6">
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

      {/* Trends Section */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Tendances</h2>
          <div className="flex gap-2">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  period === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-muted'
                }`}
              >
                {periodKey(p)}
              </button>
            ))}
          </div>
        </div>

        {isTrendsLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        ) : trends ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Chart - Area */}
            <div className="bg-white rounded-xl border border-border p-6">
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
            <div className="bg-white rounded-xl border border-border p-6">
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
            <div className="bg-white rounded-xl border border-border p-6">
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
            <div className="bg-white rounded-xl border border-border p-6">
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
