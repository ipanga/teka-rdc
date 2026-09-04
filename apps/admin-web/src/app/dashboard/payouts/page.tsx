'use client';

import { formatFC } from '@teka/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Icon } from '@/components/ui/icons';
import { readStatusParam, withStatusParam } from '@/lib/action-center';
import {
  ACTION_META,
  AUDIT_LABELS,
  PAYOUT_STATUSES,
  STATUS_HINTS,
  STATUS_LABELS,
  STATUS_STYLES,
  STATUS_TAB_LABELS,
  allowedActions,
  describeActionError,
  methodLabel,
  rejectLabel,
  validateReason,
  validateReference,
  type PayoutAction,
  type PayoutStatus,
} from '@/lib/payout-workflow';

interface Person { id?: string; firstName?: string | null; lastName?: string | null }

interface PayoutRow {
  id: string;
  amountCDF: string;
  payoutMethod: string;
  payoutPhone: string;
  status: PayoutStatus;
  externalReference?: string | null;
  rejectionReason?: string | null;
  requestedAt?: string;
  createdAt: string;
  approvedAt?: string | null;
  processingAt?: string | null;
  processedAt?: string | null;
  rejectedAt?: string | null;
  sellerProfile?: { id: string; businessName: string; phone?: string | null; user?: Person | null } | null;
  approvedBy?: Person | null;
}

interface PayoutDetail extends PayoutRow {
  balances: { availableCDF: string; pendingCDF: string; totalEarnedCDF: string; totalCommissionCDF: string };
  actors: { approvedBy: Person | null; processingBy: Person | null; completedBy: Person | null; rejectedBy: Person | null };
  auditTrail: { id: string; action: string; actorName: Person | null; reason: string | null; createdAt: string }[];
  earnings: { id: string; orderId: string; netAmountCDF: string; commissionCDF: string; grossAmountCDF: string; reversedAt?: string | null; clawbackRequiredAt?: string | null; order?: { orderNumber: string } | null }[];
}

interface PaginatedResponse {
  data: PayoutRow[];
  meta?: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_TABS: (PayoutStatus | '')[] = ['', ...PAYOUT_STATUSES];

const person = (p?: Person | null) =>
  p && (p.firstName || p.lastName) ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : null;

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-CD', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-CD') : '—');

/** Presentation only — amounts arrive as strings of centimes and are never computed on. */
const money = (centimes: string | null | undefined) => formatFC(centimes ?? null);

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | ''>('');
  const [queryReady, setQueryReady] = useState(false);

  // Detail panel
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayoutDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  // One pending action at a time (double-submit guard)
  const [pending, setPending] = useState<{ id: string; action: PayoutAction; status: PayoutStatus } | null>(null);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 6000);
  };

  useEffect(() => {
    setStatusFilter(readStatusParam(window.location.search, PAYOUT_STATUSES));
    setQueryReady(true);
  }, []);

  const selectStatus = (status: PayoutStatus | '') => {
    setStatusFilter(status);
    setPage(1);
    window.history.replaceState(null, '', withStatusParam(`${window.location.pathname}${window.location.search}`, status));
  };

  const fetchPayouts = useCallback(async () => {
    if (!queryReady) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch<PaginatedResponse | PayoutRow[]>(`/v1/admin/payouts?${params}`);
      const rd = res.data;
      if (Array.isArray(rd)) { setPayouts(rd); setTotalPages(1); setTotal(rd.length); }
      else {
        setPayouts(rd.data);
        setTotalPages(rd.meta?.totalPages ?? 1);
        setTotal(rd.meta?.total ?? rd.data.length);
      }
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, queryReady]);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(false);
    try {
      const res = await apiFetch<PayoutDetail>(`/v1/admin/payouts/${id}`);
      setDetail(res.data);
    } catch {
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openDetail = (id: string) => {
    setDetailId(id);
    setDetail(null);
    fetchDetail(id);
  };
  const closeDetail = () => { setDetailId(null); setDetail(null); };

  const startAction = (row: { id: string; status: PayoutStatus }, action: PayoutAction) => {
    setPending({ id: row.id, action, status: row.status });
    setReason('');
    setReference('');
    setFormError(null);
  };

  const refreshAfter = async () => {
    await fetchPayouts();
    if (detailId) await fetchDetail(detailId);
  };

  const submitAction = async () => {
    if (!pending || submitLock.current) return;
    if (pending.action === 'reject') {
      const err = validateReason(reason);
      if (err) { setFormError(err); return; }
    }
    if (pending.action === 'complete') {
      const err = validateReference(reference);
      if (err) { setFormError(err); return; }
    }
    submitLock.current = true;
    setSubmitting(true);
    setFormError(null);
    const meta = ACTION_META[pending.action];
    try {
      const body =
        pending.action === 'reject'
          ? JSON.stringify({ reason: reason.trim() })
          : pending.action === 'complete'
            ? JSON.stringify({ externalReference: reference.trim() })
            : undefined;
      await apiFetch(`/v1/admin/payouts/${pending.id}/${meta.endpoint}`, { method: 'POST', body });
      setPending(null);
      const done: Record<PayoutAction, string> = {
        approve: 'Demande approuvée. Aucun argent envoyé à cette étape.',
        process: 'Virement marqué en cours.',
        complete: 'Virement marqué payé. Le vendeur a été informé.',
        reject: 'Demande rejetée. Les revenus réservés sont rendus au vendeur.',
      };
      showFeedback('success', done[pending.action]);
      await refreshAfter();
    } catch (err) {
      const d = describeActionError(err instanceof ApiError ? err : (err as { message?: string }));
      if (d.stale) {
        // Backend refused: the state moved under us. Close the dialog, reload
        // the authoritative state, never pretend the action happened.
        setPending(null);
        showFeedback('error', d.message);
        await refreshAfter();
      } else {
        setFormError(d.message);
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const actionButtons = (row: { id: string; status: PayoutStatus }, size: 'sm' | 'md' = 'sm') => {
    const actions = allowedActions(row.status);
    if (actions.length === 0) return <span className="text-xs text-muted-foreground">Aucune action — état final</span>;
    const base = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'min-h-10 px-4 py-2 text-sm';
    const tones: Record<PayoutAction, string> = {
      approve: 'bg-primary/10 text-primary hover:bg-primary/20',
      process: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
      complete: 'bg-success/10 text-success hover:bg-success/20',
      reject: 'bg-destructive/10 text-destructive hover:bg-destructive/20',
    };
    return (
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a}
            type="button"
            disabled={!!pending}
            onClick={() => startAction(row, a)}
            className={`${base} rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tones[a]}`}
          >
            {a === 'reject' ? rejectLabel(row.status) : ACTION_META[a].label}
          </button>
        ))}
      </div>
    );
  };

  const emptyCopy: Record<PayoutStatus | '', string> = {
    '': 'Aucun virement pour le moment.',
    REQUESTED: 'Aucune demande à approuver.',
    APPROVED: 'Aucun virement approuvé en attente de paiement.',
    PROCESSING: 'Aucun virement en cours.',
    COMPLETED: 'Aucun virement payé.',
    REJECTED: 'Aucun virement rejeté.',
  };

  return (
    <div className="admin-page">
      {feedback && (
        <div
          role="status"
          className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${feedback.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}
        >
          {feedback.message}
        </div>
      )}

      <PageHeader
        eyebrow="Finance"
        title="Virements vendeurs"
        description="Approuver = autoriser. « Payé » = l’argent a réellement été envoyé et référencé. Les revenus d’un virement rejeté reviennent au solde du vendeur."
      />

      <div className="admin-filter-bar mb-6" role="tablist" aria-label="Filtrer par statut">
        {STATUS_TABS.map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={statusFilter === status}
            onClick={() => selectStatus(status)}
            className={`admin-filter ${statusFilter === status ? 'admin-filter-active' : ''}`}
          >
            {STATUS_TAB_LABELS[status]}
          </button>
        ))}
      </div>

      <div className="admin-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {isLoading || !queryReady ? 'Chargement…' : `${total} virement${total > 1 ? 's' : ''}`}
          </p>
          <button type="button" onClick={fetchPayouts} className="text-sm font-semibold text-primary hover:underline">Actualiser</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="border-b border-border bg-muted">
                {['Date', 'Vendeur', 'Montant', 'Destination', 'Statut', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading || !queryReady ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-muted" /></td>
                    ))}
                  </tr>
                ))
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <p className="text-sm text-destructive">Impossible de charger les virements.</p>
                    <button type="button" onClick={fetchPayouts} className="admin-button-secondary mt-3">Réessayer</button>
                  </td>
                </tr>
              ) : payouts.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyCopy[statusFilter]}</td></tr>
              ) : (
                payouts.map((payout) => (
                  <tr key={payout.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{fmtDate(payout.requestedAt ?? payout.createdAt)}</td>
                    <td className="px-4 py-3 text-sm">
                      <button type="button" onClick={() => openDetail(payout.id)} className="font-medium text-foreground hover:text-primary hover:underline">
                        {payout.sellerProfile?.businessName || '—'}
                      </button>
                      {person(payout.sellerProfile?.user) && <p className="text-xs text-muted-foreground">{person(payout.sellerProfile?.user)}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-foreground">{money(payout.amountCDF)}</td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      <p>{methodLabel(payout.payoutMethod)}</p>
                      <p className="text-xs text-muted-foreground">{payout.payoutPhone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[payout.status] ?? 'bg-muted text-foreground'}`}>
                        {STATUS_LABELS[payout.status] ?? payout.status}
                      </span>
                      {payout.status === 'COMPLETED' && payout.externalReference && (
                        <p className="mt-1 text-xs text-muted-foreground">Réf. {payout.externalReference}</p>
                      )}
                      {payout.status === 'REJECTED' && payout.rejectionReason && (
                        <p className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={payout.rejectionReason}>Motif : {payout.rejectionReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => openDetail(payout.id)} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/70">Détails</button>
                        {actionButtons(payout)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="admin-button-secondary disabled:opacity-50">Précédent</button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="admin-button-secondary disabled:opacity-50">Suivant</button>
        </div>
      )}

      {/* Detail panel */}
      {detailId && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button type="button" aria-label="Fermer le détail" className="absolute inset-0 bg-black/40" onClick={closeDetail} />
          <aside role="dialog" aria-modal="true" aria-labelledby="payout-detail-title" className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Virement</p>
                <h2 id="payout-detail-title" className="mt-1 text-lg font-semibold text-foreground">
                  {detail?.sellerProfile?.businessName ?? 'Détail du virement'}
                </h2>
              </div>
              <button type="button" onClick={closeDetail} className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Fermer">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {detailLoading && !detail ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded bg-muted" />)}
              </div>
            ) : detailError || !detail ? (
              <div className="p-5 text-center">
                <p className="text-sm text-destructive">Impossible de charger le détail.</p>
                <button type="button" onClick={() => fetchDetail(detailId)} className="admin-button-secondary mt-3">Réessayer</button>
              </div>
            ) : (
              <div className="space-y-6 p-5">
                <section className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ${STATUS_STYLES[detail.status]}`}>{STATUS_LABELS[detail.status]}</span>
                    <p className="text-2xl font-bold text-foreground">{money(detail.amountCDF)}</p>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{STATUS_HINTS[detail.status]}</p>
                  {detail.externalReference && <p className="mt-2 text-sm"><span className="text-muted-foreground">Référence de paiement :</span> <span className="font-mono font-medium text-foreground">{detail.externalReference}</span></p>}
                  {detail.rejectionReason && <p className="mt-2 text-sm"><span className="text-muted-foreground">Motif :</span> <span className="text-foreground">{detail.rejectionReason}</span></p>}
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-foreground">Contexte financier du vendeur</h3>
                  <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">Montant demandé</dt><dd className="font-semibold text-foreground">{money(detail.amountCDF)}</dd></div>
                    <div className="rounded-lg bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">Solde disponible (hors ce virement)</dt><dd className="font-semibold text-foreground">{money(detail.balances.availableCDF)}</dd></div>
                    <div className="rounded-lg bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">Revenus en attente (fenêtre de retour)</dt><dd className="font-semibold text-foreground">{money(detail.balances.pendingCDF)}</dd></div>
                    <div className="rounded-lg bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">Total gagné / commission</dt><dd className="font-semibold text-foreground">{money(detail.balances.totalEarnedCDF)} <span className="text-xs font-normal text-muted-foreground">/ {money(detail.balances.totalCommissionCDF)}</span></dd></div>
                  </dl>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-foreground">Destination (figée à la demande)</h3>
                  <p className="mt-1 text-sm text-foreground">{methodLabel(detail.payoutMethod)} · <span className="font-mono">{detail.payoutPhone}</span></p>
                  <p className="text-xs text-muted-foreground">Vendeur : {detail.sellerProfile?.businessName} {person(detail.sellerProfile?.user) ? `(${person(detail.sellerProfile?.user)})` : ''}</p>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-foreground">Chronologie</h3>
                  <ol className="mt-2 space-y-2 text-sm">
                    <li className="flex justify-between gap-3"><span className="text-muted-foreground">Demandé</span><span className="text-foreground">{fmtDateTime(detail.requestedAt ?? detail.createdAt)}</span></li>
                    {detail.approvedAt && <li className="flex justify-between gap-3"><span className="text-muted-foreground">Approuvé{person(detail.actors.approvedBy) ? ` par ${person(detail.actors.approvedBy)}` : ''}</span><span className="text-foreground">{fmtDateTime(detail.approvedAt)}</span></li>}
                    {detail.processingAt && <li className="flex justify-between gap-3"><span className="text-muted-foreground">Virement lancé{person(detail.actors.processingBy) ? ` par ${person(detail.actors.processingBy)}` : ''}</span><span className="text-foreground">{fmtDateTime(detail.processingAt)}</span></li>}
                    {detail.processedAt && <li className="flex justify-between gap-3"><span className="text-muted-foreground">Payé{person(detail.actors.completedBy) ? ` par ${person(detail.actors.completedBy)}` : ''}</span><span className="text-foreground">{fmtDateTime(detail.processedAt)}</span></li>}
                    {detail.rejectedAt && <li className="flex justify-between gap-3"><span className="text-muted-foreground">Rejeté{person(detail.actors.rejectedBy) ? ` par ${person(detail.actors.rejectedBy)}` : ''}</span><span className="text-foreground">{fmtDateTime(detail.rejectedAt)}</span></li>}
                  </ol>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-foreground">Revenus réservés ({detail.earnings.length})</h3>
                  {detail.earnings.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{detail.status === 'REJECTED' ? 'Rendus au solde du vendeur.' : 'Aucun revenu lié.'}</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-sm">
                      {detail.earnings.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-foreground">Commande {e.order?.orderNumber ?? e.orderId.slice(0, 8)}</span>
                          <span className="flex items-center gap-2">
                            {e.clawbackRequiredAt && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">Récupération manuelle</span>}
                            <span className="font-medium text-foreground">{money(e.netAmountCDF)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-foreground">Historique des actions</h3>
                  {detail.auditTrail.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">Aucune action administrateur enregistrée.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm">
                      {detail.auditTrail.map((a) => (
                        <li key={a.id} className="rounded-lg bg-muted/60 p-3">
                          <div className="flex justify-between gap-3">
                            <span className="font-medium text-foreground">{AUDIT_LABELS[a.action] ?? a.action}</span>
                            <span className="text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{person(a.actorName) ?? 'Administrateur'}{a.reason ? ` — ${a.reason}` : ''}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="sticky bottom-0 -mx-5 -mb-5 border-t border-border bg-white p-5">
                  {actionButtons(detail, 'md')}
                </section>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Action confirmation */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button type="button" aria-label="Annuler" className="fixed inset-0 bg-black/50" onClick={() => !submitting && setPending(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="payout-action-title" className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-white shadow-xl">
            <div className="p-6">
              <h3 id="payout-action-title" className="text-lg font-semibold text-foreground">
                {pending.action === 'reject' && pending.status === 'PROCESSING' ? 'Signaler un transfert échoué' : ACTION_META[pending.action].title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{ACTION_META[pending.action].confirm}</p>

              {pending.action === 'reject' && (
                <div className="mt-4">
                  <label htmlFor="reject-reason" className="block text-sm font-medium text-foreground">Raison <span className="text-destructive">*</span></label>
                  <textarea
                    id="reject-reason"
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); setFormError(null); }}
                    rows={3}
                    maxLength={500}
                    placeholder={pending.status === 'PROCESSING' ? 'Ex. : numéro Mobile Money invalide, transfert refusé par l’opérateur…' : 'Ex. : justificatif manquant, numéro non conforme…'}
                    className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Minimum 5 caractères. Transmise au vendeur et conservée dans l’historique.</p>
                </div>
              )}

              {pending.action === 'complete' && (
                <div className="mt-4">
                  <label htmlFor="complete-reference" className="block text-sm font-medium text-foreground">Référence de paiement <span className="text-destructive">*</span></label>
                  <input
                    id="complete-reference"
                    value={reference}
                    onChange={(e) => { setReference(e.target.value); setFormError(null); }}
                    maxLength={200}
                    placeholder="Ex. : identifiant de transaction M-Pesa"
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Preuve du transfert, conservée pour le rapprochement.</p>
                </div>
              )}

              {formError && <p role="alert" className="mt-3 text-sm text-destructive">{formError}</p>}

              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setPending(null)} disabled={submitting} className="admin-button-secondary disabled:opacity-50">Annuler</button>
                <button
                  type="button"
                  onClick={submitAction}
                  disabled={submitting}
                  className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    ACTION_META[pending.action].tone === 'destructive' ? 'bg-destructive hover:bg-destructive/90' : ACTION_META[pending.action].tone === 'success' ? 'bg-success hover:bg-success/90' : 'bg-primary hover:bg-primary/90'
                  }`}
                >
                  {submitting ? 'Envoi…' : pending.action === 'reject' ? rejectLabel(pending.status) : ACTION_META[pending.action].label}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
