'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { apiFetch } from '@/lib/api-client';
import { formatCDF } from '@/lib/format';
import type { Order, PaymentStatus } from '@/lib/types';

const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type PageStatus = 'polling' | 'confirmed' | 'failed' | 'timeout';

export default function PaymentPendingPage() {
  const t = useTranslations('PaymentPending');
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutGroupId = searchParams.get('group');

  const [pageStatus, setPageStatus] = useState<PageStatus>('polling');
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Load initial orders from session storage (order IDs saved during checkout)
  const loadOrders = useCallback(async () => {
    try {
      const raw = sessionStorage.getItem('teka_checkout_order_ids');
      if (!raw) {
        // Fallback: if we have a checkoutGroupId, try fetching from API
        if (checkoutGroupId) {
          const res = await apiFetch<{ data: Order[]; meta: unknown }>(
            `/v1/orders?checkoutGroupId=${encodeURIComponent(checkoutGroupId)}&limit=20`,
          );
          // The response data is the orders array
          const fetchedOrders = Array.isArray(res.data) ? res.data : [];
          setOrders(fetchedOrders);
          return;
        }
        return;
      }

      const orderIds: string[] = JSON.parse(raw);
      if (!Array.isArray(orderIds) || orderIds.length === 0) return;

      // Fetch each order
      const fetched = await Promise.all(
        orderIds.map(async (id) => {
          try {
            const res = await apiFetch<Order>(`/v1/orders/${id}`);
            return res.data;
          } catch {
            return null;
          }
        }),
      );

      setOrders(fetched.filter((o): o is Order => o !== null));
    } catch {
      // silently fail
    } finally {
      setIsLoadingOrders(false);
    }
  }, [checkoutGroupId]);

  // Check payment status of all orders
  const checkPaymentStatus = useCallback(async () => {
    if (orders.length === 0) return;

    try {
      const updated = await Promise.all(
        orders.map(async (order) => {
          try {
            const res = await apiFetch<Order>(`/v1/orders/${order.id}`);
            return res.data;
          } catch {
            return order;
          }
        }),
      );

      setOrders(updated);

      // Check if all payments are completed
      const allCompleted = updated.every(
        (o) => o.paymentStatus === 'COMPLETED',
      );
      const anyFailed = updated.some(
        (o) => o.paymentStatus === 'FAILED',
      );

      if (allCompleted) {
        setPageStatus('confirmed');
        clearTimers();
        // Auto-redirect after 2 seconds
        setTimeout(() => {
          // Restore order numbers for success page
          const orderNumbers = updated.map((o) => o.orderNumber);
          sessionStorage.setItem('teka_checkout_orders', JSON.stringify(orderNumbers));
          router.push('/checkout/success');
        }, 2000);
      } else if (anyFailed) {
        setPageStatus('failed');
        clearTimers();
      }
    } catch {
      // Continue polling on error
    }
  }, [orders, router]);

  function clearTimers() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  }

  // Initial load
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Start polling and timeout once orders are loaded
  useEffect(() => {
    if (isLoadingOrders || orders.length === 0 || pageStatus !== 'polling') return;

    // Set up polling
    pollTimerRef.current = setInterval(() => {
      checkPaymentStatus();
    }, POLL_INTERVAL_MS);

    // Set up timeout
    const elapsed = Date.now() - startTimeRef.current;
    const remaining = Math.max(0, TIMEOUT_MS - elapsed);
    timeoutTimerRef.current = setTimeout(() => {
      setPageStatus('timeout');
      clearTimers();
    }, remaining);

    return () => {
      clearTimers();
    };
  }, [isLoadingOrders, orders.length, pageStatus, checkPaymentStatus]);

  // Compute total across all orders
  const totalCDF = orders.reduce(
    (sum, o) => sum + BigInt(o.totalCDF || '0'),
    BigInt(0),
  );

  function handleRetry() {
    setPageStatus('polling');
    startTimeRef.current = Date.now();
    checkPaymentStatus();
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="text-center max-w-md w-full">
          {/* Polling state */}
          {pageStatus === 'polling' && (
            <>
              {/* Animated spinner */}
              <div className="mx-auto w-20 h-20 mb-6 relative">
                <div className="absolute inset-0 rounded-full border-4 border-muted" />
                <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                    />
                  </svg>
                </div>
              </div>

              <h1 className="text-2xl font-bold text-foreground mb-2">
                {t('title')}
              </h1>
              <p className="text-muted-foreground mb-6">
                {t('subtitle')}
              </p>

              {/* Instruction card */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
                <div className="flex gap-3">
                  <svg
                    className="w-6 h-6 text-amber-600 shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                    />
                  </svg>
                  <p className="text-sm text-amber-800">{t('instructions')}</p>
                </div>
              </div>

              {/* Order details */}
              {!isLoadingOrders && orders.length > 0 && (
                <div className="bg-white border border-border rounded-lg p-4 mb-6 text-left">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex justify-between items-center py-2 border-b border-border last:border-0"
                    >
                      <span className="text-sm text-muted-foreground">
                        {t('orderNumber')} #{order.orderNumber}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {formatCDF(order.totalCDF)}
                      </span>
                    </div>
                  ))}
                  {orders.length > 1 && (
                    <div className="flex justify-between items-center pt-3 mt-1 border-t border-border">
                      <span className="text-sm font-semibold text-foreground">
                        {t('total')}
                      </span>
                      <span className="text-sm font-bold text-primary">
                        {formatCDF(totalCDF.toString())}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Checking status indicator */}
              <p className="text-sm text-muted-foreground animate-pulse">
                {t('checkingStatus')}
              </p>
            </>
          )}

          {/* Confirmed state */}
          {pageStatus === 'confirmed' && (
            <>
              <div className="mx-auto w-20 h-20 mb-6 rounded-full bg-success/15 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-success"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              </div>

              <h1 className="text-2xl font-bold text-success mb-2">
                {t('paymentConfirmed')}
              </h1>
              <p className="text-muted-foreground">
                {t('redirecting')}
              </p>
            </>
          )}

          {/* Failed state */}
          {pageStatus === 'failed' && (
            <>
              <div className="mx-auto w-20 h-20 mb-6 rounded-full bg-destructive/15 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-destructive"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </div>

              <h1 className="text-2xl font-bold text-destructive mb-2">
                {t('paymentFailed')}
              </h1>

              {/* Order details */}
              {orders.length > 0 && (
                <div className="bg-white border border-border rounded-lg p-4 mb-6 text-left">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex justify-between items-center py-2 border-b border-border last:border-0"
                    >
                      <span className="text-sm text-muted-foreground">
                        {t('orderNumber')} #{order.orderNumber}
                      </span>
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleRetry}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  {t('retry')}
                </button>
                <Link
                  href="/orders"
                  className="px-6 py-3 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                >
                  {t('cancel')}
                </Link>
              </div>
            </>
          )}

          {/* Timeout state */}
          {pageStatus === 'timeout' && (
            <>
              <div className="mx-auto w-20 h-20 mb-6 rounded-full bg-amber-100 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-amber-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              </div>

              <h1 className="text-2xl font-bold text-foreground mb-2">
                {t('timeout')}
              </h1>
              <p className="text-muted-foreground mb-6">
                {t('timeoutMessage')}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleRetry}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  {t('retry')}
                </button>
                <Link
                  href="/orders"
                  className="px-6 py-3 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                >
                  {t('cancel')}
                </Link>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

/** Small inline payment status badge used on this page */
function PaymentStatusBadge({ status }: { status?: PaymentStatus }) {
  if (!status) return null;

  const styles: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-success/15 text-success',
    FAILED: 'bg-destructive/15 text-destructive',
    REFUNDED: 'bg-muted text-muted-foreground',
  };

  const labels: Record<string, string> = {
    PENDING: 'En attente',
    PROCESSING: 'En cours',
    COMPLETED: 'Payé',
    FAILED: 'Échoué',
    REFUNDED: 'Remboursé',
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-muted text-muted-foreground'}`}
    >
      {labels[status] || status}
    </span>
  );
}
