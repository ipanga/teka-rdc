'use client';

import { useTranslations } from 'next-intl';

export type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'popularity';
export type ConditionFilter = '' | 'NEW' | 'USED';

/**
 * A filterable category attribute (SELECT / MULTISELECT only). `name` comes
 * from the API as a JSON-encoded `{ fr, en }` string for legacy attributes;
 * {@link attrLabel} extracts the French label. `options` is a plain string[].
 */
export interface FacetAttribute {
  id: string;
  name: string;
  type: 'SELECT' | 'MULTISELECT' | 'TEXT' | 'NUMERIC';
  options: string[];
}

/**
 * Attribute names are stored as `{"fr":"Marque","en":"Brand"}` JSONB and reach
 * the client as a JSON-encoded string. Parse out the French label, tolerating
 * plain strings and malformed values so the UI never renders raw JSON.
 */
export function attrLabel(name: string): string {
  if (!name) return '';
  if (name.startsWith('{')) {
    try {
      const parsed = JSON.parse(name) as { fr?: string; en?: string };
      return parsed.fr ?? parsed.en ?? name;
    } catch {
      return name;
    }
  }
  return name;
}

interface ProductFiltersProps {
  condition: ConditionFilter;
  onConditionChange: (v: ConditionFilter) => void;
  minPrice: string;
  onMinPriceChange: (v: string) => void;
  maxPrice: string;
  onMaxPriceChange: (v: string) => void;
  sortBy: SortOption;
  onSortChange: (v: SortOption) => void;
  /** SELECT/MULTISELECT attributes for the current category (may be empty). */
  attributes?: FacetAttribute[];
  /** attributeId -> selected option values. */
  selectedAttributes?: Record<string, string[]>;
  /** Toggle one option value on/off for an attribute. */
  onAttributeToggle?: (attributeId: string, value: string) => void;
  onApply: () => void;
  onClear: () => void;
}

export function ProductFilters({
  condition,
  onConditionChange,
  minPrice,
  onMinPriceChange,
  maxPrice,
  onMaxPriceChange,
  sortBy,
  onSortChange,
  attributes,
  selectedAttributes,
  onAttributeToggle,
  onApply,
  onClear,
}: ProductFiltersProps) {
  const t = useTranslations('Products');

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
        {t('filters')}
      </h3>

      {/* Sort */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {t('sortBy')}
        </label>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="newest">{t('sort_newest')}</option>
          <option value="popularity">{t('sort_popularity')}</option>
          <option value="price_asc">{t('sort_price_asc')}</option>
          <option value="price_desc">{t('sort_price_desc')}</option>
        </select>
      </div>

      {/* Condition */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {t('condition')}
        </label>
        <select
          value={condition}
          onChange={(e) => onConditionChange(e.target.value as ConditionFilter)}
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{t('allConditions')}</option>
          <option value="NEW">{t('condition_NEW')}</option>
          <option value="USED">{t('condition_USED')}</option>
        </select>
      </div>

      {/* Price range */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {t('priceRange')} (CDF)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={minPrice}
            onChange={(e) => onMinPriceChange(e.target.value)}
            placeholder={t('minPrice')}
            min="0"
            className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => onMaxPriceChange(e.target.value)}
            placeholder={t('maxPrice')}
            min="0"
            className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Attribute facets (SELECT / MULTISELECT) — only for the current category */}
      {attributes && attributes.length > 0 && onAttributeToggle && (
        <div className="space-y-4">
          {attributes.map((attr) => {
            const selected = selectedAttributes?.[attr.id] ?? [];
            return (
              <div key={attr.id}>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {attrLabel(attr.name)}
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {attr.options.map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 text-sm text-foreground cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(opt)}
                        onChange={() => onAttributeToggle(attr.id, opt)}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                      />
                      <span className="truncate">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onApply}
          className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {t('applyFilters')}
        </button>
        <button
          onClick={onClear}
          className="flex-1 py-2 px-4 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
        >
          {t('clearFilters')}
        </button>
      </div>
    </div>
  );
}
