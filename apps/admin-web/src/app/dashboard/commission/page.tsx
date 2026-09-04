'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import {
  HISTORY_ACTION_LABELS,
  HISTORY_COPY,
  PERCENT_INPUT_HINT,
  PRECEDENCE_COPY,
  formatRatePercent,
  parsePercentInput,
  rateToApiNumber,
  rateToPercentInput,
} from '@/lib/commission';

interface SettingRow {
  id: string;
  categoryId: string | null;
  rate: string;
  isActive: boolean;
  updatedAt?: string;
  category?: { id: string; name: string } | null;
}
interface Category { id: string; name: string }
interface Person { id: string; firstName: string | null; lastName: string | null }
interface HistoryRow {
  id: string;
  action: string;
  createdAt: string;
  actor: Person;
  target: { kind: 'PLATFORM' | 'CATEGORY' | 'SELLER'; label: string; id: string };
  beforeRate: string | null;
  afterRate: string | null;
}

const person = (p?: Person | null) =>
  p && (p.firstName || p.lastName) ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : 'Administrateur';
const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-CD', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : 'L’action n’a pas pu être appliquée. Réessayez.';

type PendingAction =
  | { kind: 'global'; rate: string }
  | { kind: 'category-set'; categoryId: string; categoryName: string; rate: string; previous: string | null }
  | { kind: 'category-remove'; categoryId: string; categoryName: string; previous: string };

export default function CommissionPage() {
  const [settings, setSettings] = useState<SettingRow[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [globalInput, setGlobalInput] = useState('');
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState('');
  const [addRate, setAddRate] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 6000);
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const [s, h] = await Promise.all([
        apiFetch<SettingRow[]>('/v1/admin/commission-settings'),
        apiFetch<HistoryRow[]>('/v1/admin/commission-settings/history?limit=30'),
      ]);
      const rows = Array.isArray(s.data) ? s.data : [];
      setSettings(rows);
      setHistory(Array.isArray(h.data) ? h.data : []);
      const global = rows.find((r) => !r.categoryId && r.isActive);
      setGlobalInput(global ? rateToPercentInput(global.rate) : '');
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    apiFetch<Category[]>('/v1/browse/categories')
      .then((res) => setCategories(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCategories([]));
  }, [load]);

  const global = settings?.find((r) => !r.categoryId && r.isActive) ?? null;
  const categoryRows = (settings ?? []).filter((r) => r.categoryId && r.isActive);
  const availableCategories = categories.filter((c) => !categoryRows.some((r) => r.categoryId === c.id));
  const lastGlobalChange = history?.find((h) => h.target.kind === 'PLATFORM') ?? null;

  // --- Intent → confirmation dialog (nothing is sent before confirmation) ---
  const askGlobal = () => {
    const parsed = parsePercentInput(globalInput);
    if ('error' in parsed) { setGlobalError(parsed.error); return; }
    if (global && parsed.rate === global.rate) { setGlobalError('Ce taux est déjà le taux par défaut en vigueur.'); return; }
    setGlobalError(null);
    setDialogError(null);
    setPending({ kind: 'global', rate: parsed.rate });
  };
  const askAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cat = categories.find((c) => c.id === addCategoryId);
    if (!cat) { setAddError('Choisissez une catégorie.'); return; }
    const parsed = parsePercentInput(addRate);
    if ('error' in parsed) { setAddError(parsed.error); return; }
    setAddError(null);
    setDialogError(null);
    setPending({ kind: 'category-set', categoryId: cat.id, categoryName: cat.name, rate: parsed.rate, previous: null });
  };
  const askEdit = (row: SettingRow) => {
    const parsed = parsePercentInput(editRate);
    if ('error' in parsed) { setEditError(parsed.error); return; }
    if (parsed.rate === row.rate) { setEditError('Ce taux est déjà en vigueur pour cette catégorie.'); return; }
    setEditError(null);
    setDialogError(null);
    setPending({ kind: 'category-set', categoryId: row.categoryId!, categoryName: row.category?.name ?? '—', rate: parsed.rate, previous: row.rate });
  };
  const askRemove = (row: SettingRow) => {
    setDialogError(null);
    setPending({ kind: 'category-remove', categoryId: row.categoryId!, categoryName: row.category?.name ?? '—', previous: row.rate });
  };

  const confirm = async () => {
    if (!pending || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setDialogError(null);
    try {
      if (pending.kind === 'global') {
        // expectedPreviousRate = the value this screen showed; 409 if another admin changed it since.
        await apiFetch('/v1/admin/commission-settings', { method: 'PUT', body: JSON.stringify({ rate: rateToApiNumber(pending.rate), expectedPreviousRate: rateToApiNumber(global?.rate ?? null) }) });
        showFeedback('success', `Taux par défaut enregistré : ${formatRatePercent(pending.rate)}. Il s’applique aux commandes livrées à partir de maintenant.`);
      } else if (pending.kind === 'category-set') {
        await apiFetch(`/v1/admin/commission-settings/${pending.categoryId}`, { method: 'PUT', body: JSON.stringify({ rate: rateToApiNumber(pending.rate), expectedPreviousRate: rateToApiNumber(pending.previous) }) });
        showFeedback('success', `Taux de la catégorie « ${pending.categoryName} » enregistré : ${formatRatePercent(pending.rate)}.`);
        setShowAddForm(false); setAddCategoryId(''); setAddRate('');
        setEditingCategoryId(null); setEditRate('');
      } else {
        await apiFetch(`/v1/admin/commission-settings/${pending.categoryId}`, { method: 'DELETE' });
        showFeedback('success', `Taux de la catégorie « ${pending.categoryName} » retiré. Ses articles suivent de nouveau le taux par défaut.`);
      }
      setPending(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Another admin changed this rate first: drop the intent, reload the authoritative state.
        setPending(null);
        showFeedback('error', err.message);
        await load();
      } else {
        setDialogError(errorMessage(err));
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const percentInput = (value: string, onChange: (v: string) => void, id: string, ariaLabel: string) => (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        placeholder="ex. 8,25"
        className="w-28 rounded-lg border border-input bg-background px-3 py-2 text-right text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );

  return (
    <div className="admin-page">
      {feedback && (
        <div role="status" className={`rounded-lg px-4 py-3 text-sm font-medium ${feedback.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {feedback.message}
        </div>
      )}

      <PageHeader
        eyebrow="Finance"
        title="Commissions"
        description={`${PRECEDENCE_COPY} ${HISTORY_COPY}`}
      />

      {isLoading ? (
        <div className="space-y-4" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="admin-card p-6"><div className="h-5 w-1/3 animate-pulse rounded bg-muted" /><div className="mt-4 h-10 w-1/2 animate-pulse rounded bg-muted" /></div>
          ))}
        </div>
      ) : loadError ? (
        <div className="admin-card p-10 text-center">
          <p className="text-sm text-destructive">Impossible de charger la configuration des commissions.</p>
          <button type="button" onClick={load} className="admin-button-secondary mt-3">Réessayer</button>
        </div>
      ) : (
        <>
          {/* Platform default */}
          <section className="admin-card p-6" aria-labelledby="global-title">
            <h2 id="global-title" className="text-lg font-semibold text-foreground">Taux par défaut de la plateforme</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Appliqué à toute vente livrée dont le vendeur n’a pas de taux spécifique et dont la catégorie n’a pas de taux propre.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">En vigueur</p>
                {global ? (
                  <p className="mt-1 text-3xl font-bold text-foreground">{formatRatePercent(global.rate)}</p>
                ) : (
                  <p className="mt-1 text-sm font-semibold text-destructive">Non configuré — aucune commande ne peut être livrée tant qu’un taux par défaut n’existe pas.</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {lastGlobalChange
                    ? `Dernière modification le ${fmtDateTime(lastGlobalChange.createdAt)} par ${person(lastGlobalChange.actor)}${lastGlobalChange.beforeRate ? ` (${formatRatePercent(lastGlobalChange.beforeRate)} → ${formatRatePercent(lastGlobalChange.afterRate)})` : ''}.`
                    : global?.updatedAt
                      ? `Dernière mise à jour le ${fmtDateTime(global.updatedAt)}.`
                      : ''}
                </p>
              </div>
              <div>
                <label htmlFor="global-rate" className="block text-sm font-medium text-foreground">Nouveau taux par défaut</label>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  {percentInput(globalInput, (v) => { setGlobalInput(v); setGlobalError(null); }, 'global-rate', 'Nouveau taux par défaut en pourcentage')}
                  <button type="button" onClick={askGlobal} disabled={!!pending} className="admin-button-primary">Enregistrer</button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{PERCENT_INPUT_HINT}</p>
                {globalError && <p role="alert" className="mt-1 text-sm text-destructive">{globalError}</p>}
              </div>
            </div>
          </section>

          {/* Category rates */}
          <section className="admin-card overflow-hidden" aria-labelledby="category-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
              <div>
                <h2 id="category-title" className="text-lg font-semibold text-foreground">Taux par catégorie</h2>
                <p className="mt-1 text-sm text-muted-foreground">Remplace le taux par défaut pour les articles de la catégorie, sauf si le vendeur a un taux spécifique.</p>
              </div>
              <button type="button" onClick={() => { setShowAddForm((v) => !v); setAddError(null); }} className="admin-button-secondary">
                {showAddForm ? 'Fermer' : 'Ajouter un taux par catégorie'}
              </button>
            </div>

            {showAddForm && (
              <form onSubmit={askAdd} className="flex flex-wrap items-end gap-4 border-b border-border bg-muted/40 px-6 py-4">
                <div className="min-w-[220px] flex-1">
                  <label htmlFor="add-category" className="block text-sm font-medium text-foreground">Catégorie <span className="text-destructive">*</span></label>
                  <select id="add-category" value={addCategoryId} onChange={(e) => { setAddCategoryId(e.target.value); setAddError(null); }} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">— Choisir —</option>
                    {availableCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="add-rate" className="block text-sm font-medium text-foreground">Taux <span className="text-destructive">*</span></label>
                  <div className="mt-1">{percentInput(addRate, (v) => { setAddRate(v); setAddError(null); }, 'add-rate', 'Taux de la catégorie en pourcentage')}</div>
                </div>
                <button type="submit" disabled={!!pending} className="admin-button-primary">Enregistrer</button>
                {addError && <p role="alert" className="basis-full text-sm text-destructive">{addError}</p>}
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    {['Catégorie', 'Taux', 'Actions'].map((h) => <th key={h} className="px-6 py-3 text-left text-sm font-medium text-muted-foreground">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-muted-foreground">Aucun taux par catégorie. Tous les articles suivent le taux par défaut (ou le taux spécifique du vendeur).</td></tr>
                  ) : categoryRows.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-6 py-3 text-sm font-medium text-foreground">{row.category?.name ?? '—'}</td>
                      <td className="px-6 py-3 text-sm text-foreground">
                        {editingCategoryId === row.categoryId ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {percentInput(editRate, (v) => { setEditRate(v); setEditError(null); }, `edit-${row.id}`, `Nouveau taux pour ${row.category?.name ?? 'la catégorie'}`)}
                            <button type="button" onClick={() => askEdit(row)} disabled={!!pending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Enregistrer</button>
                            <button type="button" onClick={() => { setEditingCategoryId(null); setEditRate(''); setEditError(null); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">Annuler</button>
                            {editError && <p role="alert" className="basis-full text-xs text-destructive">{editError}</p>}
                          </div>
                        ) : (
                          <span className="font-semibold">{formatRatePercent(row.rate)}</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        {editingCategoryId !== row.categoryId && (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { setEditingCategoryId(row.categoryId); setEditRate(rateToPercentInput(row.rate)); setEditError(null); }} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/70">Modifier</button>
                            <button type="button" onClick={() => askRemove(row)} className="rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/20">Retirer</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* History */}
          <section className="admin-card overflow-hidden" aria-labelledby="history-title">
            <div className="border-b border-border px-6 py-4">
              <h2 id="history-title" className="text-lg font-semibold text-foreground">Historique des modifications</h2>
              <p className="mt-1 text-sm text-muted-foreground">Qui a changé quel taux, quand, et de quelle valeur à quelle valeur. Les taux spécifiques des vendeurs se règlent depuis la fiche de chaque vendeur.</p>
            </div>
            {!history || history.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">Aucune modification enregistrée.</p>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">{HISTORY_ACTION_LABELS[h.action] ?? h.action}</span>
                      <span className="text-muted-foreground"> · </span>
                      {h.target.kind === 'SELLER' ? (
                        <Link href={`/dashboard/sellers/${h.target.id}`} className="text-primary hover:underline">{h.target.label}</Link>
                      ) : (
                        <span className="text-foreground">{h.target.label}</span>
                      )}
                      <span className="text-muted-foreground"> : {h.beforeRate !== null ? `${formatRatePercent(h.beforeRate)} → ` : ''}{h.afterRate !== null ? formatRatePercent(h.afterRate) : 'retiré'}</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(h.createdAt)} · {person(h.actor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Confirmation */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button type="button" aria-label="Annuler" className="fixed inset-0 bg-black/50" onClick={() => !submitting && setPending(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="commission-dialog-title" className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-white shadow-xl">
            <div className="p-6">
              <h3 id="commission-dialog-title" className="text-lg font-semibold text-foreground">
                {pending.kind === 'global' ? 'Modifier le taux par défaut' : pending.kind === 'category-set' ? `Taux de la catégorie « ${pending.categoryName} »` : `Retirer le taux de « ${pending.categoryName} »`}
              </h3>
              <p className="mt-3 text-sm text-foreground">
                {pending.kind === 'global' && <>{global ? `${formatRatePercent(global.rate)} → ` : ''}<strong>{formatRatePercent(pending.rate)}</strong> pour toute vente livrée sans taux spécifique ni taux de catégorie.</>}
                {pending.kind === 'category-set' && <>{pending.previous ? `${formatRatePercent(pending.previous)} → ` : ''}<strong>{formatRatePercent(pending.rate)}</strong> pour les articles de cette catégorie (sauf vendeurs à taux spécifique).</>}
                {pending.kind === 'category-remove' && <>Le taux de {formatRatePercent(pending.previous)} est retiré ; ces articles suivent de nouveau le taux par défaut{global ? ` (${formatRatePercent(global.rate)})` : ''}.</>}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{HISTORY_COPY} Cette modification est enregistrée avec votre nom dans l’historique.</p>
              {dialogError && <p role="alert" className="mt-3 text-sm text-destructive">{dialogError}</p>}
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setPending(null)} disabled={submitting} className="admin-button-secondary">Annuler</button>
                <button type="button" onClick={confirm} disabled={submitting} className={pending.kind === 'category-remove' ? 'inline-flex min-h-11 items-center rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50' : 'admin-button-primary'}>
                  {submitting ? 'Envoi…' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
