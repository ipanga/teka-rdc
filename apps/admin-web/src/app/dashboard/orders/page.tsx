'use client';

import { formatFC } from '@teka/shared';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { PageHeader } from '@/components/ui/page-header';

interface OrderBuyer {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone: string | null;
}

interface OrderSeller {
  id: string;
  businessName: string;
}

interface Order {
  id: string;
  orderNumber: string;
  totalCDF: string;
  totalUSD?: string | null;
  status: string;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  itemsCount: number;
  createdAt: string;
  buyer?: OrderBuyer | null;
  seller?: OrderSeller | null;
}

interface PaginatedResponse {
  data: Order[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const STATUS_FILTERS = [
  '',
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_TEKA_PICKUP',
  'RECEIVED_AT_TEKA',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
];

const STATUS_LABEL_KEYS: Record<string, string> = {
  '': 'Toutes',
  PENDING: 'En attente',
  CONFIRMED: 'Confirmées',
  PROCESSING: 'En préparation',
  READY_FOR_TEKA_PICKUP: 'Prêtes pour collecte',
  RECEIVED_AT_TEKA: 'Reçues par Teka',
  SHIPPED: 'Expédiées (ancien)',
  OUT_FOR_DELIVERY: 'En livraison',
  DELIVERED: 'Livrées',
  CANCELLED: 'Annulées',
  RETURNED: 'Retournées',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [queryReady, setQueryReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchOrders = useCallback(async () => {
    if (!queryReady) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/orders?${params}`);
      const rd = res.data;
      if (Array.isArray(rd)) { setOrders(rd); setTotalPages(1); }
      else { setOrders(rd.data); setTotalPages(rd.pagination?.totalPages ?? 1); }
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, search, dateFrom, dateTo, queryReady]);

  // Honor a `?status=` deep-link on mount (dashboard "Opérations commandes"
  // cards). Read from window to avoid a Suspense-boundary requirement.
  useEffect(() => {
    const valid = [
      'PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_TEKA_PICKUP',
      'RECEIVED_AT_TEKA', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED',
      'CANCELLED', 'RETURNED',
    ];
    const fromUrl = new URLSearchParams(window.location.search).get('status');
    if (fromUrl && valid.includes(fromUrl)) {
      setStatusFilter(fromUrl);
    }
    setQueryReady(true);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrders();
  };

  const formatCDF = (centimes: string) => formatFC(centimes);

  const selectStatus = (status: string) => {
    setStatusFilter(status);
    setPage(1);
    const url = new URL(window.location.href);
    if (status) url.searchParams.set('status', status);
    else url.searchParams.delete('status');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  };

  return (
    <div className="admin-page">
      <PageHeader eyebrow="Opérations" title="Commandes" description="Suivez le cycle de traitement, la collecte Teka et la livraison." />

      {/* Status filter tabs */}
      <div className="admin-filter-bar" role="group" aria-label="Filtrer les commandes par statut">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            onClick={() => selectStatus(status)}
            aria-pressed={statusFilter === status}
            className={`admin-filter ${
              statusFilter === status
                ? 'admin-filter-active'
                : ''
            }`}
          >
            {STATUS_LABEL_KEYS[status]}
          </button>
        ))}
      </div>

      {/* Search & date filters */}
      <form onSubmit={handleSearch} className="admin-card grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_220px_auto] xl:items-end">
          <label className="text-sm font-medium text-foreground">Rechercher
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° de commande…" className="mt-2 min-h-11 w-full rounded-lg border border-input bg-white px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm font-medium text-foreground">Date début
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="mt-2 min-h-11 w-full rounded-lg border border-input bg-white px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="text-sm font-medium text-foreground">Date fin
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="mt-2 min-h-11 w-full rounded-lg border border-input bg-white px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <button type="submit" className="admin-button-primary">Rechercher</button>
      </form>

      {/* Orders table */}
      {loadError && orders.length === 0 ? (
        <div className="admin-card p-8 text-center" role="alert"><h2 className="font-semibold text-foreground">Impossible de charger les commandes</h2><p className="mt-2 text-sm text-muted-foreground">Vérifiez la connexion puis réessayez.</p><button type="button" onClick={fetchOrders} className="admin-button-secondary mt-5">Réessayer</button></div>
      ) : (
      <div className="admin-card overflow-x-auto">
        <table className="w-full min-w-[1180px]">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                N° commande
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Date
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Acheteur
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Vendeur
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Articles
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Total
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Mode de paiement
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                Statut paiement
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
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  Chargement...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  {statusFilter || search || dateFrom || dateTo ? 'Aucune commande ne correspond à ces critères' : 'Aucune commande pour le moment'}
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {order.orderNumber}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(order.createdAt).toLocaleDateString('fr-CD')}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {order.buyer
                      ? `${order.buyer.firstName || ''} ${order.buyer.lastName || ''}`.trim() || order.buyer.phone || '—'
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {order.seller?.businessName || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground text-center">
                    {order.itemsCount}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                    {formatCDF(order.totalCDF)}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {order.paymentMethod || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {order.paymentStatus || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="px-2.5 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                    >
                      Voir
                    </Link>
                  </td>
                </tr>
              ))
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
    </div>
  );
}
