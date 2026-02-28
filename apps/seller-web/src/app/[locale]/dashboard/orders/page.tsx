'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';

interface OrderItem {
  id: string;
  quantity: number;
  unitPriceCDF: string;
  totalPriceCDF: string;
  product: {
    id: string;
    title: { fr?: string; en?: string };
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
  const t = useTranslations('Orders');
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
        setError(t('errorLoading'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, t]);

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
    if (!confirm(t('confirmAction'))) return;
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

  const getPaymentMethodLabel = (method?: string) => {
    switch (method) {
      case 'MOBILE_MONEY':
        return t('mobileMoney');
      case 'CASH_ON_DELIVERY':
        return t('cod');
      default:
        return method || '---';
    }
  };

  const getPaymentStatusBadge = (status?: string) => {
    switch (status) {
      case 'COMPLETED':
        return { label: t('paymentCompleted'), style: 'bg-success/15 text-success' };
      case 'FAILED':
        return { label: t('paymentFailed'), style: 'bg-destructive/15 text-destructive' };
      case 'PENDING':
      default:
        return { label: t('paymentPending'), style: 'bg-warning/15 text-warning' };
    }
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: '', label: t('all') },
    { key: 'PENDING', label: t('pending') },
    { key: 'CONFIRMED', label: t('confirmed') },
    { key: 'PROCESSING', label: t('processing') },
    { key: 'SHIPPED', label: t('shipped') },
    { key: 'DELIVERED', label: t('delivered') },
    { key: 'CANCELLED', label: t('cancelled') },
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
              {isLoading ? '...' : t('confirm')}
            </button>
            <button
              onClick={() => {
                setRejectingOrderId(order.id);
                setRejectReason('');
              }}
              disabled={isLoading}
              className={`${btnBase} border border-destructive/30 text-destructive hover:bg-destructive/10`}
            >
              {t('reject')}
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
            {isLoading ? '...' : t('process')}
          </button>
        );
      case 'PROCESSING':
        return (
          <button
            onClick={() => handleShip(order.id)}
            disabled={isLoading}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {isLoading ? '...' : t('ship')}
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
              {isLoading ? '...' : t('outForDelivery')}
            </button>
            <button
              onClick={() => handleDeliver(order.id)}
              disabled={isLoading}
              className={`${btnBase} border border-border text-foreground hover:bg-muted`}
            >
              {isLoading ? '...' : t('deliver')}
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
            {isLoading ? '...' : t('deliver')}
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
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
            <h3 className="text-lg font-semibold text-foreground mb-4">{t('reject')}</h3>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('rejectReason')}
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('rejectPlaceholder')}
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
                {t('cancel')}
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectReason.trim() || actionLoadingId === rejectingOrderId}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {actionLoadingId === rejectingOrderId ? '...' : t('reject')}
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
          <p className="text-muted-foreground">{t('noOrders')}</p>
        </div>
      ) : (
        <>
          {/* Orders table */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('orderNumber')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('date')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('buyer')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('items')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('total')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('paymentMethod')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('paymentStatus')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('status')}</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('actions')}</th>
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
                {t('previousPage')}
              </button>
              <span className="text-sm text-muted-foreground">
                {t('pageOf', { page, total: totalPages })}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('nextPage')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
