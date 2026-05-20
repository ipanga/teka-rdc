'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { SellerWallet, SellerEarning, Payout } from '@/lib/types';

type ActiveTab = 'earnings' | 'payouts';

const LIMIT = 20;

// Display labels for historical payout methods. The API still emits these
// values on existing rows; we just don't expose the request flow until the
// payout product is re-enabled (the request form was hidden 2026-05-20).
const PAYOUT_METHOD_LABELS: Record<string, string> = {
  M_PESA: 'M-Pesa (Vodacom)',
  AIRTEL_MONEY: 'Airtel Money',
  ORANGE_MONEY: 'Orange Money',
};

export default function EarningsPage() {
  const t = useTranslations('Earnings');
  const tOrders = useTranslations('Orders');

  // Wallet state
  const [wallet, setWallet] = useState<SellerWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('earnings');

  // Earnings state
  const [earnings, setEarnings] = useState<SellerEarning[]>([]);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [earningsPage, setEarningsPage] = useState(1);
  const [earningsTotalPages, setEarningsTotalPages] = useState(1);

  // Payouts state
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payoutsPage, setPayoutsPage] = useState(1);
  const [payoutsTotalPages, setPayoutsTotalPages] = useState(1);

  // Payout request flow is hidden until the payout product is re-enabled.
  // Wallet balance + earnings + past-payouts list remain visible.

  // Error
  const [error, setError] = useState('');

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

  const formatCommissionRate = (rate: string) => {
    const pct = Number(rate);
    return `${pct}%`;
  };

  // Load wallet
  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    try {
      const res = await apiFetch<SellerWallet>('/v1/sellers/wallet');
      setWallet(res.data);
    } catch {
      // Wallet stays null
    } finally {
      setWalletLoading(false);
    }
  }, []);

  // Load earnings. The /sellers/earnings + /sellers/payouts endpoints
  // flatten the envelope to `{ success, data: [...], meta: {...} }` (see
  // payouts.controller.ts:88,118) instead of the canonical
  // `{ data: { data, pagination } }` used elsewhere — read accordingly.
  const loadEarnings = useCallback(async () => {
    setEarningsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(earningsPage),
        limit: String(LIMIT),
      });
      const res = await apiFetch<SellerEarning[]>(`/v1/sellers/earnings?${params}`) as {
        data: SellerEarning[];
        meta?: { totalPages?: number };
      };
      setEarnings(res.data ?? []);
      setEarningsTotalPages(res.meta?.totalPages ?? 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setEarningsLoading(false);
    }
  }, [earningsPage]);

  const loadPayouts = useCallback(async () => {
    setPayoutsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(payoutsPage),
        limit: String(LIMIT),
      });
      const res = await apiFetch<Payout[]>(`/v1/sellers/payouts?${params}`) as {
        data: Payout[];
        meta?: { totalPages?: number };
      };
      setPayouts(res.data ?? []);
      setPayoutsTotalPages(res.meta?.totalPages ?? 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setPayoutsLoading(false);
    }
  }, [payoutsPage]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    if (activeTab === 'earnings') {
      loadEarnings();
    }
  }, [activeTab, loadEarnings]);

  useEffect(() => {
    if (activeTab === 'payouts') {
      loadPayouts();
    }
  }, [activeTab, loadPayouts]);

  const getPayoutStatusStyle = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return 'bg-warning/15 text-warning';
      case 'APPROVED':
        return 'bg-blue-100 text-blue-700';
      case 'PROCESSING':
        return 'bg-blue-100 text-blue-700';
      case 'COMPLETED':
        return 'bg-success/15 text-success';
      case 'REJECTED':
        return 'bg-destructive/15 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getPayoutMethodLabel = (method: string) => PAYOUT_METHOD_LABELS[method] ?? method;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      </div>

      {/* Payout request hidden — the payout flow is temporarily disabled.
          Wallet balance + earnings + past-payouts remain visible. */}
      <div className="mb-4 p-3 rounded-lg bg-muted/60 border border-border text-muted-foreground text-sm">
        {t('payoutTemporarilyUnavailable')}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Wallet cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-muted-foreground">{t('walletBalance')}</h3>
          <p className="text-3xl font-bold mt-2 text-foreground">
            {walletLoading ? (
              <span className="inline-block w-24 h-8 bg-muted rounded animate-pulse" />
            ) : (
              formatPrice(wallet?.balanceCDF ?? '0')
            )}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-muted-foreground">{t('totalEarned')}</h3>
          <p className="text-3xl font-bold mt-2 text-success">
            {walletLoading ? (
              <span className="inline-block w-24 h-8 bg-muted rounded animate-pulse" />
            ) : (
              formatPrice(wallet?.totalEarnedCDF ?? '0')
            )}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-muted-foreground">{t('totalCommission')}</h3>
          <p className="text-3xl font-bold mt-2 text-muted-foreground">
            {walletLoading ? (
              <span className="inline-block w-24 h-8 bg-muted rounded animate-pulse" />
            ) : (
              formatPrice(wallet?.totalCommissionCDF ?? '0')
            )}
          </p>
        </div>
      </div>

      {/* Payout request flow + minimum-balance notice removed; see banner above. */}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => {
            setActiveTab('earnings');
            setEarningsPage(1);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'earnings'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          {t('tabs.earnings')}
        </button>
        <button
          onClick={() => {
            setActiveTab('payouts');
            setPayoutsPage(1);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'payouts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          {t('tabs.payouts')}
        </button>
      </div>

      {/* Earnings tab content */}
      {activeTab === 'earnings' && (
        <>
          {earningsLoading ? (
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
          ) : earnings.length === 0 ? (
            <div className="bg-white rounded-xl border border-border p-12 text-center">
              <p className="text-muted-foreground">{t('table.noEarnings')}</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.date')}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.order')}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.grossAmount')}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.commission')}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.netAmount')}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {earnings.map((earning) => (
                        <tr key={earning.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(earning.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            {earning.order ? (
                              <Link
                                href={`/dashboard/orders/${earning.orderId}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {earning.order.orderNumber}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">---</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {formatPrice(earning.grossAmountCDF)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatPrice(earning.commissionCDF)}
                            <span className="text-xs ml-1">({formatCommissionRate(earning.commissionRate)})</span>
                          </td>
                          <td className="px-4 py-3 text-foreground font-medium">
                            {formatPrice(earning.netAmountCDF)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                earning.isPaid
                                  ? 'bg-success/15 text-success'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {earning.isPaid ? t('table.paid') : t('table.available')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {earningsTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => setEarningsPage((p) => Math.max(1, p - 1))}
                    disabled={earningsPage <= 1}
                    className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {tOrders('previousPage')}
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {tOrders('pageOf', { page: earningsPage, total: earningsTotalPages })}
                  </span>
                  <button
                    onClick={() => setEarningsPage((p) => Math.min(earningsTotalPages, p + 1))}
                    disabled={earningsPage >= earningsTotalPages}
                    className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {tOrders('nextPage')}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Payouts tab content */}
      {activeTab === 'payouts' && (
        <>
          {payoutsLoading ? (
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
          ) : payouts.length === 0 ? (
            <div className="bg-white rounded-xl border border-border p-12 text-center">
              <p className="text-muted-foreground">{t('table.noPayouts')}</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.date')}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.amount')}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.method')}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.status')}</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('table.rejectionReason')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((payout) => (
                        <tr key={payout.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(payout.requestedAt || payout.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-foreground font-medium">
                            {formatPrice(payout.amountCDF)}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            <div>
                              <span>{getPayoutMethodLabel(payout.payoutMethod)}</span>
                              <p className="text-xs text-muted-foreground">{payout.payoutPhone}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPayoutStatusStyle(payout.status)}`}
                            >
                              {t(`payoutStatus.${payout.status}`)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {payout.rejectionReason || '---'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {payoutsTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => setPayoutsPage((p) => Math.max(1, p - 1))}
                    disabled={payoutsPage <= 1}
                    className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {tOrders('previousPage')}
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {tOrders('pageOf', { page: payoutsPage, total: payoutsTotalPages })}
                  </span>
                  <button
                    onClick={() => setPayoutsPage((p) => Math.min(payoutsTotalPages, p + 1))}
                    disabled={payoutsPage >= payoutsTotalPages}
                    className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {tOrders('nextPage')}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
