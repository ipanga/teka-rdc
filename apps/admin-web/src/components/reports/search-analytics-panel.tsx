'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch, SURFACE } from '@/lib/api-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050/api';
const PAGE_SIZE = 25;

/**
 * Admin search analytics.
 *
 * Every number on this panel counts rows in `search_queries`, and the write
 * path stores ONLY meaningful searches — a filter/sort/page re-fetch (REFINE)
 * and any term under two characters never reach the table. So "Recherches" is
 * the denominator for every rate here, with no hidden second population.
 *
 * `UNKNOWN` is shown as its own source and is never folded into Buyer Web: it
 * means "a client older than the source parameter", not "probably web".
 */

interface Summary {
  totalSearches: number;
  uniqueTerms: number;
  zeroResultSearches: number;
  zeroResultRate: number;
  lowResultSearches: number;
  lowResultRate: number;
  lowResultMax: number;
  suggestionSearches: number;
  suggestionRate: number;
  unknownSourceSearches: number;
}

interface TermRow {
  term: string;
  termNormalized: string;
  searches: number;
  zeroResults: number;
  lastSeen: string | null;
  maxResultCount: number;
  avgResultCount: number;
  neverAnyResult: boolean;
}

interface TrendRow {
  term: string;
  recent: number;
  previous: number;
  delta: number;
  isNew: boolean;
}

interface BreakdownRow {
  key: string | null;
  label: string;
  searches: number;
  zeroResults: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface City {
  id: string;
  name: string;
}

const SOURCE_LABELS: Record<string, string> = {
  BUYER_WEB: 'Site web',
  BUYER_MOBILE: 'Application mobile',
  UNKNOWN: 'Non identifiée',
};

const INTENT_LABELS: Record<string, string> = {
  SUBMIT: 'Recherche lancée',
  SUGGESTION: 'Suggestion choisie',
};

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-CD', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export function SearchAnalyticsPanel() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cityId, setCityId] = useState('');
  const [source, setSource] = useState('');
  const [intent, setIntent] = useState('');
  const [zeroOnly, setZeroOnly] = useState(false);

  const [cities, setCities] = useState<City[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [trending, setTrending] = useState<TrendRow[]>([]);
  const [bySource, setBySource] = useState<BreakdownRow[]>([]);
  const [byIntent, setByIntent] = useState<BreakdownRow[]>([]);
  const [byTown, setByTown] = useState<BreakdownRow[]>([]);
  const [byDay, setByDay] = useState<BreakdownRow[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiFetch<City[]>('/v1/admin/cities')
      .then((res) => setCities(Array.isArray(res.data) ? res.data : []))
      // A failed city list only costs the town filter — never the page.
      .catch(() => setCities([]));
  }, []);

  const params = useCallback(
    (page?: number) => {
      const p = new URLSearchParams();
      if (dateFrom) p.set('dateFrom', dateFrom);
      if (dateTo) p.set('dateTo', dateTo);
      if (cityId) p.set('cityId', cityId);
      if (source) p.set('source', source);
      if (intent) p.set('intent', intent);
      if (zeroOnly) p.set('zeroResultsOnly', 'true');
      if (page) {
        p.set('page', String(page));
        p.set('limit', String(PAGE_SIZE));
      }
      return p;
    },
    [dateFrom, dateTo, cityId, source, intent, zeroOnly],
  );

  const load = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      setLoadError(false);
      try {
        const base = `/v1/admin/reports/search`;
        const [sum, list, trend, src, int, town, day] = await Promise.all([
          apiFetch<Summary>(`${base}/summary?${params()}`),
          apiFetch<{ data: TermRow[]; pagination: Pagination }>(
            `${base}?${params(page)}`,
          ),
          apiFetch<{ data: TrendRow[] }>(`${base}/trending?${params()}`),
          apiFetch<{ data: BreakdownRow[] }>(`${base}/breakdown?by=source&${params()}`),
          apiFetch<{ data: BreakdownRow[] }>(`${base}/breakdown?by=intent&${params()}`),
          apiFetch<{ data: BreakdownRow[] }>(`${base}/breakdown?by=town&${params()}`),
          apiFetch<{ data: BreakdownRow[] }>(`${base}/breakdown?by=day&${params()}`),
        ]);
        setSummary(sum.data);
        setTerms(list.data?.data ?? []);
        setPagination(list.data?.pagination ?? null);
        setTrending(trend.data?.data ?? []);
        setBySource(src.data?.data ?? []);
        setByIntent(int.data?.data ?? []);
        setByTown(town.data?.data ?? []);
        setByDay(day.data?.data ?? []);
        setHasLoaded(true);
      } catch {
        setSummary(null);
        setTerms([]);
        setPagination(null);
        setTrending([]);
        setBySource([]);
        setByIntent([]);
        setByTown([]);
        setByDay([]);
        setLoadError(true);
        setHasLoaded(true);
      } finally {
        setIsLoading(false);
      }
    },
    [params],
  );

  const downloadCsv = async () => {
    try {
      // Raw fetch, not apiFetch: the body is a CSV blob, not JSON. Still needs
      // X-Teka-Surface so the API reads the admin session cookie.
      const res = await fetch(
        `${API_BASE}/v1/admin/reports/search/csv?${params()}`,
        {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Teka-Surface': SURFACE },
        },
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recherches-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // A failed download must not take the page down with it.
    }
  };

  const card = (label: string, value: string, hint?: string) => (
    <div key={label} className="bg-white rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-foreground mt-1">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );

  const miniTable = (title: string, rows: BreakdownRow[], relabel?: Record<string, string>) => (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <p className="px-4 py-3 text-sm font-medium text-foreground border-b border-border">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Aucune donnée</p>
      ) : (
        <table className="w-full">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key ?? r.label} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-sm text-foreground">
                  {relabel?.[r.label] ?? r.label}
                </td>
                <td className="px-4 py-2 text-sm text-right text-foreground whitespace-nowrap">
                  {r.searches}
                </td>
                <td className="px-4 py-2 text-xs text-right text-muted-foreground whitespace-nowrap">
                  {r.zeroResults > 0 ? `${r.zeroResults} sans résultat` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Date de début</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Date de fin</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Ville</label>
            <select value={cityId} onChange={(e) => setCityId(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="">Toutes</option>
              {cities.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="">Toutes</option>
              <option value="BUYER_WEB">Site web</option>
              <option value="BUYER_MOBILE">Application mobile</option>
              <option value="UNKNOWN">Non identifiée</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Intention</label>
            <select value={intent} onChange={(e) => setIntent(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="">Toutes</option>
              <option value="SUBMIT">Recherche lancée</option>
              <option value="SUGGESTION">Suggestion choisie</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground pb-2">
            <input type="checkbox" checked={zeroOnly} onChange={(e) => setZeroOnly(e.target.checked)} />
            Sans résultat uniquement
          </label>
          <button onClick={() => load(1)} disabled={isLoading}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isLoading ? 'Chargement...' : 'Générer'}
          </button>
          {hasLoaded && !loadError && terms.length > 0 && (
            <button onClick={downloadCsv}
              className="px-4 py-2 text-sm font-medium bg-success/10 text-success border border-success/20 rounded-lg hover:bg-success/20 transition-colors">
              Télécharger CSV
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
          Chargement...
        </div>
      ) : !hasLoaded ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
          Sélectionnez une période et cliquez sur Générer
        </div>
      ) : loadError ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <p className="text-muted-foreground">Les statistiques n&apos;ont pas pu être chargées.</p>
          <button onClick={() => load(1)}
            className="mt-3 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            Réessayer
          </button>
        </div>
      ) : summary && summary.totalSearches === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
          Aucune recherche pour ces filtres
        </div>
      ) : (
        <>
          {/* Headline metrics */}
          {summary && (
            <div className="mb-2 grid grid-cols-2 md:grid-cols-4 gap-4">
              {card('Recherches', String(summary.totalSearches))}
              {card('Termes uniques', String(summary.uniqueTerms))}
              {card('Sans résultat', String(summary.zeroResultSearches), `${summary.zeroResultRate} % des recherches`)}
              {card('Suggestions choisies', String(summary.suggestionSearches), `${summary.suggestionRate} % des recherches`)}
            </div>
          )}
          {summary && (
            <p className="text-sm text-muted-foreground mb-6">
              {`Une « recherche » est une recherche lancée ou une suggestion choisie — un changement de filtre, de tri ou de page n'est jamais compté. `}
              {`${summary.lowResultSearches} recherche${summary.lowResultSearches > 1 ? 's' : ''} (${summary.lowResultRate} %) ont ramené entre 1 et ${summary.lowResultMax} produits.`}
              {summary.unknownSourceSearches > 0 && (
                <span className="block mt-1">
                  {`${summary.unknownSourceSearches} recherche${summary.unknownSourceSearches > 1 ? 's' : ''} proviennent d'une application antérieure à l'identification de la source — comptée${summary.unknownSourceSearches > 1 ? 's' : ''} comme « Non identifiée », jamais comme « Site web ».`}
                </span>
              )}
            </p>
          )}

          {/* Primary table — the actionable one */}
          <div className="bg-white rounded-xl border border-border overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-foreground">
                {zeroOnly ? 'Recherches sans résultat' : 'Termes recherchés'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Un terme sans résultat n&apos;est pas forcément un produit manquant : « jamais de résultat » indique une lacune catalogue ou un problème de recherche (faute de frappe, synonyme absent), tandis qu&apos;un terme qui trouve des produits ailleurs signale plutôt une couverture par ville.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Terme</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap">Recherches</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap">Sans résultat</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap">Résultats (moy.)</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap">Diagnostic</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap">Dernière fois</th>
                  </tr>
                </thead>
                <tbody>
                  {terms.map((r) => (
                    <tr key={r.termNormalized} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm text-foreground max-w-xs break-words">{r.term}</td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">{r.searches}</td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">{r.zeroResults || '—'}</td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">{r.avgResultCount}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {r.neverAnyResult ? (
                          <span className="text-destructive">Jamais de résultat</span>
                        ) : r.zeroResults > 0 ? (
                          <span className="text-warning">Selon la ville</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && (
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted-foreground border-t border-border">
                <span>
                  {`Page ${pagination.page} sur ${Math.max(pagination.totalPages, 1)} — ${pagination.total} terme${pagination.total > 1 ? 's' : ''}`}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => load(pagination.page - 1)} disabled={isLoading || pagination.page <= 1}
                    className="px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Précédent
                  </button>
                  <button onClick={() => load(pagination.page + 1)} disabled={isLoading || pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Trending — secondary */}
          <div className="bg-white rounded-xl border border-border overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-foreground">Tendances</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                La période est coupée en deux moitiés égales ; on compare la plus récente à la précédente. Le classement utilise l&apos;écart absolu, pas un pourcentage : à ce volume, un pourcentage calculé sur une base nulle ou minuscule n&apos;aurait aucun sens. Un terme absent de la première moitié est marqué « nouveau ».
              </p>
            </div>
            {trending.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Aucune tendance sur cette période</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Terme</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Période récente</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Période précédente</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {trending.slice(0, 10).map((r) => (
                    <tr key={r.term} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm text-foreground max-w-xs break-words">
                        {r.term}
                        {r.isNew && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary align-middle">nouveau</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">{r.recent}</td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">{r.previous}</td>
                      <td className="px-4 py-3 text-sm text-right text-foreground">{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Dimensional splits — tables, because they read more precisely than charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {miniTable('Par source', bySource, SOURCE_LABELS)}
            {miniTable('Par intention', byIntent, INTENT_LABELS)}
            {miniTable('Par ville', byTown)}
          </div>

          {/* The one place a chart beats a table: volume over time */}
          {byDay.length > 1 && (
            <div className="bg-white rounded-xl border border-border p-4">
              <p className="text-sm font-medium text-foreground mb-3">Recherches par jour</p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={byDay.map((d) => ({ date: d.label, searches: d.searches }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [String(v), 'Recherches']} />
                  <Area type="monotone" dataKey="searches" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
