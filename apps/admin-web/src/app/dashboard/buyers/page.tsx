'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface User {
  id: string;
  phone: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status: string;
  createdAt: string;
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

type StatusFilter = '' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export default function BuyersPage() {
  const t = useTranslations('Buyers');
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        role: 'BUYER',
      });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/users?${params}`);
      const rd = res.data;
      if (Array.isArray(rd)) { setUsers(rd); setTotalPages(1); }
      else { setUsers(rd.data); setTotalPages(rd.pagination?.totalPages ?? 1); }
    } catch {
      // apiFetch surfaces errors; intentional silent fail at this layer
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const statusBadgeClass = (s: string) =>
    s === 'ACTIVE' ? 'bg-success/10 text-success'
    : s === 'SUSPENDED' ? 'bg-warning/10 text-warning'
    : s === 'BANNED' ? 'bg-destructive/10 text-destructive'
    : 'bg-secondary text-secondary-foreground';

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {([
          { value: '', label: t('filterAll') },
          { value: 'ACTIVE', label: t('filterActive') },
          { value: 'SUSPENDED', label: t('filterSuspended') },
          { value: 'BANNED', label: t('filterBanned') },
        ] as { value: StatusFilter; label: string }[]).map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === tab.value
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
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('name')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('email')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('phone')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('status')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('createdAt')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t('loading')}</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t('noUsers')}</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm text-foreground">
                    {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">{user.email ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{user.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(user.status)}`}>
                      {t(`status_${user.status}` as 'status_ACTIVE')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString('fr-CD')}
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
    </div>
  );
}
