'use client';

import { formatFC, formatUSD } from '@teka/shared';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';

interface ProductImage {
  id: string;
  url: string;
  isCover: boolean;
}

interface Product {
  id: string;
  title: string;
  priceCDF: number;
  priceUSD?: number | null;
  status: string;
  condition: string;
  createdAt: string;
  images: ProductImage[];
  // Matches the API include: seller.sellerProfile.businessName (+ name fallback).
  seller?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    sellerProfile?: { businessName?: string | null } | null;
  };
  category?: {
    id: string;
    name: string;
  };
  city?: {
    id: string;
    name: string;
  } | null;
}

interface City {
  id: string;
  name: string;
}

interface PaginatedResponse {
  data: Product[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

type StatusFilter = '' | 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'ARCHIVED' | 'SUSPENDED' | 'DRAFT';

export default function ProductModerationPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [queryReady, setQueryReady] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cities, setCities] = useState<City[]>([]);
  const [cityFilter, setCityFilter] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Cities for the town filter (public endpoint).
  useEffect(() => {
    apiFetch<City[] | { data: City[] }>('/v1/cities')
      .then((res) => {
        const list = Array.isArray(res.data)
          ? res.data
          : (res.data as { data: City[] }).data || [];
        setCities(list);
      })
      .catch(() => {});
  }, []);

  // Debounce the search box (multi-field: name/id/seller/brand/category).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Honor a `?status=` deep-link on mount (e.g. the dashboard "produits en
  // attente" alert / notification bell link to ?status=PENDING_REVIEW). Read
  // from window (not useSearchParams) to avoid a Suspense-boundary requirement.
  useEffect(() => {
    const valid: StatusFilter[] = [
      'PENDING_REVIEW',
      'ACTIVE',
      'REJECTED',
      'ARCHIVED',
      'SUSPENDED',
      'DRAFT',
    ];
    const fromUrl = new URLSearchParams(window.location.search).get('status');
    if (fromUrl && (valid as string[]).includes(fromUrl)) {
      setStatusFilter(fromUrl as StatusFilter);
    }
    setQueryReady(true);
  }, []);

  // Reason modal — shared by "reject" (PENDING) and "suspend" (ACTIVE).
  const [reasonModal, setReasonModal] = useState<{ id: string; action: 'reject' | 'suspend' } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchProducts = useCallback(async () => {
    if (!queryReady) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (cityFilter) params.set('cityId', cityFilter);
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/products?${params}`);
      const rd = res.data;
      if (Array.isArray(rd)) { setProducts(rd); setTotalPages(1); }
      else { setProducts(rd.data); setTotalPages(rd.pagination?.totalPages ?? 1); }
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, debouncedSearch, cityFilter, queryReady]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleApprove = async (productId: string) => {
    try {
      await apiFetch(`/v1/admin/products/${productId}/approve`, { method: 'PATCH' });
      showFeedback('success', "Produit approuvé avec succès");
      fetchProducts();
    } catch {
      showFeedback('error', 'Erreur');
    }
  };

  const handleReasonSubmit = async () => {
    if (!reasonModal || rejectionReason.trim().length < 5) return;
    setIsSubmitting(true);
    try {
      if (reasonModal.action === 'reject') {
        await apiFetch(`/v1/admin/products/${reasonModal.id}/reject`, {
          method: 'PATCH',
          body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
        });
        showFeedback('success', 'Produit rejeté');
      } else {
        await apiFetch(`/v1/admin/products/${reasonModal.id}/suspend`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: rejectionReason.trim() }),
        });
        showFeedback('success', 'Produit suspendu');
      }
      setReasonModal(null);
      setRejectionReason('');
      fetchProducts();
    } catch {
      showFeedback('error', 'Erreur');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Simple lifecycle actions (no reason): restore / archive / soft-delete.
  const runAction = async (
    productId: string,
    path: string,
    method: 'PATCH' | 'DELETE',
    okMsg: string,
  ) => {
    try {
      await apiFetch(`/v1/admin/products/${productId}${path}`, { method });
      showFeedback('success', okMsg);
      fetchProducts();
    } catch {
      showFeedback('error', 'Erreur');
    }
  };

  const getCoverImage = (product: Product): string | null => {
    const cover = product.images?.find((img) => img.isCover);
    const url = cover?.url || product.images?.[0]?.url;
    if (!url) return null;
    // Cloudinary thumbnail optimization
    return url.replace('/upload/', '/upload/w_80,h_80,c_fill,f_auto/');
  };

  const formatPrice = (cdf: number, usd?: number | null) =>
    usd ? `${formatFC(cdf)} / ${formatUSD(usd)}` : formatFC(cdf);

  const selectStatus = (status: StatusFilter) => {
    setStatusFilter(status);
    setPage(1);
    const url = new URL(window.location.href);
    if (status) url.searchParams.set('status', status);
    else url.searchParams.delete('status');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  };

  return (
    <div className="admin-page">
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

      <PageHeader eyebrow="Modération" title="Produits" description="Examinez les nouvelles fiches et gérez le cycle de vie du catalogue." />

      {/* Search (name / id / seller / brand / category) + town filter */}
      <div className="admin-card grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <label className="text-sm font-medium text-foreground">Rechercher
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, ID, vendeur, marque, catégorie…" className="mt-2 min-h-11 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <label className="text-sm font-medium text-foreground">Ville
          <select value={cityFilter} onChange={(e) => { setCityFilter(e.target.value); setPage(1); }} className="mt-2 min-h-11 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Toutes les villes</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <div className="admin-filter-bar" role="group" aria-label="Filtrer les produits par statut">
        {([
          { value: '', label: "Tous" },
          { value: 'PENDING_REVIEW', label: "En attente" },
          { value: 'ACTIVE', label: "Actifs" },
          { value: 'REJECTED', label: "Rejetés" },
          { value: 'ARCHIVED', label: "Archivés" },
          { value: 'SUSPENDED', label: "Suspendus" },
          { value: 'DRAFT', label: "Brouillons" },
        ] as { value: StatusFilter; label: string }[]).map((tab) => (
          <button
            key={tab.value}
            onClick={() => selectStatus(tab.value)}
            aria-pressed={statusFilter === tab.value}
            className={`admin-filter ${
              statusFilter === tab.value
                ? 'admin-filter-active'
                : ''
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loadError && products.length === 0 ? (
        <div className="admin-card p-8 text-center" role="alert"><h2 className="font-semibold text-foreground">Impossible de charger les produits</h2><p className="mt-2 text-sm text-muted-foreground">Vérifiez la connexion puis réessayez.</p><button type="button" onClick={fetchProducts} className="admin-button-secondary mt-5">Réessayer</button></div>
      ) : (
      <div className="admin-card overflow-x-auto">
        <table className="w-full min-w-[1080px]">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Image
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Produit
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Vendeur
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Ville
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Prix
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Date de soumission
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Statut
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {!queryReady || isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Chargement...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  {statusFilter || search || cityFilter ? 'Aucun produit ne correspond à ces critères' : 'Aucun produit dans le catalogue'}
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const coverUrl = getCoverImage(product);
                return (
                  <tr
                    key={product.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={product.title}
                          className="w-10 h-10 rounded-lg object-cover bg-muted"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                        {product.title}
                      </p>
                      {product.category && (
                        <p className="text-xs text-muted-foreground">{product.category.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {product.seller?.sellerProfile?.businessName ||
                        [product.seller?.firstName, product.seller?.lastName]
                          .filter(Boolean)
                          .join(' ') ||
                        '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                      {product.city?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                      {formatPrice(product.priceCDF, product.priceUSD)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(product.createdAt).toLocaleDateString('fr-CD')}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const m: Record<string, { c: string; l: string }> = {
                          ACTIVE: { c: 'bg-success/10 text-success', l: 'Actif' },
                          REJECTED: { c: 'bg-destructive/10 text-destructive', l: 'Rejeté' },
                          PENDING_REVIEW: { c: 'bg-warning/10 text-warning', l: 'En attente' },
                          ARCHIVED: { c: 'bg-secondary text-secondary-foreground', l: 'Archivé' },
                          SUSPENDED: { c: 'bg-destructive/10 text-destructive', l: 'Suspendu' },
                          DRAFT: { c: 'bg-secondary text-secondary-foreground', l: 'Brouillon' },
                        };
                        const s = m[product.status] ?? m.DRAFT;
                        return (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.c}`}>
                            {s.l}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <Link
                          href={`/dashboard/products/${product.id}`}
                          className="px-2.5 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                          Voir
                        </Link>
                        {product.status === 'PENDING_REVIEW' && (
                          <>
                            <button
                              onClick={() => handleApprove(product.id)}
                              className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                            >
                              Approuver
                            </button>
                            <button
                              onClick={() => { setReasonModal({ id: product.id, action: 'reject' }); setRejectionReason(''); }}
                              className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                            >
                              Rejeter
                            </button>
                          </>
                        )}
                        {product.status === 'ACTIVE' && (
                          <button
                            onClick={() => { setReasonModal({ id: product.id, action: 'suspend' }); setRejectionReason(''); }}
                            className="px-2.5 py-1 text-xs font-medium bg-warning/10 text-warning rounded-lg hover:bg-warning/20 transition-colors"
                          >
                            Suspendre
                          </button>
                        )}
                        {(product.status === 'SUSPENDED' || product.status === 'ARCHIVED') && (
                          <button
                            onClick={() => runAction(product.id, '/restore', 'PATCH', 'Produit réactivé')}
                            className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                          >
                            Réactiver
                          </button>
                        )}
                        {product.status !== 'ARCHIVED' && product.status !== 'SUSPENDED' && (
                          <button
                            onClick={() => runAction(product.id, '/archive', 'PATCH', 'Produit archivé')}
                            className="px-2.5 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                          >
                            Archiver
                          </button>
                        )}
                        <button
                          onClick={() => { if (confirm('Supprimer ce produit ? (réversible — soft-delete)')) runAction(product.id, '', 'DELETE', 'Produit supprimé'); }}
                          className="px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Précédent
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Suivant
          </button>
        </div>
      )}

      {/* Reason modal — reject or suspend */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setReasonModal(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                {reasonModal.action === 'reject' ? 'Rejeter' : 'Suspendre'}
              </h3>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {reasonModal.action === 'reject' ? 'Motif du rejet' : 'Motif de la suspension'} <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                  placeholder="Décrivez le motif (minimum 5 caractères)..."
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                {rejectionReason.trim().length > 0 && rejectionReason.trim().length < 5 && (
                  <p className="text-xs text-destructive mt-1">Minimum 5 caractères</p>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => { setReasonModal(null); setRejectionReason(''); }}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleReasonSubmit}
                  disabled={isSubmitting || rejectionReason.trim().length < 5}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '...' : (reasonModal.action === 'reject' ? 'Rejeter' : 'Suspendre')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
