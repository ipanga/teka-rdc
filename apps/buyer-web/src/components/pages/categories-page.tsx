'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { apiFetch } from '@/lib/api-client';
import { useCityStore } from '@/lib/city-store';
import { categoryHref } from '@/lib/urls';
import { CategoryIcon } from '@/components/category/category-icon';
import { Container } from '@/components/ui';
import type { BrowseCategory } from '@/lib/types';

export default function CategoriesPage() {
  const selectedCity = useCityStore((s) => s.selectedCity);
  const [categories, setCategories] = useState<BrowseCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiFetch<BrowseCategory[]>('/v1/browse/categories')
      .then((res) => setCategories(res.data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1">
        <Container className="py-8 md:py-10">
          <div className="mb-6 rounded-2xl border border-border bg-surface px-5 py-6 md:px-7">
            <p className="text-xs font-bold uppercase text-primary">
              {"Catalogue Teka RDC"}
            </p>
            <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                  {"Toutes les catégories"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm md:text-base text-muted-foreground">
                  {"Trouvez rapidement une catégorie, une sous-catégorie ou un type de produit disponible à Lubumbashi et Kolwezi."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                <span className="rounded-full bg-success-subtle px-3 py-1 text-success">
                  {"Paiement à la livraison"}
                </span>
                <span className="rounded-full bg-primary-subtle px-3 py-1 text-primary">
                  {"Liens SEO directs"}
                </span>
              </div>
            </div>
          </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-border p-5 animate-pulse">
                <div className="w-14 h-14 bg-muted rounded-full mx-auto mb-4" />
                <div className="h-4 bg-muted rounded w-3/4 mb-3" />
                <div className="h-3 bg-muted rounded w-full mb-2" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="py-16 text-center">
            <svg
              className="mx-auto w-16 h-16 text-muted-foreground mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="text-muted-foreground">{"Aucune catégorie disponible pour le moment."}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="group flex flex-col rounded-xl border border-border bg-surface p-5 shadow-xs transition-all hover:border-primary/30 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <Link
                    href={categoryHref(selectedCity?.slug, cat)}
                    className="shrink-0"
                    aria-label={cat.name}
                  >
                    <CategoryIcon slug={cat.slug} emoji={cat.emoji} size="lg" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={categoryHref(selectedCity?.slug, cat)}
                      className="text-base font-bold text-foreground transition-colors group-hover:text-primary"
                    >
                      {(cat.name ?? '')}
                    </Link>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {`${cat.productCount} ${cat.productCount <= 1 ? 'produit' : 'produits'}`}
                    </p>
                  </div>
                </div>

                {cat.subcategories && cat.subcategories.length > 0 && (
                  <div className="mt-4 grid gap-2 border-t border-border pt-4">
                    {cat.subcategories.slice(0, 5).map((sub) => (
                      <div key={sub.id} className="min-w-0">
                        <Link
                          href={categoryHref(selectedCity?.slug, sub)}
                          className="block truncate text-sm font-semibold text-foreground hover:text-primary"
                        >
                          {(sub.name ?? '')}
                        </Link>
                        {sub.subcategories.length > 0 && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {sub.subcategories.slice(0, 3).map((type) => type.name).join(' · ')}
                          </p>
                        )}
                      </div>
                    ))}
                    {cat.subcategories.length > 5 && (
                      <Link
                        href={categoryHref(selectedCity?.slug, cat)}
                        className="text-xs font-semibold text-primary"
                      >
                        {`+${cat.subcategories.length - 5} autres sous-catégories`}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </Container>
      </main>

      <Footer />
    </div>
  );
}
