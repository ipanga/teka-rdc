'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  HISTORY_COPY,
  PERCENT_INPUT_HINT,
  PRECEDENCE_COPY,
  describeEffective,
  formatRatePercent,
  parsePercentInput,
  rateToApiNumber,
  rateToPercentInput,
  type SellerCommissionContext,
} from '@/lib/commission';

interface Person { id: string; firstName: string | null; lastName: string | null }
interface SellerCommission extends SellerCommissionContext {
  sellerProfileId: string;
  businessName: string;
  lastChange: { action: string; actor: Person | null; before: unknown; after: unknown; createdAt: string } | null;
}

const person = (p?: Person | null) =>
  p && (p.firstName || p.lastName) ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : 'Administrateur';
const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-CD', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

type Mode = 'default' | 'override';
type Pending = { kind: 'set'; rate: string } | { kind: 'clear' };

/**
 * « Commission » card on the admin seller page. Makes three things explicit
 * and never conflates them: the platform default, this seller's specific rate
 * (if any), and the rate that actually applies. The API is authoritative —
 * this card only shows intent and asks for confirmation.
 */
export function SellerCommissionCard({ sellerProfileId }: { sellerProfileId: string }) {
  const [data, setData] = useState<SellerCommission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [mode, setMode] = useState<Mode>('default');
  const [rateInput, setRateInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await apiFetch<SellerCommission>(`/v1/admin/sellers/${sellerProfileId}/commission`);
      setData(res.data);
      setMode(res.data.overrideRate !== null ? 'override' : 'default');
      setRateInput(rateToPercentInput(res.data.overrideRate));
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [sellerProfileId]);

  useEffect(() => { load(); }, [load]);

  const dirty = data
    ? mode === 'default'
      ? data.overrideRate !== null
      : (() => { const p = parsePercentInput(rateInput); return 'error' in p || p.rate !== data.overrideRate; })()
    : false;

  const ask = () => {
    if (!data) return;
    setFormError(null);
    setDialogError(null);
    if (mode === 'default') {
      if (data.overrideRate === null) { setFormError('Ce vendeur suit déjà le taux par défaut.'); return; }
      setPending({ kind: 'clear' });
      return;
    }
    const parsed = parsePercentInput(rateInput);
    if ('error' in parsed) { setFormError(parsed.error); return; }
    if (parsed.rate === data.overrideRate) { setFormError('Ce taux spécifique est déjà en vigueur.'); return; }
    setPending({ kind: 'set', rate: parsed.rate });
  };

  const confirm = async () => {
    if (!pending || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setDialogError(null);
    try {
      if (pending.kind === 'set') {
        await apiFetch(`/v1/admin/sellers/${sellerProfileId}/commission`, { method: 'PUT', body: JSON.stringify({ rate: rateToApiNumber(pending.rate) }) });
        setFeedback({ type: 'success', message: `Taux spécifique enregistré : ${formatRatePercent(pending.rate)}. Il s’applique aux commandes livrées à partir de maintenant.` });
      } else {
        await apiFetch(`/v1/admin/sellers/${sellerProfileId}/commission`, { method: 'DELETE' });
        setFeedback({ type: 'success', message: 'Taux spécifique retiré. Ce vendeur suit de nouveau les taux par catégorie et le taux par défaut.' });
      }
      setPending(null);
      await load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'L’action n’a pas pu être appliquée. Réessayez.';
      if (err instanceof ApiError && err.status === 409) {
        // Another admin changed it first: reload the authoritative state.
        setPending(null);
        setFeedback({ type: 'error', message: msg });
        await load();
      } else {
        setDialogError(msg);
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-border p-5" aria-labelledby="seller-commission-title">
      <h2 id="seller-commission-title" className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Commission</h2>

      {feedback && (
        <div role="status" className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${feedback.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {feedback.message}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded bg-muted" />)}
        </div>
      ) : loadError || !data ? (
        <div className="text-center py-4">
          <p className="text-sm text-destructive">Impossible de charger la commission de ce vendeur.</p>
          <button type="button" onClick={load} className="admin-button-secondary mt-3">Réessayer</button>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Taux appliqué à ce vendeur</dt>
              <dd className="mt-1 text-2xl font-bold text-foreground">{formatRatePercent(data.effectiveRate)}</dd>
              <dd className="text-xs text-muted-foreground">{data.effectiveSource === 'SELLER' ? 'Taux spécifique' : data.effectiveSource === 'GLOBAL' ? 'Taux par défaut' : 'Non configuré'}</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Taux spécifique du vendeur</dt>
              <dd className="mt-1 text-lg font-semibold text-foreground">{data.overrideRate !== null ? formatRatePercent(data.overrideRate) : 'Aucun'}</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Taux par défaut de la plateforme</dt>
              <dd className="mt-1 text-lg font-semibold text-foreground">{formatRatePercent(data.platformDefaultRate)}</dd>
              <dd className="text-xs"><Link href="/dashboard/commission" className="text-primary hover:underline">Gérer les taux</Link></dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-foreground">{describeEffective(data)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{PRECEDENCE_COPY}</p>

          <fieldset className="mt-4 space-y-3">
            <legend className="text-sm font-medium text-foreground">Modifier</legend>
            <label className="flex items-start gap-3 text-sm">
              <input type="radio" name="commission-mode" value="default" checked={mode === 'default'} onChange={() => { setMode('default'); setFormError(null); }} className="mt-1" />
              <span><span className="font-medium text-foreground">Utiliser le taux par défaut de la plateforme</span><span className="block text-xs text-muted-foreground">Le vendeur suit le taux par défaut ({formatRatePercent(data.platformDefaultRate)}) et les taux par catégorie.</span></span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="radio" name="commission-mode" value="override" checked={mode === 'override'} onChange={() => { setMode('override'); setFormError(null); }} className="mt-1" />
              <span className="flex-1">
                <span className="font-medium text-foreground">Taux spécifique à ce vendeur</span>
                <span className="block text-xs text-muted-foreground">Remplace le taux par défaut et les taux par catégorie pour toutes ses ventes.</span>
                {mode === 'override' && (
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rateInput}
                      onChange={(e) => { setRateInput(e.target.value); setFormError(null); }}
                      aria-label="Taux spécifique en pourcentage"
                      placeholder="ex. 8,25"
                      className="w-28 rounded-lg border border-input bg-background px-3 py-2 text-right text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    <span className="text-xs text-muted-foreground">{PERCENT_INPUT_HINT}</span>
                  </span>
                )}
              </span>
            </label>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={ask} disabled={!dirty || !!pending} className="admin-button-primary">
                {mode === 'default' ? 'Retirer le taux spécifique' : 'Enregistrer le taux spécifique'}
              </button>
              {!dirty && <span className="text-xs text-muted-foreground">Aucune modification en attente.</span>}
            </div>
          </fieldset>

          <p className="mt-4 text-xs text-muted-foreground">
            {data.lastChange
              ? `Dernière modification le ${fmtDateTime(data.lastChange.createdAt)} par ${person(data.lastChange.actor)}.`
              : 'Aucune modification enregistrée pour ce vendeur.'}
          </p>
        </>
      )}

      {pending && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button type="button" aria-label="Annuler" className="fixed inset-0 bg-black/50" onClick={() => !submitting && setPending(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="seller-commission-dialog" className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-white shadow-xl">
            <div className="p-6">
              <h3 id="seller-commission-dialog" className="text-lg font-semibold text-foreground">
                {pending.kind === 'set' ? `Taux spécifique pour ${data.businessName}` : `Retirer le taux spécifique de ${data.businessName}`}
              </h3>
              <p className="mt-3 text-sm text-foreground">
                {pending.kind === 'set'
                  ? <>{data.overrideRate !== null ? `${formatRatePercent(data.overrideRate)} → ` : `Taux par défaut ${formatRatePercent(data.platformDefaultRate)} → `}<strong>{formatRatePercent(pending.rate)}</strong> sur toutes les ventes livrées de ce vendeur, quelle que soit la catégorie.</>
                  : <>Le taux spécifique de {formatRatePercent(data.overrideRate)} est retiré. Ce vendeur suit de nouveau le taux par défaut ({formatRatePercent(data.platformDefaultRate)}) et les taux par catégorie.</>}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{HISTORY_COPY} Cette modification est enregistrée avec votre nom dans l’historique.</p>
              {dialogError && <p role="alert" className="mt-3 text-sm text-destructive">{dialogError}</p>}
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setPending(null)} disabled={submitting} className="admin-button-secondary">Annuler</button>
                <button type="button" onClick={confirm} disabled={submitting} className={pending.kind === 'clear' ? 'inline-flex min-h-11 items-center rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50' : 'admin-button-primary'}>
                  {submitting ? 'Envoi…' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
