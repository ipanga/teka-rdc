'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

type ReportTab = 'sales' | 'financial' | 'sellers';

interface ReportRow {
  [key: string]: string | number | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050/api';

export default function ReportsPage() {
  const t = useTranslations('Reports');
  const tCommon = useTranslations('Common');

  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [data, setData] = useState<ReportRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setHasLoaded(false);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (activeTab === 'sellers' && sellerId) params.set('sellerId', sellerId);

      const endpoint = `/v1/admin/reports/${activeTab}?${params}`;
      const res = await apiFetch<ReportRow[]>(endpoint);
      const rows = Array.isArray(res.data) ? res.data : [];
      setData(rows);
      if (rows.length > 0) {
        setColumns(Object.keys(rows[0]));
      } else {
        setColumns([]);
      }
      setHasLoaded(true);
    } catch {
      setData([]);
      setColumns([]);
      setHasLoaded(true);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, dateFrom, dateTo, sellerId]);

  const handleDownloadCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (activeTab === 'sellers' && sellerId) params.set('sellerId', sellerId);

      const url = `${API_BASE}/v1/admin/reports/${activeTab}/csv?${params}`;
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
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
    { key: 'sales', label: t('sales') },
    { key: 'financial', label: t('financial') },
    { key: 'sellers', label: t('sellerPerformance') },
  ];

  const formatCellValue = (value: string | number | null): string => {
    if (value === null || value === undefined) return '-';
    return String(value);
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setData([]); setColumns([]); setHasLoaded(false); }}
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
            <label className="block text-sm font-medium text-foreground mb-1">{t('dateFrom')}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('dateTo')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {activeTab === 'sellers' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('sellerIdFilter')}</label>
              <input
                type="text"
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                placeholder={t('sellerIdPlaceholder')}
                className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
          <button
            onClick={fetchReport}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? tCommon('loading') : t('generate')}
          </button>
          {hasLoaded && data.length > 0 && (
            <button
              onClick={handleDownloadCsv}
              className="px-4 py-2 text-sm font-medium bg-success/10 text-success border border-success/20 rounded-lg hover:bg-success/20 transition-colors"
            >
              {t('downloadCsv')}
            </button>
          )}
        </div>
      </div>

      {/* Data table */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
          {tCommon('loading')}
        </div>
      ) : hasLoaded ? (
        data.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
            {t('noData')}
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
                {data.slice(0, 50).map((row, idx) => (
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
            {data.length > 50 && (
              <div className="px-4 py-3 text-sm text-muted-foreground border-t border-border">
                {t('showingRows', { count: 50, total: data.length })}
              </div>
            )}
          </div>
        )
      ) : (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
          {t('selectFilters')}
        </div>
      )}
    </div>
  );
}
