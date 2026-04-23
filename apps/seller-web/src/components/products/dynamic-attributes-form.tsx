'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface ProductAttribute {
  id: string;
  categoryId: string;
  name: { fr?: string; en?: string };
  type: 'TEXT' | 'SELECT' | 'MULTISELECT' | 'NUMERIC';
  options: string[];
  isRequired: boolean;
  sortOrder: number;
}

interface DynamicAttributesFormProps {
  categoryId: string;
  onChange: (specs: { attributeId: string; value: string }[]) => void;
  initialValues?: Record<string, string>;
}

export default function DynamicAttributesForm({
  categoryId,
  onChange,
  initialValues,
}: DynamicAttributesFormProps) {
  const t = useTranslations('Products');
  const locale = useLocale();

  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  // Fetch attributes when categoryId changes
  useEffect(() => {
    if (!categoryId) {
      setAttributes([]);
      setValues({});
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function fetchAttributes() {
      try {
        const res = await apiFetch<ProductAttribute[]>(
          `/v1/browse/categories/${categoryId}/attributes`
        );
        if (cancelled) return;
        const attrs = Array.isArray(res.data) ? res.data : [];
        attrs.sort((a, b) => a.sortOrder - b.sortOrder);
        setAttributes(attrs);

        // Initialize values from initialValues if provided
        if (initialValues) {
          setValues(initialValues);
        } else {
          setValues({});
        }
      } catch {
        if (!cancelled) {
          setAttributes([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchAttributes();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  // Notify parent when values change
  const notifyChange = useCallback(
    (newValues: Record<string, string>) => {
      const specs = Object.entries(newValues)
        .filter(([, v]) => v.trim() !== '')
        .map(([attributeId, value]) => ({ attributeId, value }));
      onChange(specs);
    },
    [onChange]
  );

  const handleChange = useCallback(
    (attributeId: string, value: string) => {
      setValues((prev) => {
        const next = { ...prev, [attributeId]: value };
        notifyChange(next);
        return next;
      });
    },
    [notifyChange]
  );

  const handleMultiselectToggle = useCallback(
    (attributeId: string, option: string) => {
      setValues((prev) => {
        const current = prev[attributeId] || '';
        const selected = current ? current.split(',') : [];
        const idx = selected.indexOf(option);
        if (idx >= 0) {
          selected.splice(idx, 1);
        } else {
          selected.push(option);
        }
        const next = { ...prev, [attributeId]: selected.join(',') };
        notifyChange(next);
        return next;
      });
    },
    [notifyChange]
  );

  const getLocalizedName = (name: { fr?: string; en?: string }): string => {
    return name[locale as 'fr' | 'en'] || name.fr || '';
  };

  if (!categoryId) return null;

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="space-y-4">
          <div className="h-5 w-48 bg-muted rounded animate-pulse" />
          <div className="h-10 bg-muted rounded-lg animate-pulse" />
          <div className="h-10 bg-muted rounded-lg animate-pulse" />
          <div className="h-10 bg-muted rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (attributes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">{t('productAttributes')}</h2>
        <p className="text-sm text-muted-foreground">{t('noAttributes')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4">{t('productAttributes')}</h2>
      <div className="space-y-4">
        {attributes.map((attr) => {
          const label = getLocalizedName(attr.name);
          const value = values[attr.id] || '';

          switch (attr.type) {
            case 'SELECT':
              return (
                <div key={attr.id}>
                  <label htmlFor={`attr-${attr.id}`} className="block text-sm font-medium text-foreground mb-1">
                    {label} {attr.isRequired && '*'}
                  </label>
                  <select
                    id={`attr-${attr.id}`}
                    value={value}
                    onChange={(e) => handleChange(attr.id, e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{t('selectOption')}</option>
                    {attr.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              );

            case 'MULTISELECT': {
              const selectedOptions = value ? value.split(',') : [];
              return (
                <div key={attr.id}>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {label} {attr.isRequired && '*'}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {attr.options.map((opt) => {
                      const isChecked = selectedOptions.includes(opt);
                      return (
                        <label
                          key={opt}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                            isChecked
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-input bg-background text-foreground hover:bg-muted'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleMultiselectToggle(attr.id, opt)}
                            className="sr-only"
                          />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            }

            case 'NUMERIC':
              return (
                <div key={attr.id}>
                  <label htmlFor={`attr-${attr.id}`} className="block text-sm font-medium text-foreground mb-1">
                    {label} {attr.isRequired && '*'}
                  </label>
                  <input
                    id={`attr-${attr.id}`}
                    type="number"
                    value={value}
                    onChange={(e) => handleChange(attr.id, e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              );

            case 'TEXT':
            default:
              return (
                <div key={attr.id}>
                  <label htmlFor={`attr-${attr.id}`} className="block text-sm font-medium text-foreground mb-1">
                    {label} {attr.isRequired && '*'}
                  </label>
                  <input
                    id={`attr-${attr.id}`}
                    type="text"
                    value={value}
                    onChange={(e) => handleChange(attr.id, e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              );
          }
        })}
      </div>
    </div>
  );
}
