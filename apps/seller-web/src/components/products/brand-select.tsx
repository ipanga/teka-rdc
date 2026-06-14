'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface Brand {
  id: string;
  name: string;
}

interface BrandSelectProps {
  categoryId: string;
  value: string;
  onChange: (brandId: string) => void;
}

/**
 * Brand dropdown scoped to the selected (sub)category. Fetches the active brand
 * library from /v1/brands?categoryId= — never a hardcoded list. Renders nothing
 * until a category is chosen, and hides itself when the category has no brands.
 */
export default function BrandSelect({
  categoryId,
  value,
  onChange,
}: BrandSelectProps) {
  const t = useTranslations('Products');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!categoryId) {
      setBrands([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const res = await apiFetch<Brand[]>(
          `/v1/brands?categoryId=${encodeURIComponent(categoryId)}`,
        );
        if (!cancelled) setBrands(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setBrands([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  if (!categoryId || isLoading) return null;
  if (brands.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <label
        htmlFor="brandId"
        className="block text-sm font-medium text-foreground mb-1"
      >
        {t('brand')}
      </label>
      <select
        id="brandId"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">{t('noBrand')}</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
