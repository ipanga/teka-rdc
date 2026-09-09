'use client';

import { formatFC } from '@teka/shared';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  coolingOffNotice,
  destinationChanged,
  formatAvailableAt,
  hasSavedDestination,
  validateDestinationDraft,
} from '@/lib/payout-destination';
import type {
  SellerWallet,
  SellerEarning,
  Payout,
  SellerPayoutMethod,
} from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import {
  PAYOUT_STATUS_HINTS,
  PAYOUT_STATUS_LABELS,
  PAYOUT_STATUS_STYLES,
  describePayoutLoadError,
  parseEarningsQuery,
  type EarningsTab,
} from '@/lib/payout-notifications';
import {
  EARNING_STATE_LABELS,
  EARNING_STATE_STYLES,
  earningStateOf,
  formatCommissionRate,
} from '@/lib/earnings';

type ActiveTab = EarningsTab;

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

const getSellerFriendlyError = (err: unknown) => {
  if (err instanceof ApiError) {
    if (err.status >= 500 || err.message.toLowerCase().includes('interne')) {
      return "Impossible de charger ces données pour le moment. Réessayez plus tard.";
    }
    return err.message;
  }
  return "Impossible de charger ces données pour le moment. Réessayez plus tard.";
};

export default function EarningsPage() {

  // Wallet state
  const [wallet, setWallet] = useState<SellerWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  // Tab state. `?tab=payouts&payout=<id>` (notification / deep link) is read
  // once on mount — same pattern as the orders page.
  const [activeTab, setActiveTab] = useState<ActiveTab>('earnings');

  // One payout opened from a notification: fetched by id through the
  // owner-scoped endpoint (404 = not yours or gone), never from the list.
  const [focusPayoutId, setFocusPayoutId] = useState<string | null>(null);
  const [focusPayout, setFocusPayout] = useState<Payout | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusError, setFocusError] = useState<string | null>(null);

  useEffect(() => {
    const q = parseEarningsQuery(window.location.search);
    setActiveTab(q.tab);
    setFocusPayoutId(q.payoutId);
  }, []);

  useEffect(() => {
    if (!focusPayoutId) { setFocusPayout(null); setFocusError(null); return; }
    let cancelled = false;
    setFocusLoading(true);
    setFocusError(null);
    apiFetch<Payout>(`/v1/sellers/payouts/${focusPayoutId}`)
      .then((res) => { if (!cancelled) setFocusPayout(res.data); })
      .catch((err) => { if (!cancelled) setFocusError(describePayoutLoadError(err)); })
      .finally(() => { if (!cancelled) setFocusLoading(false); });
    return () => { cancelled = true; };
  }, [focusPayoutId]);

  const closeFocus = () => {
    setFocusPayoutId(null);
    window.history.replaceState(null, '', `${window.location.pathname}?tab=payouts`);
  };

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
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // S12 — saved destination (server-owned) + its password-guarded editor.
  // The request never sends a destination: the API snapshots the saved one.
  const [savedDestination, setSavedDestination] =
    useState<SellerPayoutMethod | null>(null);
  const [editingDestination, setEditingDestination] = useState(false);
  const [destMethod, setDestMethod] = useState('');
  const [destPhone, setDestPhone] = useState('');
  const [destPassword, setDestPassword] = useState('');
  const [savingDestination, setSavingDestination] = useState(false);
  const [destinationError, setDestinationError] = useState('');
  const [destinationNotice, setDestinationNotice] = useState('');

  // Error
  const [error, setError] = useState('');

  const formatPrice = (centimes: string) => formatFC(centimes);

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat('fr-CD', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
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
      setError(getSellerFriendlyError(err));
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
      setError(getSellerFriendlyError(err));
    } finally {
      setPayoutsLoading(false);
    }
  }, [payoutsPage]);

  // Saved payout destination (B1 / S12) — shown read-only on the request
  // form; the editor opens by itself when nothing is saved yet.
  const loadPayoutMethod = useCallback(async () => {
    try {
      const res = await apiFetch<SellerPayoutMethod>(
        '/v1/sellers/payout-method',
      );
      const saved = res.data ?? null;
      setSavedDestination(saved);
      setDestMethod(saved?.payoutMethod ?? '');
      setDestPhone(saved?.payoutPhone ?? '');
      setEditingDestination(!hasSavedDestination(saved));
    } catch {
      // Non-fatal: the editor opens empty.
      setEditingDestination(true);
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
    setDestinationError('');
    setDestinationNotice('');
    setDestPassword('');
    setShowRequestModal(true);
  };

  const closeRequestModal = () => {
    setDestPassword('');
    setShowRequestModal(false);
  };

  const openDestinationEditor = () => {
    setDestinationError('');
    setDestinationNotice('');
    setDestMethod(savedDestination?.payoutMethod ?? '');
    setDestPhone(savedDestination?.payoutPhone ?? '');
    setDestPassword('');
    setEditingDestination(true);
  };

  const cancelDestinationEditor = () => {
    setDestPassword('');
    setDestinationError('');
    setEditingDestination(false);
  };

  // S12 — PATCH the saved destination. A real change carries the current
  // password (verified server-side, 403 « Mot de passe invalide. » when
  // wrong) and re-arms the 24 h cooling-off; an unchanged one is a no-op.
  const saveDestination = async () => {
    setDestinationError('');
    const draft = { payoutMethod: destMethod, payoutPhone: destPhone };
    const invalid = validateDestinationDraft(savedDestination, draft, destPassword);
    if (invalid) {
      setDestinationError(invalid);
      return;
    }
    const changed = destinationChanged(savedDestination, draft);
    setSavingDestination(true);
    try {
      const res = await apiFetch<SellerPayoutMethod>(
        '/v1/sellers/payout-method',
        {
          method: 'PATCH',
          body: JSON.stringify(
            changed ? { ...draft, password: destPassword } : draft,
          ),
        },
      );
      const saved = res.data ?? null;
      setSavedDestination(saved);
      setEditingDestination(false);
      setDestinationNotice(
        changed && saved?.payoutsAvailableAt
          ? `Destination enregistrée. Un e-mail de confirmation vous a été envoyé ; les retraits seront possibles à partir du ${formatAvailableAt(saved.payoutsAvailableAt)}.`
          : 'Destination enregistrée.',
      );
    } catch (err) {
      setDestinationError(
        err instanceof ApiError ? err.message : 'Une erreur est survenue.',
      );
    } finally {
      // The password never outlives the attempt.
      setDestPassword('');
      setSavingDestination(false);
    }
  };

  const requestBlocker = !hasSavedDestination(savedDestination)
    ? 'Enregistrez d’abord votre destination de retrait.'
    : coolingOffNotice(savedDestination?.payoutsAvailableAt);

  const submitPayoutRequest = async () => {
    setRequestError('');
    if (requestBlocker) {
      setRequestError(requestBlocker);
      return;
    }
    setSubmitting(true);
    try {
      // S12: no destination in the body — the API snapshots the saved one.
      await apiFetch('/v1/sellers/payouts', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setShowRequestModal(false);
      setSuccessMessage("Demande de virement envoyée avec succès");
      await Promise.all([loadWallet(), loadPayouts()]);
      setActiveTab('payouts');
    } catch (err) {
      setRequestError(getSellerFriendlyError(err));
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
    <div className="seller-page">
      <PageHeader
        eyebrow="Finances"
        title="Revenus"
        description="Suivez votre solde, vos ventes et vos demandes de virement."
      />

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
          {!walletLoading && Number(wallet?.pendingCDF ?? '0') > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {`+ ${formatPrice(wallet?.pendingCDF ?? '0')} en attente (fenêtre de retour de 2 jours)`}
            </p>
          )}
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
            Le solde minimum pour un virement est de {formatFC(MIN_PAYOUT_CDF * 100)}
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
            setFocusPayoutId(null);
            window.history.replaceState(null, '', window.location.pathname);
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
            window.history.replaceState(null, '', `${window.location.pathname}?tab=payouts`);
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
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${EARNING_STATE_STYLES[earningStateOf(earning)]}`}
                            >
                              {EARNING_STATE_LABELS[earningStateOf(earning)]}
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
          {focusPayoutId && (
            <section aria-labelledby="payout-focus-title" className="mb-4 rounded-xl border border-primary/30 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 id="payout-focus-title" className="text-base font-semibold text-foreground">Détail du virement</h2>
                <button type="button" onClick={closeFocus} className="text-sm font-medium text-muted-foreground hover:text-foreground">Fermer</button>
              </div>
              {focusLoading ? (
                <div className="mt-3 space-y-2" aria-busy="true">
                  <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              ) : focusError ? (
                <p role="alert" className="mt-3 text-sm text-destructive">{focusError}</p>
              ) : focusPayout ? (
                <div className="mt-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYOUT_STATUS_STYLES[focusPayout.status] ?? 'bg-muted text-foreground'}`}>
                      {PAYOUT_STATUS_LABELS[focusPayout.status] ?? focusPayout.status}
                    </span>
                    <span className="text-xl font-bold text-foreground">{formatFC(focusPayout.amountCDF)}</span>
                    <span className="text-sm text-muted-foreground">demandé le {formatDate(focusPayout.requestedAt || focusPayout.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm text-foreground">{PAYOUT_STATUS_HINTS[focusPayout.status] ?? ''}</p>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-muted-foreground">Destination</dt><dd className="text-foreground">{getPayoutMethodLabel(focusPayout.payoutMethod)} · {focusPayout.payoutPhone}</dd></div>
                    {focusPayout.status === 'COMPLETED' && focusPayout.externalReference && (
                      <div><dt className="text-xs text-muted-foreground">Référence de paiement</dt><dd className="font-mono text-foreground">{focusPayout.externalReference}</dd></div>
                    )}
                    {focusPayout.status === 'REJECTED' && (
                      <div><dt className="text-xs text-muted-foreground">Raison</dt><dd className="text-foreground">{focusPayout.rejectionReason || 'Non précisée'}</dd></div>
                    )}
                    {focusPayout.processedAt && focusPayout.status === 'COMPLETED' && (
                      <div><dt className="text-xs text-muted-foreground">Payé le</dt><dd className="text-foreground">{formatDate(focusPayout.processedAt)}</dd></div>
                    )}
                  </dl>
                </div>
              ) : null}
            </section>
          )}
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
                        <tr key={payout.id} className={`border-b border-border last:border-0 transition-colors ${payout.id === focusPayoutId ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
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

            {/* S12 — saved destination (server-owned) + password-guarded editor */}
            <div className="space-y-4">
              {destinationNotice && (
                <div className="p-3 rounded-lg bg-success/10 text-success text-sm">
                  {destinationNotice}
                </div>
              )}
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Destination du virement
                    </p>
                    {hasSavedDestination(savedDestination) ? (
                      <p className="mt-1 text-sm text-foreground">
                        {getPayoutMethodLabel(savedDestination?.payoutMethod ?? '')}
                        {' · '}
                        <span className="font-mono">{savedDestination?.payoutPhone}</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Aucune destination enregistrée.
                      </p>
                    )}
                  </div>
                  {!editingDestination && (
                    <button
                      type="button"
                      onClick={openDestinationEditor}
                      disabled={submitting}
                      className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      Modifier
                    </button>
                  )}
                </div>

                {editingDestination && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">
                      Par sécurité, modifier la destination demande votre mot de passe et
                      bloque les retraits pendant 24 heures. Un e-mail de confirmation vous sera
                      envoyé. Les retraits déjà demandés conservent leur destination.
                    </p>
                    {destinationError && (
                      <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                        {destinationError}
                      </div>
                    )}
                    <div>
                      <label htmlFor="dest-method" className="block text-sm font-medium text-foreground mb-1">
                        Opérateur Mobile Money
                      </label>
                      <select
                        id="dest-method"
                        value={destMethod}
                        onChange={(e) => setDestMethod(e.target.value)}
                        disabled={savingDestination}
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
                      <label htmlFor="dest-phone" className="block text-sm font-medium text-foreground mb-1">
                        Numéro de réception
                      </label>
                      <input
                        id="dest-phone"
                        type="tel"
                        value={destPhone}
                        onChange={(e) => setDestPhone(e.target.value)}
                        placeholder="+243..."
                        disabled={savingDestination}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label htmlFor="dest-password" className="block text-sm font-medium text-foreground mb-1">
                        Votre mot de passe
                      </label>
                      <input
                        id="dest-password"
                        type="password"
                        autoComplete="current-password"
                        value={destPassword}
                        onChange={(e) => setDestPassword(e.target.value)}
                        disabled={savingDestination}
                        data-ph-no-capture="true"
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="flex gap-2">
                      {hasSavedDestination(savedDestination) && (
                        <button
                          type="button"
                          onClick={cancelDestinationEditor}
                          disabled={savingDestination}
                          className="flex-1 py-2 px-4 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
                        >
                          Annuler
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={saveDestination}
                        disabled={savingDestination}
                        className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {savingDestination ? 'Enregistrement...' : 'Enregistrer la destination'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {requestBlocker && !editingDestination && (
                <p className="text-xs text-warning">{requestBlocker}</p>
              )}
              {!requestBlocker && !editingDestination && (
                <p className="text-xs text-muted-foreground">
                  Le virement sera envoyé à la destination ci-dessus.
                </p>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={closeRequestModal}
                disabled={submitting}
                className="flex-1 py-2 px-4 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={submitPayoutRequest}
                disabled={submitting || editingDestination || Boolean(requestBlocker)}
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
