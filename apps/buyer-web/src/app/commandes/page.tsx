'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { apiFetch } from '@/lib/api-client';
import { formatCDF } from '@/lib/format';
import { Card, Container, buttonVariants, cn } from '@/components/ui';
import type { Order, OrderStatus, PaginatedOrders } from '@/lib/types';

type FilterStatus = 'ALL' | OrderStatus;

const STATUS_TABS: { key: FilterStatus; label: string }[] = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'PENDING', label: 'En attente' },
  { key: 'CONFIRMED', label: 'Confirmées' },
  { key: 'SHIPPED', label: 'Expédiées' },
  { key: 'DELIVERED', label: 'Livrées' },
  { key: 'CANCELLED', label: 'Annulées' },
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
      setTotal(res.data.pagination.total);
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
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1">
        <Container className="py-6 md:py-10 max-w-4xl">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-6">
            {"Mes commandes"}
          </h1>

          {/* Status filter tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-3 mb-6 -mx-4 px-4 md:mx-0 md:px-0">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleFilterChange(tab.key)}
                className={cn(
                  'shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all',
                  activeFilter === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-hover border border-border',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Loading skeleton */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} padding="sm" className="animate-pulse">
                  <div className="flex justify-between mb-3">
                    <div className="h-4 bg-muted rounded w-32" />
                    <div className="h-5 bg-muted rounded w-20" />
                  </div>
                  <div className="h-4 bg-muted rounded w-48 mb-2" />
                  <div className="h-4 bg-muted rounded w-24" />
                </Card>
              ))}
            </div>
          ) : orders.length === 0 ? (
            /* Empty state */
            <Card padding="lg" className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-surface-muted mb-4">
                <svg
                  className="w-10 h-10 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
                  />
                </svg>
              </div>
              <p className="text-muted-foreground mb-5">{"Vous n'avez aucune commande"}</p>
              <Link
                href="/categories"
                className={buttonVariants({ variant: 'default', size: 'lg' })}
              >
                {"Découvrir nos produits"}
              </Link>
            </Card>
          ) : (
            /* Order cards */
            <div className="space-y-3">
              {orders.map((order) => {
                const itemCount = order.items.length;
                const sellerName =
                  order.seller?.sellerProfile?.businessName ||
                  `${order.seller.firstName} ${order.seller.lastName}`;

                return (
                  <Link key={order.id} href={`/commandes/${order.id}`} className="block group">
                    <Card padding="sm" hover="lift">
                      {/* Top row: order number + status */}
                      <div className="flex items-center justify-between mb-3 gap-3">
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {"Commande"} #{order.orderNumber}
                          </span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(order.createdAt)}
                          </p>
                        </div>
                        <OrderStatusBadge status={order.status} />
                      </div>

                      {/* Seller + item count */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3 flex-wrap">
                        <span className="truncate">
                          {"Vendeur"}: <span className="text-foreground font-medium">{sellerName}</span>
                        </span>
                        <span>{itemCount === 0 ? '0 article' : itemCount === 1 ? '1 article' : `${itemCount} articles`}</span>
                      </div>

                      {/* Total */}
                      <div className="flex items-center justify-between border-t border-border pt-3">
                        <span className="text-sm text-muted-foreground">{"Total"}</span>
                        <span className="text-base font-bold text-primary">
                          {formatCDF(order.totalCDF)}
                        </span>
                      </div>
                    </Card>
                  </Link>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-2 border border-border bg-surface rounded-lg text-foreground hover:bg-surface-hover hover:border-border-strong transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm text-muted-foreground font-medium">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-2 border border-border bg-surface rounded-lg text-foreground hover:bg-surface-hover hover:border-border-strong transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}
        </Container>
      </main>

      <Footer />
    </div>
  );
}
