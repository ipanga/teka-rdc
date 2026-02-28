'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { OrderTimeline } from '@/components/orders/order-timeline';
import { apiFetch } from '@/lib/api-client';
import { formatCDF, getLocalizedName } from '@/lib/format';
import type { Order, PaymentStatus } from '@/lib/types';

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-CD' : 'fr-CD', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function OrderDetailPage() {
  const t = useTranslations('Orders');
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // Cancel dialog state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(false);

    apiFetch<Order>(`/v1/orders/${orderId}`)
      .then((res) => setOrder(res.data))
      .catch(() => setError(true))
      .finally(() => setIsLoading(false));
  }, [orderId]);

  async function handleCancel() {
    if (isCancelling) return;
    setIsCancelling(true);

    try {
      await apiFetch(`/v1/orders/${orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      setCancelSuccess(true);
      setShowCancelDialog(false);
      // Refresh the order
      const res = await apiFetch<Order>(`/v1/orders/${orderId}`);
      setOrder(res.data);
    } catch {
      // silently fail
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-6 w-full">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-48" />
            <div className="h-4 bg-muted rounded w-32" />
            <div className="h-32 bg-muted rounded" />
            <div className="h-48 bg-muted rounded" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <svg
              className="mx-auto w-16 h-16 text-muted-foreground mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-muted-foreground mb-4">{t('noOrders')}</p>
            <Link
              href="/orders"
              className="text-primary hover:underline font-medium"
            >
              {t('back')}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const sellerName = order.seller?.sellerProfile?.businessName
    || `${order.seller.firstName} ${order.seller.lastName}`;
  const canCancel = order.status === 'PENDING';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-6 w-full">
        {/* Back link */}
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('back')}
        </Link>

        {/* Order header */}
        <div className="bg-white border border-border rounded-lg p-4 md:p-6 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
            <h1 className="text-lg md:text-xl font-bold text-foreground">
              {t('orderNumber')} #{order.orderNumber}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('date')}: {formatDate(order.createdAt, locale)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t('seller')}: {sellerName}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t('paymentMethod')}: {order.paymentMethod === 'COD' ? t('cod') : t('mobileMoney')}
          </p>
          {order.paymentStatus && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-muted-foreground">{t('paymentStatus')}:</span>
              <OrderPaymentStatusBadge status={order.paymentStatus} />
            </div>
          )}
        </div>

        {/* Payment warning for Mobile Money with pending/failed status */}
        {order.paymentMethod === 'MOBILE_MONEY' &&
          (order.paymentStatus === 'PENDING' || order.paymentStatus === 'FAILED') && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
              <svg
                className="w-5 h-5 shrink-0 mt-0.5 text-amber-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
              <span>{t('paymentWarning')}</span>
            </div>
          )}

        {/* Cancel success feedback */}
        {cancelSuccess && (
          <div className="mb-4 p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('cancelSuccess')}
          </div>
        )}

        {/* Order items */}
        <div className="bg-white border border-border rounded-lg p-4 md:p-6 mb-4">
          <h2 className="text-base font-semibold text-foreground mb-4">
            {t('items')} ({t('itemCount', { count: order.items.length })})
          </h2>

          <div className="divide-y divide-border">
            {order.items.map((item) => {
              const title = getLocalizedName(item.productSnapshot.title, locale);
              const thumbUrl = item.productSnapshot.image?.thumbnailUrl || item.productSnapshot.image?.url;

              return (
                <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  {/* Image */}
                  <div className="relative w-14 h-14 md:w-16 md:h-16 bg-muted rounded-lg overflow-hidden shrink-0">
                    {thumbUrl ? (
                      <Image
                        src={thumbUrl}
                        alt={title}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-2">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatCDF(item.unitPriceCDF)} x {item.quantity}
                    </p>
                  </div>

                  {/* Line total */}
                  <p className="text-sm font-semibold text-foreground shrink-0">
                    {formatCDF(item.totalPriceCDF)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Price breakdown */}
        <div className="bg-white border border-border rounded-lg p-4 md:p-6 mb-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('subtotal')}</span>
              <span className="text-foreground">{formatCDF(order.subtotalCDF)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('deliveryFee')}</span>
              <span className="text-foreground">
                {BigInt(order.deliveryFeeCDF) > BigInt(0)
                  ? formatCDF(order.deliveryFeeCDF)
                  : t('free')}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-2">
              <span className="text-foreground">{t('total')}</span>
              <span className="text-primary">{formatCDF(order.totalCDF)}</span>
            </div>
          </div>
        </div>

        {/* Delivery address */}
        {order.deliveryAddress && (
          <div className="bg-white border border-border rounded-lg p-4 md:p-6 mb-4">
            <h2 className="text-base font-semibold text-foreground mb-3">
              {t('deliveryAddress')}
            </h2>
            <div className="text-sm text-muted-foreground space-y-0.5">
              <p className="font-medium text-foreground">{order.deliveryAddress.recipientName}</p>
              <p>{order.deliveryAddress.phone}</p>
              <p>
                {order.deliveryAddress.neighborhood}, {order.deliveryAddress.town}
                {order.deliveryAddress.avenue ? `, ${order.deliveryAddress.avenue}` : ''}
              </p>
              {order.deliveryAddress.details && (
                <p className="text-xs">{order.deliveryAddress.details}</p>
              )}
            </div>
          </div>
        )}

        {/* Status timeline */}
        {order.statusLogs && order.statusLogs.length > 0 && (
          <div className="bg-white border border-border rounded-lg p-4 md:p-6 mb-4">
            <OrderTimeline logs={order.statusLogs} />
          </div>
        )}

        {/* Buyer note */}
        {order.buyerNote && (
          <div className="bg-white border border-border rounded-lg p-4 md:p-6 mb-4">
            <h2 className="text-base font-semibold text-foreground mb-2">
              Note
            </h2>
            <p className="text-sm text-muted-foreground italic">{order.buyerNote}</p>
          </div>
        )}

        {/* Cancel button */}
        {canCancel && !cancelSuccess && (
          <div className="mb-4">
            <button
              onClick={() => setShowCancelDialog(true)}
              className="px-4 py-2 text-sm font-medium text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/5 transition-colors"
            >
              {t('cancelOrder')}
            </button>
          </div>
        )}

        {/* Cancel dialog */}
        {showCancelDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h3 className="text-base font-semibold text-foreground mb-2">
                {t('cancelOrder')}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('cancelConfirm')}
              </p>

              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('cancelReason')}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none mb-4"
              />

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowCancelDialog(false);
                    setCancelReason('');
                  }}
                  className="px-4 py-2 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                >
                  {t('back')}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isCancelling}
                  className="px-4 py-2 bg-destructive text-white rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isCancelling ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('cancelling')}
                    </span>
                  ) : (
                    t('cancel')
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

/** Payment status badge component */
function OrderPaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = useTranslations('Orders');

  const styles: Record<PaymentStatus, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    REFUNDED: 'bg-gray-100 text-gray-800',
  };

  const labelKeys: Record<PaymentStatus, string> = {
    PENDING: 'paymentPending',
    PROCESSING: 'paymentProcessing',
    COMPLETED: 'paymentCompleted',
    FAILED: 'paymentFailed',
    REFUNDED: 'paymentRefunded',
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}
    >
      {t(labelKeys[status] || 'paymentPending')}
    </span>
  );
}
