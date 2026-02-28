'use client';

import { useTranslations } from 'next-intl';

export type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'popularity';
export type ConditionFilter = '' | 'NEW' | 'USED';

interface ProductFiltersProps {
  condition: ConditionFilter;
  onConditionChange: (v: ConditionFilter) => void;
  minPrice: string;
  onMinPriceChange: (v: string) => void;
  maxPrice: string;
  onMaxPriceChange: (v: string) => void;
  sortBy: SortOption;
  onSortChange: (v: SortOption) => void;
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
