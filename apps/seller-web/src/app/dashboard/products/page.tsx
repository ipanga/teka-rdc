'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ProductStatusBadge } from '@/components/product/product-status-badge';

interface ProductImage {
  id: string;
  url: string;
  order: number;
}

interface Product {
  id: string;
  title: string;
  priceCDF: string;
  priceUSD?: string | null;
  quantity: number;
  status: string;
  condition: string;
  images: ProductImage[];
  createdAt: string;
}

interface ProductsResponse {
  data: Product[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

type StatusFilter = '' | 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'ARCHIVED' | 'SUSPENDED';

const LIMIT = 20;

export default function ProductsListPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Debounce the search box (title / shortCode / id).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (statusFilter) {
        params.set('status', statusFilter);
      }
      if (debouncedSearch) {
        params.set('search', debouncedSearch);
      }
      const res = await apiFetch<ProductsResponse>(`/v1/sellers/products?${params}`);
      setProducts(res.data.data || []);
      setTotalPages(res.data.pagination?.totalPages ?? 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Erreur lors du chargement des produits");
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleFilterChange = (newFilter: StatusFilter) => {
    setStatusFilter(newFilter);
    setPage(1);
  };

  const handleArchive = async (productId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir archiver ce produit ?")) return;
    setArchivingId(productId);
    try {
      await apiFetch(`/v1/sellers/products/${productId}`, { method: 'DELETE' });
      loadProducts();
    } catch {
      // ignore
    } finally {
      setArchivingId(null);
    }
  };

  const handleSubmit = async (productId: string) => {
    setSubmittingId(productId);
    try {
      await apiFetch(`/v1/sellers/products/${productId}/submit`, { method: 'PATCH' });
      loadProducts();
    } catch {
      // ignore
    } finally {
      setSubmittingId(null);
    }
  };

  const handleWithdraw = async (productId: string) => {
    setBusyId(productId);
    try {
      await apiFetch(`/v1/sellers/products/${productId}/withdraw`, { method: 'PATCH' });
      loadProducts();
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (productId: string) => {
    setBusyId(productId);
    try {
      await apiFetch(`/v1/sellers/products/${productId}/restore`, { method: 'PATCH' });
      loadProducts();
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (productId: string) => {
    setBusyId(productId);
    try {
      const res = await apiFetch<{ id: string }>(`/v1/sellers/products/${productId}/duplicate`, { method: 'POST' });
      // Land the seller on the new draft to finish editing the variant.
      if (res.data?.id) router.push(`/dashboard/products/${res.data.id}`);
      else loadProducts();
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  };

  const formatPrice = (centimes: string) => {
    const amount = Number(centimes) / 100;
    return new Intl.NumberFormat('fr-CD', {
      style: 'currency',
      currency: 'CDF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat('fr-CD', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
  };

  const getProductTitle = (product: Product) => {
    return product.title || '---';
  };

  const getThumbUrl = (product: Product) => {
    if (!product.images || product.images.length === 0) return null;
    const sorted = [...product.images].sort((a, b) => a.order - b.order);
    const url = sorted[0].url;
    return url.replace('/upload/', '/upload/w_80,h_80,c_fill/');
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: '', label: "Tous" },
    { key: 'DRAFT', label: "Brouillons" },
    { key: 'PENDING_REVIEW', label: "En attente" },
    { key: 'ACTIVE', label: "Actifs" },
    { key: 'REJECTED', label: "Rejetés" },
    { key: 'ARCHIVED', label: "Archivés" },
    { key: 'SUSPENDED', label: "Suspendus" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Mes Produits</h1>
        <Link
          href="/dashboard/products/new"
          className="inline-flex items-center px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
        >
          + Nouveau produit
        </Link>
      </div>

      {/* Search (name / référence / ID) */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un produit (nom, référence, ID)…"
          className="w-full max-w-md px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-border">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === f.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-border p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-muted rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground mb-2">Aucun produit trouvé</p>
          <p className="text-sm text-muted-foreground mb-6">Commencez par créer votre premier produit.</p>
          <Link
            href="/dashboard/products/new"
            className="inline-flex items-center px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            + Nouveau produit
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile product cards */}
          <div className="md:hidden space-y-3">
            {products.map((product) => {
              const thumbUrl = getThumbUrl(product);
              const isEditable = product.status === 'DRAFT' || product.status === 'REJECTED';
              const isSubmittable = product.status === 'DRAFT';
              const isArchivable = product.status !== 'ARCHIVED' && product.status !== 'SUSPENDED';
              const isWithdrawable = product.status === 'PENDING_REVIEW';
              const isRestorable = product.status === 'ARCHIVED';
              const isDuplicable = product.status !== 'SUSPENDED';

              return (
                <article key={product.id} className="bg-white rounded-xl border border-border p-4 shadow-sm">
                  <div className="flex gap-3">
                    {thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrl}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs shrink-0">
                        --
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-foreground line-clamp-2">{getProductTitle(product)}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ProductStatusBadge status={product.status} />
                        <span className="text-xs text-muted-foreground">{formatDate(product.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-sm font-bold text-primary">{formatPrice(product.priceCDF)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/dashboard/products/${product.id}`}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                    >
                      {isEditable ? 'Modifier' : 'Voir'}
                    </Link>
                    {isSubmittable && (
                      <button
                        onClick={() => handleSubmit(product.id)}
                        disabled={submittingId === product.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {submittingId === product.id ? '...' : 'Soumettre'}
                      </button>
                    )}
                    {isWithdrawable && (
                      <button
                        onClick={() => handleWithdraw(product.id)}
                        disabled={busyId === product.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                      >
                        {busyId === product.id ? '...' : 'Retirer'}
                      </button>
                    )}
                    {isRestorable && (
                      <button
                        onClick={() => handleRestore(product.id)}
                        disabled={busyId === product.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {busyId === product.id ? '...' : 'Restaurer'}
                      </button>
                    )}
                    {isDuplicable && (
                      <button
                        onClick={() => handleDuplicate(product.id)}
                        disabled={busyId === product.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                      >
                        {busyId === product.id ? '...' : 'Dupliquer'}
                      </button>
                    )}
                    {isArchivable && (
                      <button
                        onClick={() => handleArchive(product.id)}
                        disabled={archivingId === product.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                      >
                        {archivingId === product.id ? '...' : 'Archiver'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Product table */}
          <div className="hidden md:block bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground w-16" />
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nom</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Prix</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const thumbUrl = getThumbUrl(product);
                    const isEditable = product.status === 'DRAFT' || product.status === 'REJECTED';
                    const isSubmittable = product.status === 'DRAFT';
                    const isArchivable =
                      product.status !== 'ARCHIVED' && product.status !== 'SUSPENDED';
                    const isWithdrawable = product.status === 'PENDING_REVIEW';
                    const isRestorable = product.status === 'ARCHIVED';
                    // Suspended products are an admin takedown — seller can't act
                    // beyond duplicating into a fresh draft.
                    const isDuplicable = product.status !== 'SUSPENDED';

                    return (
                      <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt=""
                              className="w-10 h-10 rounded object-cover bg-muted"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
                              --
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-foreground">{getProductTitle(product)}</span>
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {formatPrice(product.priceCDF)}
                        </td>
                        <td className="px-4 py-3">
                          <ProductStatusBadge status={product.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(product.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/dashboard/products/${product.id}`}
                              className="px-2.5 py-1 text-xs font-medium rounded border border-border text-foreground hover:bg-muted transition-colors"
                            >
                              {isEditable ? 'Modifier' : 'Voir'}
                            </Link>
                            {isSubmittable && (
                              <button
                                onClick={() => handleSubmit(product.id)}
                                disabled={submittingId === product.id}
                                className="px-2.5 py-1 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                              >
                                {submittingId === product.id ? '...' : 'Soumettre'}
                              </button>
                            )}
                            {isWithdrawable && (
                              <button
                                onClick={() => handleWithdraw(product.id)}
                                disabled={busyId === product.id}
                                className="px-2.5 py-1 text-xs font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                              >
                                {busyId === product.id ? '...' : 'Retirer'}
                              </button>
                            )}
                            {isRestorable && (
                              <button
                                onClick={() => handleRestore(product.id)}
                                disabled={busyId === product.id}
                                className="px-2.5 py-1 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                              >
                                {busyId === product.id ? '...' : 'Restaurer'}
                              </button>
                            )}
                            {isDuplicable && (
                              <button
                                onClick={() => handleDuplicate(product.id)}
                                disabled={busyId === product.id}
                                className="px-2.5 py-1 text-xs font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                              >
                                {busyId === product.id ? '...' : 'Dupliquer'}
                              </button>
                            )}
                            {isArchivable && (
                              <button
                                onClick={() => handleArchive(product.id)}
                                disabled={archivingId === product.id}
                                className="px-2.5 py-1 text-xs font-medium rounded border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                              >
                                {archivingId === product.id ? '...' : 'Archiver'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Précédent
              </button>
              <span className="text-sm text-muted-foreground">
                {`Page ${page} sur ${totalPages}`}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
