'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { apiFetch } from '@/lib/api-client';
import { formatCDF } from '@/lib/format';
import type { Order, OrderStatus, PaginatedOrders } from '@/lib/types';

type FilterStatus = 'ALL' | OrderStatus;

const STATUS_TABS: { key: FilterStatus; labelKey: string }[] = [
  { key: 'ALL', labelKey: 'all' },
  { key: 'PENDING', labelKey: 'pending' },
  { key: 'CONFIRMED', labelKey: 'confirmed' },
  { key: 'SHIPPED', labelKey: 'shipped' },
  { key: 'DELIVERED', labelKey: 'delivered' },
  { key: 'CANCELLED', labelKey: 'cancelled' },
];

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('fr-CD', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function OrdersPage() {
  const t = useTranslations('Orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (activeFilter !== 'ALL') {
        params.set('status', activeFilter);
      }

      const res = await apiFetch<PaginatedOrders>(`/v1/orders?${params.toString()}`);
      setOrders(res.data.data);
      setTotal(res.data.meta.total);
    } catch {
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, activeFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  function handleFilterChange(status: FilterStatus) {
    setActiveFilter(status);
    setPage(1);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-6 w-full">
        <h1 className="text-xl md:text-2xl font-bold text-foreground mb-6">
          {t('title')}
        </h1>

        {/* Status filter tabs */}
        <div className="flex gap-1 overflow-x-auto pb-3 mb-6 -mx-4 px-4 md:mx-0 md:px-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleFilterChange(tab.key)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeFilter === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-white border border-border rounded-lg p-4">
                <div className="flex justify-between mb-3">
                  <div className="h-4 bg-muted rounded w-32" />
                  <div className="h-5 bg-muted rounded w-20" />
                </div>
                <div className="h-4 bg-muted rounded w-48 mb-2" />
                <div className="h-4 bg-muted rounded w-24" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16">
            <svg
              className="w-20 h-20 text-muted-foreground/50 mb-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
              />
            </svg>
            <p className="text-muted-foreground mb-4">{t('noOrders')}</p>
            <Link
              href="/categories"
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t('browseProducts')}
            </Link>
          </div>
        ) : (
          /* Order cards */
          <div className="space-y-4">
            {orders.map((order) => {
              const itemCount = order.items.length;
              const sellerName = order.seller?.sellerProfile?.businessName
                || `${order.seller.firstName} ${order.seller.lastName}`;

              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="block bg-white border border-border rounded-lg p-4 hover:border-primary/30 transition-colors"
                >
                  {/* Top row: order number + status */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-sm font-semibold text-foreground">
                        {t('orderNumber')} #{order.orderNumber}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>

                  {/* Seller + item count */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                    <span>
                      {t('seller')}: {sellerName}
                    </span>
                    <span>
                      {t('itemCount', { count: itemCount })}
                    </span>
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-sm text-muted-foreground">{t('total')}</span>
                    <span className="text-sm font-bold text-primary">
                      {formatCDF(order.totalCDF)}
                    </span>
                  </div>
                </Link>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
