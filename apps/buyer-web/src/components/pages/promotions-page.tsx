'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ProductGrid } from '@/components/product/product-grid';
import { Container, SectionHeader } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';
import { useCityStore } from '@/lib/city-store';
import type { BrowseProduct } from '@/lib/types';

/**
 * Dedicated discount-discovery page: all products with an active seller-set
 * promotion, town-scoped via the city store (mirrors category/search). The
 * thin server wrapper (app/promotions/page.tsx) supplies SEO metadata.
 */
export default function PromotionsPage() {
  const [products, setProducts] = useState<BrowseProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { selectedCity, initFromStorage, fetchCities } = useCityStore();
  const [cityInitialized, setCityInitialized] = useState(false);

  useEffect(() => {
    initFromStorage();
    fetchCities().finally(() => setCityInitialized(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cityInitialized) return;
    const cityParam = selectedCity ? `&cityId=${selectedCity.id}` : '';
    setIsLoading(true);
    apiFetch<{ data: BrowseProduct[] }>(
      `/v1/browse/products?onPromotion=true&limit=48${cityParam}`,
    )
      .then((res) => setProducts(res.data.data))
      .catch(() => setProducts([]))
      .finally(() => setIsLoading(false));
  }, [selectedCity, cityInitialized]);

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />
      <main className="flex-1">
        <section className="bg-background">
          <Container className="py-8 md:py-12">
            <SectionHeader
              title={"Promotions"}
              subtitle={
                selectedCity
                  ? `Les meilleures offres à ${selectedCity.name}`
                  : "Les meilleures offres du moment"
              }
            />
            {!isLoading && products.length === 0 ? (
              <p className="text-muted-foreground text-center py-16">
                {"Aucune promotion en cours pour le moment. Revenez bientôt !"}
              </p>
            ) : (
              <ProductGrid products={products} isLoading={isLoading} />
            )}
          </Container>
        </section>
      </main>
      <Footer />
    </div>
  );
}
