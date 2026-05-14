'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
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
  return new Intl.NumberFormat('fr-CD', {
    style: 'currency',
    currency: 'CDF',
    maximumFractionDigits: 0,
  }).format(centimes / 100);
}

function formatNumber(val: number): string {
  return new Intl.NumberFormat('fr-CD').format(val);
}

export default function AdminDashboardPage() {
  const t = useTranslations('Dashboard');
  const tCommon = useTranslations('Common');
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
    return new Intl.NumberFormat('fr-CD', {
      style: 'currency',
      currency: 'CDF',
      maximumFractionDigits: 0,
    }).format(Number(centimes) / 100);
  };

  const periodKey = (p: Period) => {
    switch (p) {
      case '7d': return t('period7d');
      case '30d': return t('period30d');
      case '90d': return t('period90d');
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
      <h1 className="text-2xl font-bold text-foreground mb-2">{t('title')}</h1>
      <p className="text-muted-foreground mb-8">
        {t('welcome')}, {user?.firstName}
      </p>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground">{t('totalUsers')}</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalUsers ?? '--'}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground">{t('totalSellers')}</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalSellers ?? '--'}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground">{t('totalOrders')}</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalOrders ?? '--'}
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-border p-6">
          <h3 className="text-sm font-medium text-muted-foreground">{t('totalRevenue')}</h3>
          {isLoading ? (
            <div className="h-9 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground mt-2">
              {stats?.totalRevenueCDF ? formatCDF(stats.totalRevenueCDF) : '-- CDF'}
            </p>
          )}
        </div>
      </div>

      {/* Trends Section */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">{t('trends')}</h2>
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
              <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('revenue')}</h3>
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
                    formatter={(value) => [formatCDFValue(Number(value ?? 0)), t('revenue')]}
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
              <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('orders')}</h3>
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
                    formatter={(value) => [formatNumber(Number(value ?? 0)), t('orders')]}
                    labelFormatter={formatDateLabel}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* New Users Chart - Line */}
            <div className="bg-white rounded-xl border border-border p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('users')}</h3>
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
                    formatter={(value) => [formatNumber(Number(value ?? 0)), t('users')]}
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
              <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('gmv')}</h3>
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
                    formatter={(value) => [formatCDFValue(Number(value ?? 0)), t('gmv')]}
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
          <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
        )}
      </div>
    </div>
  );
}
