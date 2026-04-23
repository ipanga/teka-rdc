'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ProductGrid } from '@/components/product/product-grid';
import {
  ProductFilters,
  type SortOption,
  type ConditionFilter,
} from '@/components/product/product-filters';
import { apiFetch } from '@/lib/api-client';
import { useCityStore } from '@/lib/city-store';
import { getLocalizedName } from '@/lib/format';
import type { BrowseCategory, BrowseProduct, CursorPagination } from '@/lib/types';

export default function CategoryPage() {
  const t = useTranslations('Products');
  const tCat = useTranslations('Categories');
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const categoryId = params.id;

  const [category, setCategory] = useState<BrowseCategory | null>(null);
  const [products, setProducts] = useState<BrowseProduct[]>([]);
  const [pagination, setPagination] = useState<CursorPagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Filter state
  const [condition, setCondition] = useState<ConditionFilter>('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Refs to read current filter state in callbacks without causing re-renders
  const filtersRef = useRef({ condition, minPrice, maxPrice, sortBy });
  filtersRef.current = { condition, minPrice, maxPrice, sortBy };

  const selectedCity = useCityStore((s) => s.selectedCity);

  function buildQuery(cursor?: string, overrides?: Partial<typeof filtersRef.current>) {
    const f = overrides ? { ...filtersRef.current, ...overrides } : filtersRef.current;
    const qs = new URLSearchParams();
    qs.set('categoryId', categoryId);
    qs.set('sortBy', f.sortBy);
    qs.set('limit', '12');
    if (f.condition) qs.set('condition', f.condition);
    if (f.minPrice) qs.set('minPrice', f.minPrice);
    if (f.maxPrice) qs.set('maxPrice', f.maxPrice);
    if (selectedCity) qs.set('cityId', selectedCity.id);
    if (cursor) qs.set('cursor', cursor);
    return qs.toString();
  }

  async function doFetch(cursor?: string, overrides?: Partial<typeof filtersRef.current>) {
    const query = buildQuery(cursor, overrides);
    const res = await apiFetch<{ data: BrowseProduct[]; pagination: CursorPagination }>(
      `/v1/browse/products?${query}`,
    );
    return res.data;
  }

  // Initial load when categoryId changes
  useEffect(() => {
    setIsLoading(true);
    setProducts([]);
    setCategory(null);
    setCondition('');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('newest');

    // Fetch category info
    apiFetch<BrowseCategory[]>('/v1/browse/categories')
      .then((res) => {
        const found = findCategory(res.data, categoryId);
        setCategory(found);
      })
      .catch(() => {});

    // Fetch products with default filters
    const qs = new URLSearchParams();
    qs.set('categoryId', categoryId);
    qs.set('sortBy', 'newest');
    qs.set('limit', '12');
    apiFetch<{ data: BrowseProduct[]; pagination: CursorPagination }>(
      `/v1/browse/products?${qs.toString()}`,
    )
      .then((res) => {
        setProducts(res.data.data);
        setPagination(res.data.pagination);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  function handleApplyFilters() {
    setIsLoading(true);
    setProducts([]);
    setShowMobileFilters(false);
    doFetch()
      .then((res) => {
        setProducts(res.data);
        setPagination(res.pagination);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }

  function handleClearFilters() {
    setCondition('');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('newest');
    setShowMobileFilters(false);

    setIsLoading(true);
    setProducts([]);
    doFetch(undefined, { condition: '', minPrice: '', maxPrice: '', sortBy: 'newest' })
      .then((res) => {
        setProducts(res.data);
        setPagination(res.pagination);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }

  async function handleLoadMore() {
    if (!pagination?.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await doFetch(pagination.nextCursor);
      setProducts((prev) => [...prev, ...res.data]);
      setPagination(res.pagination);
    } catch {
      // ignore
    } finally {
      setIsLoadingMore(false);
    }
  }

  const categoryName = category ? getLocalizedName(category.name, locale) : '';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/" className="hover:text-primary transition-colors">
            {tCat('title')}
          </Link>
          <span>/</span>
          {category && (
            <span className="text-foreground font-medium">{categoryName}</span>
          )}
        </nav>

        {/* Title + mobile filter toggle */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            {categoryName || tCat('title')}
            {pagination && (
              <span className="text-base font-normal text-muted-foreground ml-2">
                ({t('results', { count: pagination.total })})
              </span>
            )}
          </h1>
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="md:hidden px-4 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
          >
            {t('filters')}
          </button>
        </div>

        <div className="flex gap-6">
          {/* Sidebar filters - desktop */}
          <aside className="hidden md:block w-64 shrink-0">
            <div className="sticky top-20 bg-white rounded-lg border border-border p-4">
              <ProductFilters
                condition={condition}
                onConditionChange={setCondition}
                minPrice={minPrice}
                onMinPriceChange={setMinPrice}
                maxPrice={maxPrice}
                onMaxPriceChange={setMaxPrice}
                sortBy={sortBy}
                onSortChange={setSortBy}
                onApply={handleApplyFilters}
                onClear={handleClearFilters}
              />
            </div>
          </aside>

          {/* Mobile filters overlay */}
          {showMobileFilters && (
            <div className="md:hidden fixed inset-0 z-40 bg-black/50">
              <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-6 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground">{t('filters')}</h3>
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <ProductFilters
                  condition={condition}
                  onConditionChange={setCondition}
                  minPrice={minPrice}
                  onMinPriceChange={setMinPrice}
                  maxPrice={maxPrice}
                  onMaxPriceChange={setMaxPrice}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onApply={handleApplyFilters}
                  onClear={handleClearFilters}
                />
              </div>
            </div>
          )}

          {/* Product grid */}
          <div className="flex-1 min-w-0">
            <ProductGrid products={products} isLoading={isLoading} />

            {/* Load more */}
            {pagination?.hasMore && !isLoading && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="px-8 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoadingMore ? t('loading') : t('loadMore')}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

/** Recursively find a category by ID in the tree */
function findCategory(
  categories: BrowseCategory[],
  id: string,
): BrowseCategory | null {
  for (const cat of categories) {
    if (cat.id === id) return cat;
    if (cat.subcategories) {
      const found = findCategory(cat.subcategories, id);
      if (found) return found;
    }
  }
  return null;
}
