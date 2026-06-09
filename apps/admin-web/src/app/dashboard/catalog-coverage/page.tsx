'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface CategoryCoverage {
  categoryId: string;
  categoryName: string;
  realCount: number;
  demoCount: number;
}

interface Setting {
  key: string;
  value: string;
}

export default function CatalogCoveragePage() {
  const t = useTranslations('CatalogCoverage');
  const tCommon = useTranslations('Common');

  const [rows, setRows] = useState<CategoryCoverage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Demo-retirement settings (P3c). The generic settings page can also edit
  // these; surfacing them here gives the per-category decision context.
  const [retireEnabled, setRetireEnabled] = useState(false);
  const [threshold, setThreshold] = useState(3);
  const [thresholdInput, setThresholdInput] = useState('3');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [coverage, settings] = await Promise.all([
        apiFetch<CategoryCoverage[]>('/v1/admin/stats/catalog-coverage'),
        apiFetch<Setting[]>('/v1/admin/settings'),
      ]);
      setRows(coverage.data);
      const list = Array.isArray(settings.data) ? settings.data : [];
      const enabled =
        list.find((s) => s.key === 'RETIRE_DEMO_CATALOG')?.value === 'true';
      const thr = parseInt(
        list.find((s) => s.key === 'DEMO_RETIRE_THRESHOLD')?.value ?? '3',
        10,
      );
      setRetireEnabled(enabled);
      const safeThr = Number.isFinite(thr) && thr > 0 ? thr : 3;
      setThreshold(safeThr);
      setThresholdInput(String(safeThr));
    } catch {
      // Error surfaced by apiFetch; leave the table empty.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSetting = async (key: string, value: string) => {
    setSaving(true);
    try {
      await apiFetch(`/v1/admin/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      showFeedback('success', t('saved'));
      await load();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setSaving(false);
    }
  };

  const totalReal = rows.reduce((s, r) => s + r.realCount, 0);
  const coveredCategories = rows.filter((r) => r.realCount > 0).length;

  const statusBadge = (r: CategoryCoverage) => {
    if (retireEnabled && r.realCount >= threshold) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-success/10 text-success">
          {t('retired')}
        </span>
      );
    }
    if (retireEnabled && r.realCount > 0) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-warning/10 text-warning">
          {t('pendingRetire')}
        </span>
      );
    }
    if (r.realCount > 0) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-success/10 text-success">
          {t('covered')}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
        {t('noRealSellers')}
      </span>
    );
  };

  return (
    <div className="p-8">
      {feedback && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <h1 className="text-2xl font-bold text-foreground mb-2">{t('title')}</h1>
      <p className="text-muted-foreground mb-6">{t('subtitle')}</p>

      {/* Demo-retirement control panel (P3c) */}
      <div className="mb-6 bg-white rounded-xl border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t('retirementTitle')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
              {t('retirementHint')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                saveSetting('RETIRE_DEMO_CATALOG', retireEnabled ? 'false' : 'true')
              }
              disabled={saving || isLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 ${
                retireEnabled ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  retireEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-muted-foreground">
              {retireEnabled ? t('enabled') : t('disabled')}
            </span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm text-foreground">{t('thresholdLabel')}</label>
          <input
            type="number"
            min={1}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            className="w-20 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={() => saveSetting('DEMO_RETIRE_THRESHOLD', thresholdInput)}
            disabled={
              saving || isLoading || thresholdInput === String(threshold)
            }
            className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tCommon('save')}
          </button>
        </div>
      </div>

      {!isLoading && (
        <div className="mb-6 text-sm text-muted-foreground">
          {t('summary', {
            covered: coveredCategories,
            total: rows.length,
            real: totalReal,
          })}
        </div>
      )}

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('category')}</th>
              <th className="px-4 py-3 font-medium">{t('realProducts')}</th>
              <th className="px-4 py-3 font-medium">{t('demoProducts')}</th>
              <th className="px-4 py-3 font-medium">{t('status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {t('loading')}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.categoryId}>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {r.categoryName}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {r.realCount}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {r.demoCount}
                  </td>
                  <td className="px-4 py-3">{statusBadge(r)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
