'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import Link from 'next/link';
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
import type { BrowseCategory, BrowseProduct, CursorPagination } from '@/lib/types';

interface CategoryPageProps {
  /**
   * Pre-resolved category UUID from the server route. The server already
   * fetched the category (by id or slug) for SEO metadata; pass the UUID
   * down so we don't double-fetch on the client. Falls back to params.id
   * for the legacy /categories/[id] route.
   */
  categoryUuid?: string;
}

export default function CategoryPage({ categoryUuid }: CategoryPageProps = {}) {
  const t = useTranslations('Products');
  const tCat = useTranslations('Categories');
  const params = useParams<{ id?: string; slug?: string }>();
  const categoryId = categoryUuid ?? params.id ?? '';

  const [category, setCategory] = useState<BrowseCategory | null>(null);
  const [products, setProducts] = useState<BrowseProduct[]>([]);
  const [pagination, setPagination] = useState<CursorPagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [condition, setCondition] = useState<ConditionFilter>('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const filtersRef = useRef({ condition, minPrice, maxPrice, sortBy });
  filtersRef.current = { condition, minPrice, maxPrice, sortBy };

  const selectedCity = useCityStore((s) => s.selectedCity);

  // Buyer-owned UI event — one per category view (keyed on the resolved id).
  useEffect(() => {
    if (!categoryId) return;
    track('category_viewed', { categoryId, slug: params.slug });
  }, [categoryId, params.slug]);

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

  useEffect(() => {
    setIsLoading(true);
    setProducts([]);
    setCategory(null);
    setCondition('');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('newest');

    apiFetch<BrowseCategory[]>('/v1/browse/categories')
      .then((res) => {
        const found = findCategory(res.data, categoryId);
        setCategory(found);
      })
      .catch(() => {});

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

  const categoryName = category ? category.name ?? '' : '';

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1">
        <Container className="py-6 md:py-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5 overflow-x-auto">
            <Link href="/" className="hover:text-primary transition-colors shrink-0">
              {tCat('title')}
            </Link>
            <span>/</span>
            {category && (
              <span className="text-foreground font-medium truncate">{categoryName}</span>
            )}
          </nav>

          {/* Title + mobile filter toggle */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {categoryName || tCat('title')}
              {pagination && (
                <span className="text-base font-normal text-muted-foreground ml-2">
                  ({t('results', { count: pagination.total })})
                </span>
              )}
            </h1>
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
              {t('filters')}
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
                      {t('filters')}
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

              {pagination?.hasMore && !isLoading && (
                <div className="mt-8 text-center">
                  <Button
                    variant="default"
                    size="lg"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? t('loading') : t('loadMore')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
}

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
