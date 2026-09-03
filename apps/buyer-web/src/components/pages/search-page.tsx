'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
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
import { track } from '@/lib/analytics';
import { Button, Card, Container } from '@/components/ui';
import type { BrowseProduct, CursorPagination } from '@/lib/types';

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const [products, setProducts] = useState<BrowseProduct[]>([]);
  const [pagination, setPagination] = useState<CursorPagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [condition, setCondition] = useState<ConditionFilter>('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [onPromotion, setOnPromotion] = useState(false);
  const [popular, setPopular] = useState<string[]>([]);

  const filtersRef = useRef({ condition, minPrice, maxPrice, sortBy, onPromotion });
  filtersRef.current = { condition, minPrice, maxPrice, sortBy, onPromotion };

  const selectedCity = useCityStore((s) => s.selectedCity);

  // Popular searches for the zero-result recovery path.
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCity) params.set('cityId', selectedCity.id);
    apiFetch<{ term: string }[]>(`/v1/browse/search/popular?${params.toString()}`)
      .then((res) => setPopular((res.data ?? []).map((r) => r.term).filter(Boolean)))
      .catch(() => setPopular([]));
  }, [selectedCity]);

  function buildQuery(cursor?: string, overrides?: Partial<typeof filtersRef.current>) {
    const f = overrides ? { ...filtersRef.current, ...overrides } : filtersRef.current;
    const qs = new URLSearchParams();
    if (query) qs.set('search', query);
    qs.set('sortBy', f.sortBy);
    qs.set('limit', '12');
    if (f.condition) qs.set('condition', f.condition);
    if (f.minPrice) qs.set('minPrice', f.minPrice);
    if (f.maxPrice) qs.set('maxPrice', f.maxPrice);
    if (f.onPromotion) qs.set('onPromotion', 'true');
    if (selectedCity) qs.set('cityId', selectedCity.id);
    if (cursor) qs.set('cursor', cursor);
    // Applying filters, clearing them, changing the sort or loading the next
    // page all re-run the SAME search — they are refinements, not new demand.
    // Tagging them REFINE is what stops one search being counted many times.
    qs.set('searchSource', 'BUYER_WEB');
    qs.set('searchIntent', 'REFINE');
    return qs.toString();
  }

  async function doFetch(cursor?: string, overrides?: Partial<typeof filtersRef.current>) {
    const qs = buildQuery(cursor, overrides);
    const res = await apiFetch<{ data: BrowseProduct[]; pagination: CursorPagination }>(
      `/v1/browse/products?${qs}`,
    );
    return res.data;
  }

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
    // This effect runs on a change of `q` in the URL — i.e. an actual submitted
    // search (or a suggestion the header turned into /recherche?q=). It is the
    // only buyer-web path that is a new demand signal, and the only one that
    // fires search_performed.
    qs.set('searchSource', 'BUYER_WEB');
    qs.set('searchIntent', 'SUBMIT');
    // NOTE: `cityId` is deliberately NOT added here. This builder has always
    // omitted it, so the first page of a web search is nationwide while a later
    // "Appliquer" is town-scoped. Adding it would change the RESULTS buyers see,
    // which is a product decision and not something an analytics change should
    // smuggle in. The cost is that a web SUBMIT row carries no town; recorded as
    // a known gap in docs/search-sales-analytics.md.
    apiFetch<{ data: BrowseProduct[]; pagination: CursorPagination }>(
      `/v1/browse/products?${qs.toString()}`,
    )
      .then((res) => {
        setProducts(res.data.data);
        setPagination(res.data.pagination);
        // Buyer-owned UI event. Raw query is fine — before_send scrubbing
        // strips any phone number from the payload.
        if (query) {
          track('search_performed', {
            query,
            result_count: res.data.pagination.total,
          });
          if (res.data.pagination.total === 0) {
            track('zero_results', { query });
          }
        }
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
    setOnPromotion(false);
    setShowMobileFilters(false);

    setIsLoading(true);
    setProducts([]);
    doFetch(undefined, { condition: '', minPrice: '', maxPrice: '', sortBy: 'popularity', onPromotion: false })
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
    <main className="flex-1">
      <Container className="py-6 md:py-10">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {"Recherche"}
            </h1>
            {query && pagination && !isLoading && (
              <p className="text-sm text-muted-foreground mt-1">
                {pagination.total > 0
                  ? `${pagination.total} résultat(s) pour "${query}"`
                  : `Aucun résultat pour "${query}".`}
              </p>
            )}
            {query && isLoading && (
              <p className="text-sm text-muted-foreground mt-1">{"Recherche en cours..."}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="md"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="md:hidden shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 6h18M6 12h12M9 18h6"
              />
            </svg>
            {"Filtres"}
          </Button>
        </div>

        <div className="flex gap-6">
          {/* Sidebar filters - desktop */}
          <aside className="hidden md:block w-64 shrink-0">
            <Card padding="md" className="sticky top-20">
              <ProductFilters
                condition={condition}
                onConditionChange={setCondition}
                minPrice={minPrice}
                onMinPriceChange={setMinPrice}
                maxPrice={maxPrice}
                onMaxPriceChange={setMaxPrice}
                sortBy={sortBy}
                onSortChange={setSortBy}
                onPromotion={onPromotion}
                onPromotionChange={setOnPromotion}
                onApply={handleApplyFilters}
                onClear={handleClearFilters}
              />
            </Card>
          </aside>

          {/* Mobile filters drawer */}
          {showMobileFilters && (
            <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm">
              <div
                className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl shadow-xl flex flex-col max-h-[85vh]"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              >
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="text-lg font-bold text-foreground tracking-tight">
                    {"Filtres"}
                  </h3>
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
                    aria-label="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <ProductFilters
                    condition={condition}
                    onConditionChange={setCondition}
                    minPrice={minPrice}
                    onMinPriceChange={setMinPrice}
                    maxPrice={maxPrice}
                    onMaxPriceChange={setMaxPrice}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                    onPromotion={onPromotion}
                    onPromotionChange={setOnPromotion}
                    onApply={handleApplyFilters}
                    onClear={handleClearFilters}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Product grid */}
          <div className="flex-1 min-w-0">
            <ProductGrid products={products} isLoading={isLoading} />

            {/* Zero-result recovery: popular searches as a fallback path. */}
            {!isLoading && query && pagination?.total === 0 && popular.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-foreground mb-2">
                  Essayez une recherche populaire :
                </p>
                <div className="flex flex-wrap gap-2">
                  {popular.map((t) => (
                    <Link
                      key={t}
                      href={`/recherche?q=${encodeURIComponent(t)}`}
                      className="px-3 py-1.5 text-sm rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
                    >
                      {t}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {pagination?.hasMore && !isLoading && (
              <div className="mt-8 text-center">
                <Button
                  variant="default"
                  size="lg"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? "Chargement..." : "Charger plus"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />
      <Suspense
        fallback={
          <main className="flex-1">
            <Container className="py-6 md:py-10">
              <div className="animate-pulse">
                <div className="h-8 bg-muted rounded w-48 mb-6" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Card key={i} padding="none" className="overflow-hidden">
                      <div className="aspect-square bg-muted" />
                      <div className="p-3 space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-5 bg-muted rounded w-1/2" />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </Container>
          </main>
        }
      >
        <SearchContent />
      </Suspense>
      <Footer />
    </div>
  );
}
