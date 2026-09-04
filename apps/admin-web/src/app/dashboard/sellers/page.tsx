'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { readStatusParam, withStatusParam } from '@/lib/action-center';

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
const FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
const APPLICATION_FILTERS: readonly Filter[] = ['PENDING', 'APPROVED', 'REJECTED'];

/** Row shape of GET /v1/admin/sellers/applications (SellerProfile + user). */
interface SellerApplication {
  id: string;
  businessName: string;
  phone: string | null;
  applicationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: string;
  user: {
    id: string;
    phone: string | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    status?: string;
    createdAt?: string;
  };
}

/** Map an application row onto the table's User shape. */
function applicationToRow(app: SellerApplication): User {
  return {
    id: app.user.id,
    phone: app.user.phone,
    email: app.user.email ?? null,
    firstName: app.user.firstName ?? null,
    lastName: app.user.lastName ?? null,
    status: app.user.status ?? 'ACTIVE',
    createdAt: app.user.createdAt ?? app.createdAt,
    sellerProfile: {
      id: app.id,
      businessName: app.businessName,
      phone: app.phone,
      applicationStatus: app.applicationStatus,
      rejectionReason: app.rejectionReason,
    },
  };
}

const APP_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvé",
  REJECTED: "Rejeté",
};

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  BANNED: "Banni",
};

export default function SellersPage() {
  const [sellers, setSellers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [loadError, setLoadError] = useState(false);
  // Deep links from the dashboard (?status=PENDING) — honoured on mount and
  // kept in the URL when a tab changes.
  const [queryReady, setQueryReady] = useState(false);
  useEffect(() => {
    setFilter(readStatusParam(window.location.search, FILTERS));
    setQueryReady(true);
  }, []);
  const selectFilter = (value: Filter) => {
    setFilter(value);
    setPage(1);
    window.history.replaceState(null, '', withStatusParam(`${window.location.pathname}${window.location.search}`, value));
  };
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // KYC document preview (Phase 2): a short-lived signed URL fetched on demand.
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [docError, setDocError] = useState('');

  const handleViewDocument = async (applicationId: string) => {
    setLoadingDocId(applicationId);
    setDocError('');
    try {
      const res = await apiFetch<{ url: string }>(
        `/v1/admin/sellers/applications/${applicationId}/document`,
      );
      setDocumentUrl(res.data.url);
    } catch {
      setDocError("Aucune pièce d’identité disponible.");
    } finally {
      setLoadingDocId(null);
    }
  };

  const fetchSellers = useCallback(async () => {
    if (!queryReady) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      if (APPLICATION_FILTERS.includes(filter)) {
        // Application-status tabs read the applications endpoint, whose
        // `status` filter is the same server-side definition the dashboard
        // count uses (ADMIN_QUEUES.sellerApplicationsPending) — so the
        // "Vendeurs à approuver" tile and this list always agree, and
        // pagination happens on the filtered set rather than client-side.
        const params = new URLSearchParams({ page: String(page), limit: '20', status: filter });
        const res = await apiFetch<{ data: SellerApplication[]; pagination?: { totalPages: number } }>(
          `/v1/admin/sellers/applications?${params}`,
        );
        const rd = res.data;
        const apps: SellerApplication[] = Array.isArray(rd) ? rd : rd.data;
        const rows = apps.map(applicationToRow);
        const q = search.trim().toLowerCase();
        setSellers(
          q
            ? rows.filter((u) =>
                [u.sellerProfile?.businessName, u.firstName, u.lastName, u.phone, u.sellerProfile?.phone]
                  .filter(Boolean)
                  .some((v) => String(v).toLowerCase().includes(q)),
              )
            : rows,
        );
        setTotalPages(Array.isArray(rd) ? 1 : (rd.pagination?.totalPages ?? 1));
        return;
      }
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        role: 'SELLER',
      });
      if (search) params.set('search', search);
      // SUSPENDED is a User-level status served by /users.
      if (filter === 'SUSPENDED') params.set('status', 'SUSPENDED');
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/users?${params}`);
      const rd = res.data;
      const list: User[] = Array.isArray(rd) ? rd : rd.data;
      setSellers(list);
      setTotalPages(Array.isArray(rd) ? 1 : (rd.pagination?.totalPages ?? 1));
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, filter, queryReady]);

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
    <div className="admin-page">
      <PageHeader eyebrow="Communauté" title="Vendeurs" description="Examinez les demandes d’inscription et gérez les comptes vendeurs." />

      <div className="flex flex-wrap gap-2 mb-6">
        {([
          { value: '', label: "Tous" },
          { value: 'PENDING', label: "En attente" },
          { value: 'APPROVED', label: "Approuvés" },
          { value: 'REJECTED', label: "Rejetés" },
          { value: 'SUSPENDED', label: "Suspendus" },
        ] as { value: Filter; label: string }[]).map((tab) => (
          <button
            key={tab.value}
            onClick={() => selectFilter(tab.value)}
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
            placeholder="Rechercher par boutique, nom ou téléphone..."
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
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Boutique</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Propriétaire</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Téléphone</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Validation</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Compte</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Date</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Chargement...</td></tr>
            ) : loadError ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center">
                <p className="text-sm text-destructive">Impossible de charger les vendeurs.</p>
                <button type="button" onClick={fetchSellers} className="admin-button-secondary mt-3">Réessayer</button>
              </td></tr>
            ) : sellers.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                {filter === 'PENDING' ? 'Aucune demande vendeur en attente.' : 'Aucun vendeur trouvé'}
              </td></tr>
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
                          {APP_STATUS_LABELS[appStatus] ?? appStatus}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${accountStatusClass(u.status)}`}>
                        {ACCOUNT_STATUS_LABELS[u.status] ?? u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString('fr-CD')}
                    </td>
                    <td className="px-4 py-3">
                      {sp && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewDocument(sp.id)}
                            disabled={loadingDocId === sp.id}
                            className="px-2.5 py-1 text-xs font-medium bg-muted text-foreground rounded-lg hover:bg-muted/70 transition-colors disabled:opacity-50"
                          >
                            {loadingDocId === sp.id ? '...' : "Voir la pièce"}
                          </button>
                          {appStatus === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleApprove(sp.id)}
                                className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                              >
                                Approuver
                              </button>
                              <button
                                onClick={() => { setRejectingId(sp.id); setRejectionReason(''); }}
                                className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                              >
                                Rejeter
                              </button>
                            </>
                          )}
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

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRejectingId(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Rejeter la demande</h3>
              <label className="block text-sm font-medium text-foreground mb-1">
                Motif du rejet <span className="text-destructive">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                placeholder="Décrivez la raison du rejet (minimum 5 caractères)..."
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
                  Annuler
                </button>
                <button
                  onClick={handleReject}
                  disabled={isSubmitting || rejectionReason.trim().length < 5}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '...' : "Rejeter"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {documentUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setDocumentUrl(null)}
          />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-2xl mx-4">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-foreground">
                  Pièce d’identité du vendeur
                </h3>
                <button
                  onClick={() => setDocumentUrl(null)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Fermer
                </button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={documentUrl}
                alt="Pièce d’identité du vendeur"
                className="w-full max-h-[70vh] object-contain rounded-lg bg-muted"
              />
              <div className="mt-3 text-right">
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Ouvrir dans un nouvel onglet &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {docError && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg bg-destructive text-primary-foreground text-sm shadow-lg">
          {docError}
          <button onClick={() => setDocError('')} className="ml-3 font-bold">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
