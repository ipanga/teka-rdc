'use client';

import { formatFC } from '@teka/shared';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';

interface OrderItem {
  id: string;
  quantity: number;
  unitPriceCDF: string;
  totalPriceCDF: string;
  product: {
    id: string;
    title: string;
  };
}

interface OrderBuyer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalCDF: string;
  deliveryFeeCDF: string;
  itemsCount: number;
  paymentMethod?: string;
  paymentStatus?: string;
  buyer: OrderBuyer;
  items: OrderItem[];
  createdAt: string;
}

interface OrdersResponse {
  orders: Order[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

type StatusFilter =
  | ''
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

const LIMIT = 20;

export default function OrdersListPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadOrders = useCallback(async () => {
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
      const res = await apiFetch<OrdersResponse>(`/v1/sellers/orders?${params}`);
      setOrders(res.data.orders || []);
      setTotalPages(res.data.meta?.totalPages ?? 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Erreur lors du chargement des commandes");
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleFilterChange = (newFilter: StatusFilter) => {
    setStatusFilter(newFilter);
    setPage(1);
  };

  const handleAction = async (orderId: string, action: string, body?: object) => {
    setActionLoadingId(orderId);
    try {
      await apiFetch(`/v1/sellers/orders/${orderId}/${action}`, {
        method: 'PATCH',
        body: body ? JSON.stringify(body) : undefined,
      });
      loadOrders();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirm = (orderId: string) => {
    if (!confirm("Voulez-vous confirmer cette commande ?")) return;
    handleAction(orderId, 'confirm');
  };

  const handleRejectSubmit = () => {
    if (!rejectingOrderId || !rejectReason.trim()) return;
    handleAction(rejectingOrderId, 'reject', { reason: rejectReason.trim() });
    setRejectingOrderId(null);
    setRejectReason('');
  };

  const handleProcess = (orderId: string) => {
    handleAction(orderId, 'process');
  };

  const handleShip = (orderId: string) => {
    handleAction(orderId, 'ship');
  };

  const handleOutForDelivery = (orderId: string) => {
    handleAction(orderId, 'out-for-delivery');
  };

  const handleDeliver = (orderId: string) => {
    handleAction(orderId, 'deliver');
  };

  const formatPrice = (centimes: string) => formatFC(centimes);

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat('fr-CD', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
  };

  const getPaymentMethodLabel = (method?: string) => {
    switch (method) {
      case 'MOBILE_MONEY':
        return "Mobile Money";
      case 'CASH_ON_DELIVERY':
        return "Paiement à la livraison";
      default:
        return method || '---';
    }
  };

  const getPaymentStatusBadge = (status?: string) => {
    switch (status) {
      case 'COMPLETED':
        return { label: "Payé", style: 'bg-success/15 text-success' };
      case 'FAILED':
        return { label: "Échoué", style: 'bg-destructive/15 text-destructive' };
      case 'PENDING':
      default:
        return { label: "En attente", style: 'bg-warning/15 text-warning' };
    }
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: '', label: "Toutes" },
    { key: 'PENDING', label: "En attente" },
    { key: 'CONFIRMED', label: "Confirmées" },
    { key: 'PROCESSING', label: "En préparation" },
    { key: 'SHIPPED', label: "Expédiées" },
    { key: 'DELIVERED', label: "Livrées" },
    { key: 'CANCELLED', label: "Annulées" },
  ];

  const renderActions = (order: Order) => {
    const isLoading = actionLoadingId === order.id;
    const btnBase = 'px-2.5 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50';

    switch (order.status) {
      case 'PENDING':
        return (
          <>
            <button
              onClick={() => handleConfirm(order.id)}
              disabled={isLoading}
              className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              {isLoading ? '...' : 'Confirmer'}
            </button>
            <button
              onClick={() => {
                setRejectingOrderId(order.id);
                setRejectReason('');
              }}
              disabled={isLoading}
              className={`${btnBase} border border-destructive/30 text-destructive hover:bg-destructive/10`}
            >
              Rejeter
            </button>
          </>
        );
      case 'CONFIRMED':
        return (
          <button
            onClick={() => handleProcess(order.id)}
            disabled={isLoading}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {isLoading ? '...' : 'Préparer'}
          </button>
        );
      case 'PROCESSING':
        return (
          <button
            onClick={() => handleShip(order.id)}
            disabled={isLoading}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {isLoading ? '...' : 'Expédier'}
          </button>
        );
      case 'SHIPPED':
        return (
          <>
            <button
              onClick={() => handleOutForDelivery(order.id)}
              disabled={isLoading}
              className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              {isLoading ? '...' : 'En livraison'}
            </button>
            <button
              onClick={() => handleDeliver(order.id)}
              disabled={isLoading}
              className={`${btnBase} border border-border text-foreground hover:bg-muted`}
            >
              {isLoading ? '...' : 'Livrer'}
            </button>
          </>
        );
      case 'OUT_FOR_DELIVERY':
        return (
          <button
            onClick={() => handleDeliver(order.id)}
            disabled={isLoading}
            className={`${btnBase} bg-success text-white hover:bg-success/90`}
          >
            {isLoading ? '...' : 'Livrer'}
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Commandes</h1>
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

      {/* Reject modal */}
      {rejectingOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-4">Rejeter</h3>
            <label className="block text-sm font-medium text-foreground mb-1">
              Raison du rejet
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Expliquez la raison du rejet..."
              rows={4}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setRejectingOrderId(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectReason.trim() || actionLoadingId === rejectingOrderId}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {actionLoadingId === rejectingOrderId ? '...' : 'Rejeter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-border p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground">Aucune commande</p>
        </div>
      ) : (
        <>
          {/* Mobile order cards */}
          <div className="md:hidden space-y-3">
            {orders.map((order) => {
              const paymentBadge = getPaymentStatusBadge(order.paymentStatus);
              return (
                <article key={order.id} className="bg-white rounded-xl border border-border p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Acheteur</p>
                      <p className="font-medium text-foreground truncate">
                        {order.buyer?.firstName} {order.buyer?.lastName}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-bold text-foreground">{formatPrice(order.totalCDF)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Articles</p>
                      <p className="font-medium text-foreground">{order.itemsCount ?? order.items?.length ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Paiement</p>
                      <span className={`inline-flex mt-1 items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${paymentBadge.style}`}>
                        {paymentBadge.label}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {getPaymentMethodLabel(order.paymentMethod)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {renderActions(order)}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Orders table */}
          <div className="hidden md:block bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">N° commande</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Acheteur</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Articles</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Total</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mode de paiement</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut du paiement</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/orders/${order.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {order.buyer?.firstName} {order.buyer?.lastName}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {order.itemsCount ?? order.items?.length ?? 0}
                      </td>
                      <td className="px-4 py-3 text-foreground font-medium">
                        {formatPrice(order.totalCDF)}
                      </td>
                      <td className="px-4 py-3 text-foreground text-xs">
                        {getPaymentMethodLabel(order.paymentMethod)}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const badge = getPaymentStatusBadge(order.paymentStatus);
                          return (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.style}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {renderActions(order)}
                        </div>
                      </td>
                    </tr>
                  ))}
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
