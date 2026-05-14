'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface TransactionSeller {
  id: string;
  businessName: string;
}

interface Transaction {
  id: string;
  orderId?: string | null;
  orderNumber?: string | null;
  type: string;
  provider: string;
  amountCDF: string;
  status: string;
  externalReference?: string | null;
  seller?: TransactionSeller | null;
  createdAt: string;
}

interface PaginatedResponse {
  data: Transaction[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const STATUS_OPTIONS = ['', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'];
const TYPE_OPTIONS = ['', 'PAYMENT', 'REFUND', 'PAYOUT'];

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-warning/10 text-warning',
  PROCESSING: 'bg-primary/10 text-primary',
  COMPLETED: 'bg-success/10 text-success',
  FAILED: 'bg-destructive/10 text-destructive',
  REFUNDED: 'bg-secondary text-secondary-foreground',
};

export default function TransactionsPage() {
  const t = useTranslations('Transactions');
  const tCommon = useTranslations('Common');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (search.trim()) params.set('search', search.trim());
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await apiFetch<PaginatedResponse | Transaction[]>(`/v1/payments/transactions?${params}`);
      if (Array.isArray(res.data)) {
        setTransactions(res.data);
        setTotalPages(1);
      } else {
        setTransactions(res.data.data);
        setTotalPages(res.data.meta?.totalPages ?? 1);
      }
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, typeFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTransactions();
  };

  const formatCDF = (centimes: string) => {
    return new Intl.NumberFormat('fr-CD', {
      style: 'currency',
      currency: 'CDF',
      maximumFractionDigits: 0,
    }).format(Number(centimes) / 100);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status ? t(`status.${status}`) : `${t('filters.status')}: ${t('filters.all')}`}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type ? t(`type.${type}`) : `${t('filters.type')}: ${t('filters.all')}`}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('filters.search')}
            className="flex-1 min-w-[200px] max-w-sm px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />

          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">{t('filters.dateFrom')}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">{t('filters.dateTo')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            {tCommon('search')}
          </button>
        </div>
      </form>

      {/* Transactions table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('table.date')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('table.order')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('table.seller')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('table.amount')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('table.method')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('table.status')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('table.reference')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {tCommon('loading')}
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {t('table.noTransactions')}
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(tx.createdAt).toLocaleDateString('fr-CD')}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {tx.orderNumber || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {tx.seller?.businessName || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                    {formatCDF(tx.amountCDF)}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {t(`provider.${tx.provider}`)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_STYLES[tx.status] || 'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      {t(`status.${tx.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                    {tx.externalReference || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tCommon('previous')}
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tCommon('next')}
          </button>
        </div>
      )}
    </div>
  );
}
