'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ProductGrid } from '@/components/product/product-grid';
import { StoreHero } from '@/components/home/store-hero';
import { Container, SectionHeader } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';
import { useCityStore } from '@/lib/city-store';
import { categoryHref } from '@/lib/urls';
import { CategoryIcon } from '@/components/category/category-icon';
import type { BrowseCategory, BrowseProduct } from '@/lib/types';

interface CityLandingPageProps {
  cityId: string;
  citySlug: string;
  cityName: string;
  province: string;
  // Data-driven town identity (Town Architecture Refactor) so the adopted town
  // carries its accent/hero — keeps the header town badge correct on /{ville}.
  accentColor?: string | null;
  heroImageUrl?: string | null;
}

/**
 * Public, crawlable landing page for a city (`/{ville}`). Mirrors the homepage
 * sections but scoped to one city, and adopts that city as the active
 * selection (the URL is the source of truth). No interaction gate.
 */
export default function CityLandingPage({
  cityId,
  citySlug,
  cityName,
  province,
  accentColor = null,
  heroImageUrl = null,
}: CityLandingPageProps) {
  const tCat = useTranslations('Categories');
  const tProd = useTranslations('Products');
  const tHero = useTranslations('Hero');
  const setCity = useCityStore((s) => s.setCity);

  const [categories, setCategories] = useState<BrowseCategory[]>([]);
  const [popular, setPopular] = useState<BrowseProduct[]>([]);
  const [newest, setNewest] = useState<BrowseProduct[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingNewest, setLoadingNewest] = useState(true);

  // Landing on /{ville} sets the active city so the rest of the app (header,
  // category filters, cart) stays consistent with the URL.
  useEffect(() => {
    setCity({
      id: cityId,
      name: cityName,
      slug: citySlug,
      province,
      isActive: true,
      sortOrder: 0,
      accentColor,
      heroImageUrl,
    });
  }, [cityId, cityName, citySlug, province, accentColor, heroImageUrl, setCity]);

  useEffect(() => {
    setLoadingCats(true);
    apiFetch<BrowseCategory[]>('/v1/browse/categories')
      .then((res) => setCategories(res.data))
      .catch(() => {})
      .finally(() => setLoadingCats(false));

    setLoadingPopular(true);
    apiFetch<{ data: BrowseProduct[] }>(
      `/v1/browse/products?sortBy=popularity&limit=10&cityId=${cityId}`,
    )
      .then((res) => setPopular(res.data.data))
      .catch(() => {})
      .finally(() => setLoadingPopular(false));

    setLoadingNewest(true);
    apiFetch<{ data: BrowseProduct[] }>(
      `/v1/browse/products?sortBy=newest&limit=10&cityId=${cityId}`,
    )
      .then((res) => setNewest(res.data.data))
      .catch(() => {})
      .finally(() => setLoadingNewest(false));
  }, [cityId]);

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1">
        {/* Same premium hero as the homepage (shared StoreHero), city-branded:
            city image + accent + city-templated copy. Rendered DIRECTLY (not via
            BannerCarousel) so the city <h1> stays in the SSR HTML and indexable
            — the homepage wraps it in BannerCarousel, whose loading skeleton
            would push the H1 to client-only render. */}
        <StoreHero
          title={tProd('cityLandingTitle', { city: cityName })}
          subtitle={tProd('cityLandingSubtitle', { city: cityName })}
          ctaHref="/categories"
          ctaLabel={tHero('cta')}
          city={{ name: cityName, slug: citySlug, accentColor, heroImageUrl }}
          badgeLabel={tHero('deliveringTo', { city: cityName })}
        />

        {/* Categories — city-scoped links */}
        <section className="bg-background">
          <Container className="py-10 md:py-14">
            <SectionHeader title={tCat('title')} />
            {loadingCats ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-surface rounded-xl border border-border p-4 animate-pulse">
                    <div className="w-12 h-12 bg-muted rounded-full mx-auto mb-3" />
                    <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-4 md:gap-5">
                {categories.slice(0, 14).map((cat) => (
                  <Link
                    key={cat.id}
                    href={categoryHref(citySlug, cat)}
                    className="group flex flex-col items-center text-center gap-2.5 rounded-xl p-2 hover:bg-surface-muted/60 transition-colors"
                  >
                    <CategoryIcon slug={cat.slug} emoji={cat.emoji} size="lg" />
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {cat.name ?? ''}
                    </h3>
                  </Link>
                ))}
              </div>
            )}
          </Container>
        </section>

        <section className="bg-surface-muted">
          <Container className="py-10 md:py-14">
            <SectionHeader title={tProd('popularProducts')} />
            <ProductGrid products={popular} isLoading={loadingPopular} />
          </Container>
        </section>

        <section className="bg-background">
          <Container className="py-10 md:py-14">
            <SectionHeader title={tProd('newestProducts')} />
            <ProductGrid products={newest} isLoading={loadingNewest} />
          </Container>
        </section>
      </main>

      <Footer />
    </div>
  );
}
