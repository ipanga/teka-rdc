'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ProductGrid } from '@/components/product/product-grid';
import { BannerCarousel } from '@/components/home/banner-carousel';
import { FlashDealsSection } from '@/components/home/flash-deals-section';
import { Container, SectionHeader, buttonVariants } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';
import { useCityStore } from '@/lib/city-store';
import { CitySelectorModal } from '@/components/city/city-selector-modal';
import { CityPrompt } from '@/components/city/city-prompt';
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
  const { selectedCity, initFromStorage, fetchCities } = useCityStore();
  const [cityInitialized, setCityInitialized] = useState(false);

  // Initialize city from localStorage + load the city list on mount.
  // We deliberately DO NOT force the city-selector modal open anymore: the
  // homepage must render full, crawlable content with no interaction gate
  // (SEO). A visitor without a stored city sees all-cities listings plus the
  // non-blocking <CityPrompt> banner, and can pick a city at any time via the
  // header "Changer de ville" button or that banner.
  useEffect(() => {
    initFromStorage();
    fetchCities().finally(() => {
      setCityInitialized(true);
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
      {/* Opt-in only — opened via the header "Changer de ville" button, never
          auto-forced on load. */}
      <CitySelectorModal />

      <main className="flex-1">
        {/* Non-blocking city chooser (replaces the old forced modal). */}
        <CityPrompt />
        {/* Banner Carousel — replaces static hero when banners are available */}
        <BannerCarousel
          fallback={
            <section className="bg-gradient-to-br from-primary-700 via-primary to-primary-500 text-primary-foreground">
              <Container className="py-12 md:py-20 text-center">
                <h1 className="text-3xl md:text-5xl font-bold mb-3 tracking-tight">
                  {serverH1 || t('title')}
                </h1>
                <p className="text-lg md:text-xl opacity-90 mb-6 max-w-2xl mx-auto">
                  {t('subtitle', { city: selectedCity ? selectedCity.name : 'Congo' })}
                </p>
                <Link
                  href="/categories"
                  className={buttonVariants({ variant: 'secondary', size: 'lg' })}
                >
                  {t('cta')}
                </Link>
              </Container>
            </section>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-surface rounded-xl border border-border p-4 animate-pulse">
                    <div className="w-12 h-12 bg-muted rounded-full mx-auto mb-3" />
                    <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
                  </div>
                ))}
              </div>
            ) : categories.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {tCat('noCategories')}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
                {categories.slice(0, 12).map((cat) => (
                  <Link
                    key={cat.id}
                    href={cat.slug ? `/categorie/${cat.slug}` : `/categories/${cat.id}`}
                    className="group bg-surface rounded-xl border border-border p-4 text-center shadow-xs hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
                      {cat.emoji || '📦'}
                    </div>
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {cat.name ?? ''}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tCat('productCount', { count: cat.productCount })}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Container>
        </section>

        {/* Popular Products Section */}
        <section className="bg-surface-muted">
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
