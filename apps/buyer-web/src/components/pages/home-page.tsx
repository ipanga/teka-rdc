'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ProductGrid } from '@/components/product/product-grid';
import { RecentlyViewed } from '@/components/product/recently-viewed';
import { BannerCarousel } from '@/components/home/banner-carousel';
import { FlashDealsSection } from '@/components/home/flash-deals-section';
import { Container, SectionHeader, buttonVariants } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';
import { useCityStore } from '@/lib/city-store';
import { CitySelectorModal } from '@/components/city/city-selector-modal';
import { CityPrompt } from '@/components/city/city-prompt';
import { categoryHref, cityHref } from '@/lib/urls';
import { cityAccentClasses } from '@/lib/city-accent';
import type { BrowseCategory, BrowseProduct } from '@/lib/types';

export default function HomePage({ serverH1 }: { serverH1?: string }) {
  const t = useTranslations('Hero');
  const tCat = useTranslations('Categories');
  const tProd = useTranslations('Products');
  const tCity = useTranslations('City');
  const [categories, setCategories] = useState<BrowseCategory[]>([]);
  const [popularProducts, setPopularProducts] = useState<BrowseProduct[]>([]);
  const [newestProducts, setNewestProducts] = useState<BrowseProduct[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingNewest, setLoadingNewest] = useState(true);

  // City store
  const { selectedCity, cities, initFromStorage, fetchCities } = useCityStore();
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

  // Town accent for the hero's location badge (copper = Lubumbashi, cobalt =
  // Kolwezi, brand red otherwise).
  const heroAccent = cityAccentClasses(selectedCity?.slug);

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
            <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary-50 via-background to-background">
              {/* soft brand glow, kept subtle so the hero reads light, not a wall of red */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
              />
              <Container className="relative py-10 md:py-16">
                <div className="max-w-2xl">
                  {selectedCity && (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-4 ${heroAccent.badge}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${heroAccent.dot}`} />
                      {t('deliveringTo', { city: selectedCity.name })}
                    </span>
                  )}
                  <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-3">
                    {serverH1 || t('title')}
                  </h1>
                  <p className="text-base md:text-lg text-muted-foreground mb-6 max-w-xl">
                    {t('subtitle', { city: selectedCity ? selectedCity.name : 'Congo' })}
                  </p>
                  <Link
                    href="/categories"
                    className={buttonVariants({ variant: 'default', size: 'lg' })}
                  >
                    {t('cta')}
                  </Link>
                </div>

                {/* Trust signals — fast local delivery, COD, verified sellers */}
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
                  {[
                    {
                      label: t('trustDelivery'),
                      icon: (
                        <path d="M3 7h11v8H3V7zm11 2h3l3 3v3h-2m-9 0H8m9 0a2 2 0 11-4 0 2 2 0 014 0zm-9 0a2 2 0 11-4 0 2 2 0 014 0z" />
                      ),
                    },
                    {
                      label: t('trustCod'),
                      icon: (
                        <>
                          <rect x="2.5" y="6" width="19" height="12" rx="2" />
                          <circle cx="12" cy="12" r="2.5" />
                        </>
                      ),
                    },
                    {
                      label: t('trustSellers'),
                      icon: <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zm-1 11l4-4-1.4-1.4L11 11.2 9.4 9.6 8 11l3 3z" />,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs"
                    >
                      <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-subtle text-primary shrink-0">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-5 h-5"
                          aria-hidden
                        >
                          {item.icon}
                        </svg>
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
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
                    href={categoryHref(selectedCity?.slug, cat)}
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

        {/* City links — crawlable Homepage → City-landing internal links.
            Always rendered (independent of the client-side selected city) so
            search engines can discover every /{ville} page. */}
        {cities.filter((c) => c.isActive && c.slug).length > 0 && (
          <section className="bg-surface-muted">
            <Container className="py-8">
              <h2 className="text-lg font-semibold text-foreground mb-3">
                {tCity('shopByCity')}
              </h2>
              <div className="flex flex-wrap gap-2">
                {cities
                  .filter((c) => c.isActive && c.slug)
                  .map((c) => (
                    <Link
                      key={c.id}
                      href={cityHref(c.slug as string)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <span aria-hidden>{'📍'}</span>
                      {c.name}
                    </Link>
                  ))}
              </div>
            </Container>
          </section>
        )}

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
