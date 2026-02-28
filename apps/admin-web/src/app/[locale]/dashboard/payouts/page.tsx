'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface PayoutSeller {
  id: string;
  businessName: string;
}

interface Payout {
  id: string;
  amountCDF: string;
  method: string;
  phone: string;
  status: string;
  seller?: PayoutSeller | null;
  createdAt: string;
}

interface PaginatedResponse {
  data: Payout[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const STATUS_TABS = ['', 'REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED'];

const STATUS_TAB_KEYS: Record<string, string> = {
  '': 'all',
  REQUESTED: 'requested',
  APPROVED: 'approved',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
};

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-warning/10 text-warning',
  APPROVED: 'bg-primary/10 text-primary',
  PROCESSING: 'bg-primary/10 text-primary',
  COMPLETED: 'bg-success/10 text-success',
  REJECTED: 'bg-destructive/10 text-destructive',
};

export default function PayoutsPage() {
  const t = useTranslations('Payouts');
  const tCommon = useTranslations('Common');

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  // Approve confirm
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  // Reject modal
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedbackMessage = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchPayouts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/payouts?${params}`);
      setPayouts(res.data.data);
      setTotalPages(res.data.meta.totalPages);
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  const handleApprove = async () => {
    if (!approvingId) return;
    setIsApproving(true);
    try {
      await apiFetch(`/v1/admin/payouts/${approvingId}/approve`, { method: 'POST' });
      setApprovingId(null);
      fetchPayouts();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingId || !rejectReason.trim()) return;
    setIsRejecting(true);
    try {
      await apiFetch(`/v1/admin/payouts/${rejectingId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      setRejectingId(null);
      setRejectReason('');
      fetchPayouts();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setIsRejecting(false);
    }
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

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_TABS.map((status) => (
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
            {t(`tabs.${STATUS_TAB_KEYS[status]}`)}
          </button>
        ))}
      </div>

      {/* Payouts table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('table.date')}
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
                {t('table.phone')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('table.status')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('table.actions')}
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
            ) : payouts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {t('table.noPayouts')}
                </td>
              </tr>
            ) : (
              payouts.map((payout) => (
                <tr key={payout.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(payout.createdAt).toLocaleDateString('fr-CD')}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {payout.seller?.businessName || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                    {formatCDF(payout.amountCDF)}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {payout.method}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {payout.phone}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_STYLES[payout.status] || 'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      {t(`status.${payout.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {payout.status === 'REQUESTED' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setApprovingId(payout.id)}
                          className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                        >
                          {t('approve')}
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(payout.id);
                            setRejectReason('');
                          }}
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

      {/* Approve Confirmation Modal */}
      {approvingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setApprovingId(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('approve')}</h3>
              <p className="text-sm text-muted-foreground mb-4">{t('approveConfirm')}</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setApprovingId(null)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="px-4 py-2 text-sm font-medium text-white bg-success rounded-lg hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isApproving ? tCommon('loading') : tCommon('confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRejectingId(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{t('reject')}</h2>
              <button
                onClick={() => setRejectingId(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {t('rejectReason')} <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={t('rejectReasonPlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => setRejectingId(null)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleReject}
                  disabled={isRejecting || !rejectReason.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRejecting ? tCommon('loading') : t('rejectConfirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
