'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface SellerApplication {
  id: string;
  userId: string;
  user: {
    firstName?: string | null;
    lastName?: string | null;
    phone: string;
  };
  businessName: string;
  status: string;
  createdAt: string;
}

interface PaginatedResponse {
  data: SellerApplication[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function SellersPage() {
  const t = useTranslations('Sellers');
  const [sellers, setSellers] = useState<SellerApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchSellers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/sellers?${params}`);
      const rd = res.data;
      if (Array.isArray(rd)) { setSellers(rd); setTotalPages(1); }
      else { setSellers(rd.data); setTotalPages(rd.meta?.totalPages ?? 1); }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchSellers();
  }, [fetchSellers]);

  const handleApprove = async (sellerId: string) => {
    try {
      await apiFetch(`/v1/admin/sellers/${sellerId}/approve`, { method: 'POST' });
      fetchSellers();
    } catch {
      // ignore
    }
  };

  const handleReject = async (sellerId: string) => {
    try {
      await apiFetch(`/v1/admin/sellers/${sellerId}/reject`, { method: 'POST' });
      fetchSellers();
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      </div>

      <div className="flex gap-2 mb-6">
        {['', 'PENDING', 'APPROVED', 'REJECTED'].map((status) => (
          <button
            key={status}
            onClick={() => {
              setStatusFilter(status);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === status
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-muted'
            }`}
          >
            {status === '' ? t('all') : t(`status_${status.toLowerCase()}`)}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('businessName')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('owner')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('phone')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('status')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('date')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t('loading')}
                </td>
              </tr>
            ) : sellers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t('noSellers')}
                </td>
              </tr>
            ) : (
              sellers.map((seller) => (
                <tr key={seller.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {seller.businessName}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {seller.user.firstName} {seller.user.lastName}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">{seller.user.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      seller.status === 'APPROVED'
                        ? 'bg-success/10 text-success'
                        : seller.status === 'PENDING'
                          ? 'bg-warning/10 text-warning'
                          : 'bg-destructive/10 text-destructive'
                    }`}>
                      {seller.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(seller.createdAt).toLocaleDateString('fr-CD')}
                  </td>
                  <td className="px-4 py-3">
                    {seller.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(seller.id)}
                          className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                        >
                          {t('approve')}
                        </button>
                        <button
                          onClick={() => handleReject(seller.id)}
                          className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                        >
                          {t('reject')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('previous')}
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('next')}
          </button>
        </div>
      )}
    </div>
  );
}
