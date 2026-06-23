'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import type {
  SellerWallet,
  SellerEarning,
  Payout,
  SellerPayoutMethod,
} from '@/lib/types';

type ActiveTab = 'earnings' | 'payouts';

const LIMIT = 20;
const MIN_PAYOUT_CDF = 5000;
const PAYOUT_METHODS = ['M_PESA', 'AIRTEL_MONEY', 'ORANGE_MONEY'] as const;
// A payout request blocks a new one until it reaches a terminal state.
const PENDING_PAYOUT_STATUSES = ['REQUESTED', 'APPROVED', 'PROCESSING'];

// Display labels for historical payout methods. The API still emits these
// values on existing rows; we just don't expose the request flow until the
// payout product is re-enabled (the request form was hidden 2026-05-20).
const PAYOUT_METHOD_LABELS: Record<string, string> = {
  M_PESA: 'M-Pesa (Vodacom)',
  AIRTEL_MONEY: 'Airtel Money',
  ORANGE_MONEY: 'Orange Money',
};

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'En attente',
  APPROVED: 'Approuvé',
  PROCESSING: 'En traitement',
  COMPLETED: 'Complété',
  REJECTED: 'Rejeté',
};

export default function EarningsPage() {

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

  // Payout request flow (re-enabled, Initiative #3 / C1).
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestMethod, setRequestMethod] = useState('');
  const [requestPhone, setRequestPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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

  // Saved payout destination (B1) — prefill the request form.
  const loadPayoutMethod = useCallback(async () => {
    try {
      const res = await apiFetch<SellerPayoutMethod>(
        '/v1/sellers/payout-method',
      );
      if (res.data?.payoutMethod) setRequestMethod(res.data.payoutMethod);
      if (res.data?.payoutPhone) setRequestPhone(res.data.payoutPhone);
    } catch {
      // Non-fatal: the form just starts empty.
    }
  }, []);

  useEffect(() => {
    loadWallet();
    loadPayoutMethod();
    // Load payouts up-front (not just on the payouts tab) so the request
    // button can detect an existing pending payout.
    loadPayouts();
  }, [loadWallet, loadPayoutMethod, loadPayouts]);

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

  const balanceCDF = Number(wallet?.balanceCDF ?? '0') / 100;
  const hasPendingPayout = payouts.some((p) =>
    PENDING_PAYOUT_STATUSES.includes(p.status),
  );
  const canRequestPayout =
    !walletLoading && balanceCDF >= MIN_PAYOUT_CDF && !hasPendingPayout;

  const openRequestModal = () => {
    setRequestError('');
    setShowRequestModal(true);
  };

  const submitPayoutRequest = async () => {
    setRequestError('');
    if (!PAYOUT_METHODS.includes(requestMethod as never)) {
      setRequestError("Opérateur Mobile Money");
      return;
    }
    if (!/^\+243[0-9]{9}$/.test(requestPhone)) {
      setRequestError("+243...");
      return;
    }
    setSubmitting(true);
    try {
      // Persist the destination (so it prefills next time), then request.
      await apiFetch('/v1/sellers/payout-method', {
        method: 'PATCH',
        body: JSON.stringify({
          payoutMethod: requestMethod,
          payoutPhone: requestPhone,
        }),
      });
      await apiFetch('/v1/sellers/payouts', {
        method: 'POST',
        body: JSON.stringify({
          payoutMethod: requestMethod,
          payoutPhone: requestPhone,
        }),
      });
      setShowRequestModal(false);
      setSuccessMessage("Demande de virement envoyée avec succès");
      await Promise.all([loadWallet(), loadPayouts()]);
      setActiveTab('payouts');
    } catch (err) {
      if (err instanceof ApiError) {
        setRequestError(err.message);
      } else {
        setRequestError("Demande de virement envoyée avec succès");
      }
    } finally {
      setSubmitting(false);
    }
  };

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
        <h1 className="text-2xl font-bold text-foreground">Revenus</h1>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="mb-4 p-3 rounded-lg bg-success/10 text-success text-sm">
          {successMessage}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Wallet cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-muted-foreground">Solde disponible</h3>
          <p className="text-3xl font-bold mt-2 text-foreground">
            {walletLoading ? (
              <span className="inline-block w-24 h-8 bg-muted rounded animate-pulse" />
            ) : (
              formatPrice(wallet?.balanceCDF ?? '0')
            )}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-muted-foreground">Revenus totaux</h3>
          <p className="text-3xl font-bold mt-2 text-success">
            {walletLoading ? (
              <span className="inline-block w-24 h-8 bg-muted rounded animate-pulse" />
            ) : (
              formatPrice(wallet?.totalEarnedCDF ?? '0')
            )}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-muted-foreground">Commission prélevée</h3>
          <p className="text-3xl font-bold mt-2 text-muted-foreground">
            {walletLoading ? (
              <span className="inline-block w-24 h-8 bg-muted rounded animate-pulse" />
            ) : (
              formatPrice(wallet?.totalCommissionCDF ?? '0')
            )}
          </p>
        </div>
      </div>

      {/* Payout request action + guards */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={openRequestModal}
          disabled={!canRequestPayout}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Demander un virement
        </button>
        {!walletLoading && balanceCDF < MIN_PAYOUT_CDF && (
          <span className="text-sm text-muted-foreground">
            Le solde minimum pour un virement est de 5 000 CDF
          </span>
        )}
        {hasPendingPayout && (
          <span className="text-sm text-muted-foreground">
            Vous avez déjà une demande de virement en cours. Vous pourrez en faire une nouvelle une fois celle-ci traitée.
          </span>
        )}
      </div>

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
          Gains
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
          Virements
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
              <p className="text-muted-foreground">Aucun revenu pour le moment</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Commande</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Montant brut</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Commission</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Montant net</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
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
                              {earning.isPaid ? 'Payé' : 'Disponible'}
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
                    Précédent
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {`Page ${earningsPage} sur ${earningsTotalPages}`}
                  </span>
                  <button
                    onClick={() => setEarningsPage((p) => Math.min(earningsTotalPages, p + 1))}
                    disabled={earningsPage >= earningsTotalPages}
                    className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Suivant
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
              <p className="text-muted-foreground">Aucun virement pour le moment</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Montant</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Méthode</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Détails</th>
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
                              {PAYOUT_STATUS_LABELS[payout.status] ?? payout.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {payout.status === 'COMPLETED' &&
                            payout.externalReference
                              ? `Référence : ${payout.externalReference}`
                              : payout.rejectionReason || '---'}
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
                    Précédent
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {`Page ${payoutsPage} sur ${payoutsTotalPages}`}
                  </span>
                  <button
                    onClick={() => setPayoutsPage((p) => Math.min(payoutsTotalPages, p + 1))}
                    disabled={payoutsPage >= payoutsTotalPages}
                    className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Suivant
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Payout request modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-xl border border-border shadow-xl p-6">
            <h2 className="text-lg font-bold text-foreground mb-1">
              Demande de virement
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Solde actuel : {formatPrice(wallet?.balanceCDF ?? '0')}
            </p>

            {requestError && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {requestError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Opérateur Mobile Money
                </label>
                <select
                  value={requestMethod}
                  onChange={(e) => setRequestMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">—</option>
                  {PAYOUT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {getPayoutMethodLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Numéro de réception
                </label>
                <input
                  type="tel"
                  value={requestPhone}
                  onChange={(e) => setRequestPhone(e.target.value)}
                  placeholder="+243..."
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Cet opérateur et ce numéro seront enregistrés pour vos prochaines demandes.
              </p>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowRequestModal(false)}
                disabled={submitting}
                className="flex-1 py-2 px-4 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={submitPayoutRequest}
                disabled={submitting}
                className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Envoi en cours...' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
