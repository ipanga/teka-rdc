'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
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
import type { BrowseProduct, CursorPagination } from '@/lib/types';

function SearchContent() {
  const t = useTranslations('Search');
  const tProd = useTranslations('Products');
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const [products, setProducts] = useState<BrowseProduct[]>([]);
  const [pagination, setPagination] = useState<CursorPagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Filter state
  const [condition, setCondition] = useState<ConditionFilter>('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popularity');

  const filtersRef = useRef({ condition, minPrice, maxPrice, sortBy });
  filtersRef.current = { condition, minPrice, maxPrice, sortBy };

  const selectedCity = useCityStore((s) => s.selectedCity);

  function buildQuery(cursor?: string, overrides?: Partial<typeof filtersRef.current>) {
    const f = overrides ? { ...filtersRef.current, ...overrides } : filtersRef.current;
    const qs = new URLSearchParams();
    if (query) qs.set('search', query);
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
    const qs = buildQuery(cursor, overrides);
    const res = await apiFetch<{ data: BrowseProduct[]; pagination: CursorPagination }>(
      `/v1/browse/products?${qs}`,
    );
    return res.data;
  }

  // Fetch when query changes (initial load and new searches)
  useEffect(() => {
    setIsLoading(true);
    setProducts([]);
    setCondition('');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('popularity');

    const qs = new URLSearchParams();
    if (query) qs.set('search', query);
    qs.set('sortBy', 'popularity');
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
  }, [query]);

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
    setSortBy('popularity');
    setShowMobileFilters(false);

    setIsLoading(true);
    setProducts([]);
    doFetch(undefined, { condition: '', minPrice: '', maxPrice: '', sortBy: 'popularity' })
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

  return (
    <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
      {/* Title */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            {t('title')}
          </h1>
          {query && pagination && !isLoading && (
            <p className="text-sm text-muted-foreground mt-1">
              {pagination.total > 0
                ? t('results', { count: pagination.total, query })
                : t('noResults', { query })}
            </p>
          )}
          {query && isLoading && (
            <p className="text-sm text-muted-foreground mt-1">{t('searching')}</p>
          )}
        </div>
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="md:hidden px-4 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
        >
          {tProd('filters')}
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
                <h3 className="text-lg font-bold text-foreground">{tProd('filters')}</h3>
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
                {isLoadingMore ? tProd('loading') : tProd('loadMore')}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <Suspense
        fallback={
          <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded w-48 mb-6" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-lg border border-border overflow-hidden">
                    <div className="aspect-square bg-muted" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-5 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        }
      >
        <SearchContent />
      </Suspense>
      <Footer />
    </div>
  );
}
