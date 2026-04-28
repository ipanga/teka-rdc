'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';

interface OrderItemProduct {
  id: string;
  title: string;
  images: { id: string; url: string; order: number }[];
}

interface OrderItem {
  id: string;
  quantity: number;
  unitPriceCDF: string;
  totalPriceCDF: string;
  product: OrderItemProduct;
}

interface OrderBuyer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

interface DeliveryAddress {
  id: string;
  recipientName: string;
  phone: string;
  province: string;
  town: string;
  neighborhood: string;
  avenue?: string;
  details?: string;
}

interface StatusLog {
  id: string;
  status: string;
  note?: string;
  createdAt: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalCDF: string;
  subtotalCDF: string;
  deliveryFeeCDF: string;
  paymentMethod?: string;
  paymentStatus?: string;
  buyerNote?: string;
  buyer: OrderBuyer;
  deliveryAddress: DeliveryAddress;
  items: OrderItem[];
  statusLogs: StatusLog[];
  createdAt: string;
}

export default function OrderDetailPage() {
  const t = useTranslations('Orders');
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const loadOrder = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiFetch<OrderDetail>(`/v1/sellers/orders/${orderId}`);
      setOrder(res.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('errorLoading'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleAction = async (action: string, body?: object) => {
    setActionLoading(true);
    try {
      await apiFetch(`/v1/sellers/orders/${orderId}/${action}`, {
        method: 'PATCH',
        body: body ? JSON.stringify(body) : undefined,
      });
      loadOrder();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!confirm(t('confirmAction'))) return;
    handleAction('confirm');
  };

  const handleRejectSubmit = () => {
    if (!rejectReason.trim()) return;
    handleAction('reject', { reason: rejectReason.trim() });
    setShowRejectModal(false);
    setRejectReason('');
  };

  const handleProcess = () => handleAction('process');
  const handleShip = () => handleAction('ship');
  const handleOutForDelivery = () => handleAction('out-for-delivery');
  const handleDeliver = () => handleAction('deliver');

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

  const formatDateTime = (dateStr: string) => {
    return new Intl.DateTimeFormat('fr-CD', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  };

  const getProductTitle = (product: OrderItemProduct) => {
    return product?.title || '---';
  };

  const getThumbUrl = (product: OrderItemProduct) => {
    if (!product?.images || product.images.length === 0) return null;
    const sorted = [...product.images].sort((a, b) => a.order - b.order);
    const url = sorted[0].url;
    return url.replace('/upload/', '/upload/w_60,h_60,c_fill/');
  };

  const renderActions = () => {
    if (!order) return null;
    const btnBase = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50';

    switch (order.status) {
      case 'PENDING':
        return (
          <div className="flex items-center gap-3">
            <button
              onClick={handleConfirm}
              disabled={actionLoading}
              className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              {actionLoading ? '...' : t('confirm')}
            </button>
            <button
              onClick={() => {
                setShowRejectModal(true);
                setRejectReason('');
              }}
              disabled={actionLoading}
              className={`${btnBase} border border-destructive/30 text-destructive hover:bg-destructive/10`}
            >
              {t('reject')}
            </button>
          </div>
        );
      case 'CONFIRMED':
        return (
          <button
            onClick={handleProcess}
            disabled={actionLoading}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {actionLoading ? '...' : t('process')}
          </button>
        );
      case 'PROCESSING':
        return (
          <button
            onClick={handleShip}
            disabled={actionLoading}
            className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {actionLoading ? '...' : t('ship')}
          </button>
        );
      case 'SHIPPED':
        return (
          <div className="flex items-center gap-3">
            <button
              onClick={handleOutForDelivery}
              disabled={actionLoading}
              className={`${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              {actionLoading ? '...' : t('outForDelivery')}
            </button>
            <button
              onClick={handleDeliver}
              disabled={actionLoading}
              className={`${btnBase} border border-border text-foreground hover:bg-muted`}
            >
              {actionLoading ? '...' : t('deliver')}
            </button>
          </div>
        );
      case 'OUT_FOR_DELIVERY':
        return (
          <button
            onClick={handleDeliver}
            disabled={actionLoading}
            className={`${btnBase} bg-success text-white hover:bg-success/90`}
          >
            {actionLoading ? '...' : t('deliver')}
          </button>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="bg-white rounded-xl border border-border p-6 animate-pulse space-y-4">
          <div className="h-5 bg-muted rounded w-1/4" />
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div>
        <Link
          href="/dashboard/orders"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          &larr; {t('backToOrders')}
        </Link>
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/dashboard/orders"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        &larr; {t('backToOrders')}
      </Link>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Order header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t('orderNumber')} {order.orderNumber}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={order.status} />
          {renderActions()}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: items + summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items table */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{t('items')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground w-16" />
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('product')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('quantity')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('unitPrice')}</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => {
                    const thumbUrl = getThumbUrl(item.product);
                    return (
                      <tr key={item.id} className="border-b border-border last:border-0">
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
                        <td className="px-4 py-3 font-medium text-foreground">
                          {getProductTitle(item.product)}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {formatPrice(item.unitPriceCDF)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">
                          {formatPrice(item.totalPriceCDF)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Price summary */}
            <div className="px-6 py-4 border-t border-border bg-muted/30">
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center justify-between w-full max-w-xs text-sm">
                  <span className="text-muted-foreground">{t('subtotal')}</span>
                  <span className="text-foreground">{formatPrice(order.subtotalCDF)}</span>
                </div>
                <div className="flex items-center justify-between w-full max-w-xs text-sm">
                  <span className="text-muted-foreground">{t('deliveryFee')}</span>
                  <span className="text-foreground">{formatPrice(order.deliveryFeeCDF)}</span>
                </div>
                <div className="flex items-center justify-between w-full max-w-xs text-sm font-semibold border-t border-border pt-1 mt-1">
                  <span className="text-foreground">{t('total')}</span>
                  <span className="text-foreground">{formatPrice(order.totalCDF)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Status timeline */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{t('timeline')}</h2>
            </div>
            <div className="p-6">
              {order.statusLogs && order.statusLogs.length > 0 ? (
                <div className="relative">
                  <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-4">
                    {order.statusLogs.map((log, index) => (
                      <div key={log.id} className="flex items-start gap-4 relative">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${
                            index === 0
                              ? 'bg-primary text-white'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${index === 0 ? 'bg-white' : 'bg-muted-foreground/50'}`} />
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-center gap-2">
                            <OrderStatusBadge status={log.status} />
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(log.createdAt)}
                            </span>
                          </div>
                          {log.note && (
                            <p className="text-sm text-muted-foreground mt-1">{log.note}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('noTimeline')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right column: buyer info + delivery address + notes */}
        <div className="space-y-6">
          {/* Buyer info */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{t('buyer')}</h2>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {order.buyer?.firstName} {order.buyer?.lastName}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('phone')}</p>
                <p className="text-sm text-foreground">{order.buyer?.phone}</p>
              </div>
            </div>
          </div>

          {/* Delivery address */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{t('deliveryAddress')}</h2>
            </div>
            <div className="p-6">
              {order.deliveryAddress ? (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-foreground">{order.deliveryAddress.recipientName}</p>
                  <p className="text-muted-foreground">{order.deliveryAddress.phone}</p>
                  <p className="text-foreground">
                    {order.deliveryAddress.neighborhood}
                    {order.deliveryAddress.avenue ? `, ${order.deliveryAddress.avenue}` : ''}
                  </p>
                  <p className="text-foreground">
                    {order.deliveryAddress.town}, {order.deliveryAddress.province}
                  </p>
                  {order.deliveryAddress.details && (
                    <p className="text-muted-foreground mt-2">{order.deliveryAddress.details}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">---</p>
              )}
            </div>
          </div>

          {/* Payment info */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{t('paymentMethod')}</h2>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">{t('paymentMethod')}</p>
                <p className="text-sm font-medium text-foreground">
                  {order.paymentMethod === 'MOBILE_MONEY'
                    ? t('mobileMoney')
                    : order.paymentMethod === 'CASH_ON_DELIVERY'
                      ? t('cod')
                      : order.paymentMethod || '---'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('paymentStatus')}</p>
                <p className="text-sm">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      order.paymentStatus === 'COMPLETED'
                        ? 'bg-success/15 text-success'
                        : order.paymentStatus === 'FAILED'
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-warning/15 text-warning'
                    }`}
                  >
                    {order.paymentStatus === 'COMPLETED'
                      ? t('paymentCompleted')
                      : order.paymentStatus === 'FAILED'
                        ? t('paymentFailed')
                        : t('paymentPending')}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Buyer note */}
          {order.buyerNote && (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">{t('buyerNote')}</h2>
              </div>
              <div className="p-6">
                <p className="text-sm text-foreground">{order.buyerNote}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject modal */}
      {showRejectModal && (
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
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectReason.trim() || actionLoading}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? '...' : t('reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
