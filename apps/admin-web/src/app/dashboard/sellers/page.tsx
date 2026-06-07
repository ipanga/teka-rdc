'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface SellerProfileLite {
  id: string;
  businessName: string;
  phone: string | null;
  applicationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
}

interface User {
  id: string;
  phone: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status: string;
  createdAt: string;
  sellerProfile: SellerProfileLite | null;
}

interface PaginatedResponse {
  data: User[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Status filter combines two orthogonal axes:
//   - SellerProfile.applicationStatus (KYC review state)
//   - User.status (account suspension)
// Most admin workflow centers on application status, so that's the primary
// filter. SUSPENDED is exposed as a separate tab for account-level review.
type Filter = '' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export default function SellersPage() {
  const t = useTranslations('Sellers');
  const tCommon = useTranslations('Common');
  const [sellers, setSellers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSellers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        role: 'SELLER',
      });
      if (search) params.set('search', search);
      // SUSPENDED is a User-level status; everything else is an
      // application-level (SellerProfile) status. The API supports both,
      // so we route the param accordingly. The client-side filter then
      // narrows further for application-level statuses since the API
      // doesn't accept `applicationStatus` as a query param on /users.
      if (filter === 'SUSPENDED') params.set('status', 'SUSPENDED');
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/users?${params}`);
      const rd = res.data;
      let list: User[] = Array.isArray(rd) ? rd : rd.data;
      // Client-side narrow for application-status filters.
      if (filter === 'PENDING' || filter === 'APPROVED' || filter === 'REJECTED') {
        list = list.filter((u) => u.sellerProfile?.applicationStatus === filter);
      }
      setSellers(list);
      setTotalPages(Array.isArray(rd) ? 1 : (rd.pagination?.totalPages ?? 1));
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => { fetchSellers(); }, [fetchSellers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSellers();
  };

  const handleApprove = async (applicationId: string) => {
    try {
      await apiFetch(`/v1/admin/sellers/applications/${applicationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision: 'APPROVE' }),
      });
      fetchSellers();
    } catch {
      // ignore
    }
  };

  const handleReject = async () => {
    if (!rejectingId || rejectionReason.trim().length < 5) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/v1/admin/sellers/applications/${rejectingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision: 'REJECT', reason: rejectionReason.trim() }),
      });
      setRejectingId(null);
      setRejectionReason('');
      fetchSellers();
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
    }
  };

  const appStatusClass = (s: string) =>
    s === 'APPROVED' ? 'bg-success/10 text-success'
    : s === 'REJECTED' ? 'bg-destructive/10 text-destructive'
    : 'bg-warning/10 text-warning';

  const accountStatusClass = (s: string) =>
    s === 'ACTIVE' ? 'bg-success/10 text-success'
    : s === 'SUSPENDED' ? 'bg-warning/10 text-warning'
    : 'bg-destructive/10 text-destructive';

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {([
          { value: '', label: t('filterAll') },
          { value: 'PENDING', label: t('filterPending') },
          { value: 'APPROVED', label: t('filterApproved') },
          { value: 'REJECTED', label: t('filterRejected') },
          { value: 'SUSPENDED', label: t('filterSuspended') },
        ] as { value: Filter; label: string }[]).map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setFilter(tab.value); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              filter === tab.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="flex-1 max-w-md px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            {t('search')}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('businessName')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('owner')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('email')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('phone')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('applicationStatus')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('accountStatus')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('date')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">{t('loading')}</td></tr>
            ) : sellers.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">{t('noSellers')}</td></tr>
            ) : (
              sellers.map((u) => {
                const sp = u.sellerProfile;
                const appStatus = sp?.applicationStatus;
                return (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{sp?.businessName ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{u.email ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{sp?.phone ?? u.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      {appStatus ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${appStatusClass(appStatus)}`}>
                          {t(`appStatus_${appStatus}` as 'appStatus_PENDING')}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${accountStatusClass(u.status)}`}>
                        {t(`status_${u.status}` as 'status_ACTIVE')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString('fr-CD')}
                    </td>
                    <td className="px-4 py-3">
                      {appStatus === 'PENDING' && sp && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(sp.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                          >
                            {t('approve')}
                          </button>
                          <button
                            onClick={() => { setRejectingId(sp.id); setRejectionReason(''); }}
                            className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                          >
                            {t('reject')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
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
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('next')}
          </button>
        </div>
      )}

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRejectingId(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">{t('rejectConfirm')}</h3>
              <label className="block text-sm font-medium text-foreground mb-1">
                {t('rejectReason')} <span className="text-destructive">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                placeholder={t('rejectPlaceholder')}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              {rejectionReason.trim().length > 0 && rejectionReason.trim().length < 5 && (
                <p className="text-xs text-destructive mt-1">Minimum 5 caractères</p>
              )}
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleReject}
                  disabled={isSubmitting || rejectionReason.trim().length < 5}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '...' : t('reject')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
