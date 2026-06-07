'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface CategoryCoverage {
  categoryId: string;
  categoryName: string;
  realCount: number;
  demoCount: number;
}

export default function CatalogCoveragePage() {
  const t = useTranslations('CatalogCoverage');
  const [rows, setRows] = useState<CategoryCoverage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<CategoryCoverage[]>(
          '/v1/admin/stats/catalog-coverage',
        );
        if (!cancelled) setRows(res.data);
      } catch {
        // Error surfaced by apiFetch; leave the table empty.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalReal = rows.reduce((s, r) => s + r.realCount, 0);
  const coveredCategories = rows.filter((r) => r.realCount > 0).length;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-foreground mb-2">{t('title')}</h1>
      <p className="text-muted-foreground mb-6">{t('subtitle')}</p>

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
                  <td className="px-4 py-3">
                    {r.realCount > 0 ? (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-success/10 text-success">
                        {t('covered')}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                        {t('noRealSellers')}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
