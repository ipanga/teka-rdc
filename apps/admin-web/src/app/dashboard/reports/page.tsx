'use client';

import { useState, useCallback } from 'react';
import { apiFetch, SURFACE } from '@/lib/api-client';

type ReportTab = 'sales' | 'financial' | 'sellers' | 'payouts';

// Tabs that support the optional sellerId filter.
const SELLER_FILTERABLE: ReportTab[] = ['sellers', 'payouts'];

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

        const endpoint = `/v1/admin/reports/${activeTab}?${params}`;
        const res = await apiFetch<{ data: ReportRow[]; pagination: Pagination }>(endpoint);
        const rows = res.data?.data ?? [];
        setData(rows);
        setPagination(res.data?.pagination ?? null);
        setColumns(rows.length > 0 ? Object.keys(rows[0]) : []);
        setHasLoaded(true);
      } catch {
        setData([]);
        setColumns([]);
        setPagination(null);
        setLoadError(true);
        setHasLoaded(true);
      } finally {
        setIsLoading(false);
      }
    },
    [activeTab, dateFrom, dateTo, sellerId],
  );

  const handleDownloadCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (SELLER_FILTERABLE.includes(activeTab) && sellerId) params.set('sellerId', sellerId);

      const url = `${API_BASE}/v1/admin/reports/${activeTab}/csv?${params}`;
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
  ];

  const formatCellValue = (value: string | number | null): string => {
    if (value === null || value === undefined) return '-';
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
                      {col}
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
                        {formatCellValue(row[col])}
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
    </div>
  );
}
