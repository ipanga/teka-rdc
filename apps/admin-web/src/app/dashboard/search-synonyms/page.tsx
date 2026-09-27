'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { parseKeywordInput } from '@/lib/category-keywords';

/**
 * Admin page for PRODUCT search synonym groups (API: PR #797,
 * `v1/admin/reports/search/synonyms`). A group is a set of interchangeable
 * terms: a buyer searching any of them also finds products described with the
 * others. Distinct from a category's « Mots-clés de recherche », which only
 * help sellers find a category.
 */

interface SynonymGroup {
  id: string;
  terms: string[];
  note: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ListResponse {
  groups: SynonymGroup[];
  meta: { total: number; active: number };
}

const BASE = '/v1/admin/reports/search/synonyms';

export default function SearchSynonymsPage() {
  const [groups, setGroups] = useState<SynonymGroup[]>([]);
  const [meta, setMeta] = useState<ListResponse['meta'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<SynonymGroup | null>(null);
  const [termsText, setTermsText] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  };

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await apiFetch<ListResponse>(BASE);
      setGroups(res.data.groups);
      setMeta(res.data.meta);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Impossible de charger les synonymes.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setTermsText('');
    setNote('');
    setFormError(null);
  };

  const startEdit = (g: SynonymGroup) => {
    setEditing(g);
    setTermsText(g.terms.join('\n'));
    setNote(g.note ?? '');
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const terms = parseKeywordInput(termsText);
    if (terms.length < 2) {
      setFormError('Un groupe doit contenir au moins 2 termes distincts.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      // On edit an empty note is sent as '' so the admin can clear it.
      const body = JSON.stringify({
        terms,
        note: editing ? note.trim() : note.trim() || undefined,
      });
      if (editing) {
        await apiFetch(`${BASE}/${editing.id}`, { method: 'PATCH', body });
      } else {
        await apiFetch(BASE, { method: 'POST', body });
      }
      showFeedback('success', editing ? 'Groupe mis à jour.' : 'Groupe créé.');
      resetForm();
      load();
    } catch (err) {
      // The API explains refusals in French (term already used by another
      // active group, bounds…): show it beside the form, input kept.
      setFormError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (g: SynonymGroup) => {
    setBusyId(g.id);
    try {
      await apiFetch(`${BASE}/${g.id}/${g.isActive ? 'deactivate' : 'activate'}`, { method: 'PATCH' });
      showFeedback('success', g.isActive ? 'Groupe désactivé.' : 'Groupe réactivé.');
      load();
    } catch (err) {
      showFeedback('error', err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (g: SynonymGroup) => {
    setBusyId(g.id);
    try {
      await apiFetch(`${BASE}/${g.id}`, { method: 'DELETE' });
      showFeedback('success', 'Groupe supprimé.');
      if (editing?.id === g.id) resetForm();
      setConfirmDeleteId(null);
      load();
    } catch (err) {
      showFeedback('error', err instanceof ApiError ? err.message : 'Suppression impossible.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Synonymes de recherche</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Un groupe réunit des termes équivalents : un acheteur qui cherche l&apos;un d&apos;eux
          trouve aussi les produits décrits avec les autres (ex. « gsm », « portable »,
          « smartphone »). Les recherches sans résultat de la page Rapports sont de bons candidats.
        </p>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <form onSubmit={save} className="rounded-xl border border-border bg-white p-5 space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          {editing ? 'Modifier le groupe' : 'Nouveau groupe'}
        </h2>
        <div>
          <label htmlFor="terms" className="block text-sm font-medium text-foreground mb-1">
            Termes équivalents <span className="text-destructive">*</span>
          </label>
          <textarea
            id="terms"
            value={termsText}
            onChange={(e) => setTermsText(e.target.value)}
            rows={3}
            aria-describedby="termsHelp"
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            placeholder={'gsm\nportable\nsmartphone'}
          />
          <p id="termsHelp" className="mt-1 text-xs text-muted-foreground">
            Un terme par ligne ou séparés par des virgules. De 2 à 25 termes, 2 à 60 caractères chacun.
          </p>
        </div>
        <div>
          <label htmlFor="note" className="block text-sm font-medium text-foreground mb-1">
            Note interne
          </label>
          <input
            id="note"
            type="text"
            value={note}
            maxLength={280}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Pourquoi ce groupe existe (facultatif)"
          />
        </div>
        {formError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {formError}
          </div>
        )}
        <div className="flex justify-end gap-3">
          {editing && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Annuler
            </button>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le groupe'}
          </button>
        </div>
      </form>

      <section className="rounded-xl border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-foreground">Groupes</h2>
          {meta && (
            <span className="text-sm text-muted-foreground">
              {meta.active} actif(s) sur {meta.total}
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Chargement…</p>
        ) : loadError ? (
          <div className="px-5 py-6 text-sm">
            <p className="text-red-700">{loadError}</p>
            <button onClick={load} className="mt-2 text-primary font-medium hover:underline">
              Réessayer
            </button>
          </div>
        ) : groups.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Aucun groupe pour le moment. Créez le premier avec le formulaire ci-dessus.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {groups.map((g) => (
              <li key={g.id} className="px-5 py-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {g.terms.map((t) => (
                      <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-sm text-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                  {g.note && <p className="text-xs text-muted-foreground">{g.note}</p>}
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      g.isActive ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {g.isActive ? 'Actif' : 'Désactivé'}
                  </span>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    onClick={() => startEdit(g)}
                    disabled={busyId === g.id}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => toggleActive(g)}
                    disabled={busyId === g.id}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
                  >
                    {g.isActive ? 'Désactiver' : 'Réactiver'}
                  </button>
                  {confirmDeleteId === g.id ? (
                    <>
                      <button
                        onClick={() => remove(g)}
                        disabled={busyId === g.id}
                        className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
                      >
                        Confirmer la suppression
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(g.id)}
                      disabled={busyId === g.id}
                      className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
