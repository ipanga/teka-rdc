'use client';

import { useState, useCallback } from 'react';
import { apiFetch, SURFACE } from '@/lib/api-client';
import { formatFC } from '@teka/shared';
import { SearchAnalyticsPanel } from '@/components/reports/search-analytics-panel';

type ReportTab =
  | 'sales'
  | 'financial'
  | 'sellers'
  | 'payouts'
  | 'breakdown'
  | 'search';

/** Sales-analytics dimensions, mirroring the API's SALES_DIMENSIONS. */
const DIMENSIONS = [
  { key: 'day', label: 'Par jour' },
  { key: 'product', label: 'Par produit' },
  { key: 'category', label: 'Par catégorie' },
  { key: 'seller', label: 'Par vendeur' },
  { key: 'town', label: 'Par ville' },
] as const;

type Dimension = (typeof DIMENSIONS)[number]['key'];

interface SalesSummary {
  completedOrders: number;
  unitsSold: number;
  revenueCDF: string;
  discountCDF: string;
  returnedOrders: number;
  cancelledOrders: number;
  deliveredWithoutDate: number;
  windowApplied: boolean;
}

// Tabs that support the optional sellerId filter.
const SELLER_FILTERABLE: ReportTab[] = ['sellers', 'payouts', 'breakdown'];

interface ReportRow {
  [key: string]: string | number | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 50;

/** French column headers for the breakdown, which has a fixed row shape. */
const BREAKDOWN_COLUMNS: Record<string, string> = {
  label: 'Libellé',
  orders: 'Commandes livrées',
  units: 'Unités vendues',
  revenueCDF: "Chiffre d'affaires",
  discountCDF: 'Remises accordées',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050/api';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [data, setData] = useState<ReportRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dimension, setDimension] = useState<Dimension>('day');
  const [summary, setSummary] = useState<SalesSummary | null>(null);

  // The API paginates every report as { data, pagination } — the same envelope
  // the other admin lists use. Reading `res.data` as a bare array (as this page
  // did before) silently yields an empty table.
  const fetchReport = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      setHasLoaded(false);
      setLoadError(false);
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        if (SELLER_FILTERABLE.includes(activeTab) && sellerId) params.set('sellerId', sellerId);
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));

        if (activeTab === 'breakdown') params.set('by', dimension);

        const endpoint =
          activeTab === 'breakdown'
            ? `/v1/admin/reports/sales/breakdown?${params}`
            : `/v1/admin/reports/${activeTab}?${params}`;

        // The summary is fetched alongside the rows, not derived from them: a
        // page of rows cannot know the totals, and returned/cancelled orders
        // are deliberately not rows at all.
        const [res, sum] = await Promise.all([
          apiFetch<{ data: ReportRow[]; pagination: Pagination }>(endpoint),
          activeTab === 'breakdown'
            ? apiFetch<SalesSummary>(`/v1/admin/reports/sales/summary?${params}`)
            : Promise.resolve(null),
        ]);
        const rows = res.data?.data ?? [];
        setData(rows);
        setPagination(res.data?.pagination ?? null);
        setSummary(sum ? sum.data : null);
        setColumns(
          rows.length > 0
            ? activeTab === 'breakdown'
              ? ['label', 'orders', 'units', 'revenueCDF', 'discountCDF']
              : Object.keys(rows[0])
            : [],
        );
        setHasLoaded(true);
      } catch {
        setData([]);
        setColumns([]);
        setPagination(null);
        setSummary(null);
        setLoadError(true);
        setHasLoaded(true);
      } finally {
        setIsLoading(false);
      }
    },
    [activeTab, dateFrom, dateTo, sellerId, dimension],
  );

  const handleDownloadCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (SELLER_FILTERABLE.includes(activeTab) && sellerId) params.set('sellerId', sellerId);

      if (activeTab === 'breakdown') params.set('by', dimension);
      const url =
        activeTab === 'breakdown'
          ? `${API_BASE}/v1/admin/reports/sales/breakdown/csv?${params}`
          : `${API_BASE}/v1/admin/reports/${activeTab}/csv?${params}`;
      // Raw fetch (not apiFetch) because the response is a CSV blob, not JSON.
      // Still must send X-Teka-Surface so the API reads the admin session
      // cookie (per-surface cookie auth).
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Teka-Surface': SURFACE,
        },
      });

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `report-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch {
      // Download error
    }
  };

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'sales', label: 'Ventes' },
    { key: 'financial', label: 'Financier' },
    { key: 'sellers', label: 'Performance vendeurs' },
    { key: 'payouts', label: 'Virements' },
    { key: 'breakdown', label: 'Analyse des ventes' },
    { key: 'search', label: 'Recherches' },
  ];

  const formatCellValue = (col: string, value: string | number | null): string => {
    if (value === null || value === undefined) return '-';
    // Money columns arrive as centime strings; render them as FC.
    if (activeTab === 'breakdown' && (col === 'revenueCDF' || col === 'discountCDF')) {
      return formatFC(value);
    }
    return String(value);
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">Rapports</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setData([]);
              setColumns([]);
              setPagination(null);
              setSummary(null);
              setHasLoaded(false);
              setLoadError(false);
            }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'search' ? (
        <SearchAnalyticsPanel />
      ) : (
      <>
      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Date de début</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Date de fin</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {activeTab === 'breakdown' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Dimension</label>
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value as Dimension)}
                className="px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {DIMENSIONS.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </div>
          )}
          {SELLER_FILTERABLE.includes(activeTab) && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">ID vendeur (optionnel)</label>
              <input
                type="text"
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                placeholder="UUID du vendeur"
                className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
          <button
            onClick={() => fetchReport(1)}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Chargement..." : "Générer"}
          </button>
          {hasLoaded && data.length > 0 && (
            <button
              onClick={handleDownloadCsv}
              className="px-4 py-2 text-sm font-medium bg-success/10 text-success border border-success/20 rounded-lg hover:bg-success/20 transition-colors"
            >
              Télécharger CSV
            </button>
          )}
        </div>
      </div>

      {/* Sales summary — totals for the whole filtered set, not the page */}
      {activeTab === 'breakdown' && summary && !isLoading && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Commandes livrées', value: String(summary.completedOrders) },
            { label: 'Unités vendues', value: String(summary.unitsSold) },
            { label: "Chiffre d'affaires", value: formatFC(summary.revenueCDF) },
            { label: 'Remises accordées', value: formatFC(summary.discountCDF) },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="text-xl font-semibold text-foreground mt-1">{c.value}</p>
            </div>
          ))}
          <div className="col-span-2 md:col-span-4 text-sm text-muted-foreground">
            {`Hors ventes : ${summary.returnedOrders} retour${summary.returnedOrders > 1 ? 's' : ''}, ${summary.cancelledOrders} annulation${summary.cancelledOrders > 1 ? 's' : ''}.`}
            {' '}
            Le chiffre d&apos;affaires exclut les frais de livraison.
            {summary.deliveredWithoutDate > 0 && (
              <span className="block mt-1 text-warning">
                {`⚠ ${summary.deliveredWithoutDate} commande${summary.deliveredWithoutDate > 1 ? 's' : ''} livrée${summary.deliveredWithoutDate > 1 ? 's' : ''} sans date de livraison`}
                {summary.windowApplied
                  ? " — exclue(s) de ce filtre par période."
                  : ' — incluse(s) ici, mais invisible(s) dès qu\'une période est choisie.'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Data table */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
          Chargement...
        </div>
      ) : hasLoaded ? (
        loadError ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center">
            <p className="text-muted-foreground">
              Le rapport n&apos;a pas pu être chargé.
            </p>
            <button
              onClick={() => fetchReport(1)}
              className="mt-3 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Réessayer
            </button>
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
            Aucune donnée pour cette période
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="text-left px-4 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {activeTab === 'breakdown' ? (BREAKDOWN_COLUMNS[col] ?? col) : col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/50">
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="px-4 py-3 text-sm text-foreground whitespace-nowrap"
                      >
                        {formatCellValue(col, row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {pagination && (
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted-foreground border-t border-border">
                <span>
                  {`Page ${pagination.page} sur ${Math.max(pagination.totalPages, 1)} — ${pagination.total} ligne${pagination.total > 1 ? 's' : ''}`}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchReport(pagination.page - 1)}
                    disabled={isLoading || pagination.page <= 1}
                    className="px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Précédent
                  </button>
                  <button
                    onClick={() => fetchReport(pagination.page + 1)}
                    disabled={isLoading || pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
          Sélectionnez une période et cliquez sur Générer
        </div>
      )}
      </>
      )}
    </div>
  );
}
