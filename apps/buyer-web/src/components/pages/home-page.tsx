'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ProductGrid } from '@/components/product/product-grid';
import { RecentlyViewed } from '@/components/product/recently-viewed';
import { BannerCarousel } from '@/components/home/banner-carousel';
import { StoreHero } from '@/components/home/store-hero';
import { FlashDealsSection } from '@/components/home/flash-deals-section';
import { Container, SectionHeader } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';
import { useCityStore } from '@/lib/city-store';
import { CitySelectorModal } from '@/components/city/city-selector-modal';
import { CityPrompt } from '@/components/city/city-prompt';
import { CategoryIcon } from '@/components/category/category-icon';
import { categoryHref } from '@/lib/urls';
import type { BrowseCategory, BrowseProduct } from '@/lib/types';

export default function HomePage({ serverH1 }: { serverH1?: string }) {
  const t = useTranslations('Hero');
  const tCat = useTranslations('Categories');
  const tProd = useTranslations('Products');
  const [categories, setCategories] = useState<BrowseCategory[]>([]);
  const [popularProducts, setPopularProducts] = useState<BrowseProduct[]>([]);
  const [newestProducts, setNewestProducts] = useState<BrowseProduct[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingNewest, setLoadingNewest] = useState(true);

  // City store
  const { selectedCity, initFromStorage, fetchCities, maybePromptFirstVisit } =
    useCityStore();
  const [cityInitialized, setCityInitialized] = useState(false);

  // Initialize town from localStorage + load the town list on mount, THEN run
  // the SEO-safe first-visit gate (decision D1): a visitor with no town and no
  // "prompted" cookie gets the town selector auto-opened ONCE — as a client
  // overlay over this already-rendered page (never a content gate, so crawlers
  // still see the full homepage underneath). Returning/known visitors are never
  // interrupted.
  useEffect(() => {
    initFromStorage();
    fetchCities().finally(() => {
      setCityInitialized(true);
      maybePromptFirstVisit();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch data when city changes (only after initialization)
  useEffect(() => {
    if (!cityInitialized) return;

    const cityParam = selectedCity ? `&cityId=${selectedCity.id}` : '';

    // Fetch categories
    setLoadingCategories(true);
    apiFetch<BrowseCategory[]>('/v1/browse/categories')
      .then((res) => setCategories(res.data))
      .catch(() => {})
      .finally(() => setLoadingCategories(false));

    // Fetch popular products (filtered by city)
    setLoadingPopular(true);
    apiFetch<{ data: BrowseProduct[] }>(`/v1/browse/products?sortBy=popularity&limit=10${cityParam}`)
      .then((res) => setPopularProducts(res.data.data))
      .catch(() => {})
      .finally(() => setLoadingPopular(false));

    // Fetch newest products (filtered by city)
    setLoadingNewest(true);
    apiFetch<{ data: BrowseProduct[] }>(`/v1/browse/products?sortBy=newest&limit=10${cityParam}`)
      .then((res) => setNewestProducts(res.data.data))
      .catch(() => {})
      .finally(() => setLoadingNewest(false));
  }, [selectedCity, cityInitialized]);

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />
      {/* Town selector overlay. Opened via the header selector, the inline
          CityPrompt, OR the SEO-safe first-visit gate (maybePromptFirstVisit) —
          always a client overlay over rendered content, never an SSR gate. */}
      <CitySelectorModal />

      <main className="flex-1">
        {/* Non-blocking city chooser (replaces the old forced modal). */}
        <CityPrompt />
        {/* Banner Carousel — replaces the hero when admin banners exist; else
            the shared StoreHero (same component the city landing pages use). */}
        <BannerCarousel
          fallback={
            <StoreHero
              title={serverH1 || t('title')}
              subtitle={t('subtitle', {
                city: selectedCity ? selectedCity.name : 'Congo',
              })}
              ctaHref="/categories"
              ctaLabel={t('cta')}
              city={selectedCity}
              badgeLabel={
                selectedCity
                  ? t('deliveringTo', { city: selectedCity.name })
                  : undefined
              }
            />
          }
        />

        {/* Flash Deals Section — only renders when active deals exist */}
        <FlashDealsSection />

        {/* Categories Section */}
        <section className="bg-background">
          <Container className="py-10 md:py-14">
            <SectionHeader
              title={tCat('title')}
              viewAllHref="/categories"
              viewAllLabel={tCat('viewAll')}
            />

            {loadingCategories ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-5 animate-pulse">
                    <div className="w-16 h-16 bg-muted rounded-full" />
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : categories.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {tCat('noCategories')}
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-4 md:gap-5">
                {categories.slice(0, 14).map((cat) => (
                  <Link
                    key={cat.id}
                    href={categoryHref(selectedCity?.slug, cat)}
                    className="group flex flex-col items-center text-center gap-2.5 rounded-xl p-2 hover:bg-surface-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <CategoryIcon slug={cat.slug} emoji={cat.emoji} size="lg" />
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                      {cat.name ?? ''}
                    </h3>
                  </Link>
                ))}
              </div>
            )}
          </Container>
        </section>

        {/* The old "Achetez dans votre ville" homepage section was removed in
            the Town Architecture Refactor — town selection now lives in the
            header + first-visit modal. The crawlable /{ville} internal links
            moved to the global footer (CityLinks) so SEO discovery is kept. */}

        {/* Recently viewed (client-local; renders nothing until the buyer has
            viewed products). */}
        <RecentlyViewed withContainer />

        {/* Popular Products Section */}
        <section className="bg-background">
          <Container className="py-10 md:py-14">
            <SectionHeader title={tProd('popularProducts')} />
            <ProductGrid products={popularProducts} isLoading={loadingPopular} />
          </Container>
        </section>

        {/* Newest Products Section */}
        <section className="bg-background">
          <Container className="py-10 md:py-14">
            <SectionHeader title={tProd('newestProducts')} />
            <ProductGrid products={newestProducts} isLoading={loadingNewest} />
          </Container>
        </section>
      </main>

      <Footer />
    </div>
  );
}
