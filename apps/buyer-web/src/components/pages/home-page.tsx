'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ProductGrid } from '@/components/product/product-grid';
import { BannerCarousel } from '@/components/home/banner-carousel';
import { FlashDealsSection } from '@/components/home/flash-deals-section';
import { apiFetch } from '@/lib/api-client';
import { useCityStore } from '@/lib/city-store';
import { CitySelectorModal } from '@/components/city/city-selector-modal';
import { getLocalizedName } from '@/lib/format';
import type { BrowseCategory, BrowseProduct } from '@/lib/types';

export default function HomePage({ serverH1 }: { serverH1?: string }) {
  const t = useTranslations('Hero');
  const tCat = useTranslations('Categories');
  const tProd = useTranslations('Products');
  const locale = useLocale();

  const [categories, setCategories] = useState<BrowseCategory[]>([]);
  const [popularProducts, setPopularProducts] = useState<BrowseProduct[]>([]);
  const [newestProducts, setNewestProducts] = useState<BrowseProduct[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingNewest, setLoadingNewest] = useState(true);

  // City store
  const { selectedCity, initFromStorage, fetchCities, showSelector, openSelector } = useCityStore();
  const [cityInitialized, setCityInitialized] = useState(false);

  // Initialize city from localStorage on mount
  useEffect(() => {
    initFromStorage();
    fetchCities().then(() => {
      // If no city stored, show the selector modal
      const stored = typeof window !== 'undefined' ? localStorage.getItem('teka_city_id') : null;
      if (!stored) {
        openSelector();
      }
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
    apiFetch<{ data: BrowseProduct[] }>(`/v1/browse/products?sortBy=popularity&limit=8${cityParam}`)
      .then((res) => setPopularProducts(res.data.data))
      .catch(() => {})
      .finally(() => setLoadingPopular(false));

    // Fetch newest products (filtered by city)
    setLoadingNewest(true);
    apiFetch<{ data: BrowseProduct[] }>(`/v1/browse/products?sortBy=newest&limit=8${cityParam}`)
      .then((res) => setNewestProducts(res.data.data))
      .catch(() => {})
      .finally(() => setLoadingNewest(false));
  }, [selectedCity, cityInitialized]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <CitySelectorModal />

      <main className="flex-1">
        {/* Banner Carousel — replaces static hero when banners are available */}
        <BannerCarousel
          fallback={
            <section className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
              <div className="max-w-7xl mx-auto px-4 py-12 md:py-20 text-center">
                <h1 className="text-3xl md:text-5xl font-bold mb-3">
                  {serverH1 || t('title')}
                </h1>
                <p className="text-lg md:text-xl opacity-90 mb-6">
                  {t('subtitle', { city: selectedCity ? selectedCity.name : 'Congo' })}
                </p>
                <Link
                  href="/categories"
                  className="inline-block px-6 py-3 bg-white text-primary font-semibold rounded-lg hover:bg-white/90 transition-colors"
                >
                  {t('cta')}
                </Link>
              </div>
            </section>
          }
        />

        {/* Flash Deals Section — only renders when active deals exist */}
        <FlashDealsSection />

        {/* Categories Section */}
        <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-foreground">
              {tCat('title')}
            </h2>
            <Link
              href="/categories"
              className="text-sm text-primary hover:underline font-medium"
            >
              {tCat('viewAll')}
            </Link>
          </div>

          {loadingCategories ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-lg border border-border p-4 animate-pulse">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {categories.slice(0, 12).map((cat) => (
                <Link
                  key={cat.id}
                  href={cat.slug ? `/categorie/${cat.slug}` : `/categories/${cat.id}`}
                  className="group bg-white rounded-lg border border-border p-4 text-center hover:shadow-md hover:border-primary/30 transition-all"
                >
                  <div className="text-3xl mb-2">{cat.emoji || '📦'}</div>
                  <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                    {getLocalizedName(cat.name, locale)}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {tCat('productCount', { count: cat.productCount })}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Popular Products Section */}
        <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-6">
            {tProd('popularProducts')}
          </h2>
          <ProductGrid products={popularProducts} isLoading={loadingPopular} />
        </section>

        {/* Newest Products Section */}
        <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-6">
            {tProd('newestProducts')}
          </h2>
          <ProductGrid products={newestProducts} isLoading={loadingNewest} />
        </section>
      </main>

      <Footer />
    </div>
  );
}
