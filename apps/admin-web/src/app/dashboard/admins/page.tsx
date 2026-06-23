'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface User {
  id: string;
  phone: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status: string;
  createdAt: string;
  lastLoginAt?: string | null;
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

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  BANNED: "Banni",
};

export default function AdminsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        role: 'ADMIN',
      });
      if (search) params.set('search', search);
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/users?${params}`);
      const rd = res.data;
      if (Array.isArray(rd)) { setUsers(rd); setTotalPages(1); }
      else { setUsers(rd.data); setTotalPages(rd.pagination?.totalPages ?? 1); }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [page, search]);

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
        <h1 className="text-2xl font-bold text-foreground">Administrateurs</h1>
        <p className="text-sm text-muted-foreground mt-1">Comptes administrateurs de la plateforme</p>
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email..."
            className="flex-1 max-w-md px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Rechercher
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Nom</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Téléphone</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Statut</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Date d&apos;inscription</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Dernière connexion</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Chargement...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Aucun administrateur trouvé</td></tr>
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
                      {STATUS_LABELS[user.status] ?? user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString('fr-CD')}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('fr-CD') : "Jamais"}
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
            Précédent
          </button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
