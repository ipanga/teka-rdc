'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Image from 'next/image';
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
import { categoryHref } from '@/lib/urls';
import { cityAccentClasses, heroImageForCity } from '@/lib/city-accent';
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

  // Town accent + hero image for the selected town — driven by the city record
  // (data-driven; copper / cobalt / brand-red default + per-town hero).
  const heroAccent = cityAccentClasses(selectedCity);
  const heroImage = heroImageForCity(selectedCity);

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
        {/* Banner Carousel — replaces static hero when banners are available */}
        <BannerCarousel
          fallback={
            <section className="relative overflow-hidden border-b border-border">
              {/* City-specific hero image (copper Lubumbashi / cobalt Kolwezi
                  shots; Lubumbashi as the default). LCP element → priority. */}
              <div className="relative h-[320px] sm:h-[380px] md:h-[460px]">
                <Image
                  src={heroImage}
                  alt=""
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                />
                {/* Legibility scrim — darkest on the left where the copy sits. */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/15" />
                <Container className="relative h-full flex flex-col justify-center">
                  <div className="max-w-xl text-white">
                    {selectedCity && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-4 ${heroAccent.badge}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${heroAccent.dot}`} />
                        {t('deliveringTo', { city: selectedCity.name })}
                      </span>
                    )}
                    <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3 drop-shadow-sm">
                      {serverH1 || t('title')}
                    </h1>
                    <p className="text-base md:text-lg text-white/90 mb-6 max-w-md">
                      {t('subtitle', { city: selectedCity ? selectedCity.name : 'Congo' })}
                    </p>
                    <Link
                      href="/categories"
                      className={buttonVariants({ variant: 'default', size: 'lg' })}
                    >
                      {t('cta')}
                    </Link>
                  </div>
                </Container>
              </div>

              {/* Trust signals — light band below the image (fast local
                  delivery, COD, verified sellers) */}
              <Container className="py-3 md:py-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
                {categories.slice(0, 12).map((cat) => (
                  <Link
                    key={cat.id}
                    href={categoryHref(selectedCity?.slug, cat)}
                    className="group flex flex-col items-center text-center gap-3 rounded-2xl border border-border bg-surface p-5 shadow-xs hover:shadow-md hover:border-primary/40 hover:-translate-y-1 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="flex items-center justify-center w-16 h-16 rounded-full bg-primary-subtle text-3xl transition-all duration-200 group-hover:scale-110 group-hover:bg-primary/10">
                      {cat.emoji || '📦'}
                    </span>
                    <span className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                        {cat.name ?? ''}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tCat('productCount', { count: cat.productCount })}
                      </p>
                    </span>
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
