'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { apiFetch } from '@/lib/api-client';
import { getLocalizedName } from '@/lib/format';
import type { BrowseCategory } from '@/lib/types';

export default function CategoriesPage() {
  const t = useTranslations('Categories');
  const locale = useLocale();

  const [categories, setCategories] = useState<BrowseCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiFetch<BrowseCategory[]>('/v1/browse/categories')
      .then((res) => setCategories(res.data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
          {t('allCategories')}
        </h1>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-border p-6 animate-pulse">
                <div className="w-14 h-14 bg-muted rounded-full mx-auto mb-4" />
                <div className="h-4 bg-muted rounded w-3/4 mx-auto mb-2" />
                <div className="h-3 bg-muted rounded w-1/2 mx-auto" />
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
            <p className="text-muted-foreground">{t('noCategories')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/categories/${cat.id}`}
                className="group bg-white rounded-lg border border-border p-6 text-center hover:shadow-lg hover:border-primary/30 transition-all"
              >
                <div className="text-4xl mb-3">{cat.emoji || '📦'}</div>
                <h2 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {getLocalizedName(cat.name, locale)}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('productCount', { count: cat.productCount })}
                </p>

                {cat.subcategories && cat.subcategories.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    {cat.subcategories.slice(0, 3).map((sub) => (
                      <p key={sub.id} className="text-xs text-muted-foreground truncate">
                        {getLocalizedName(sub.name, locale)}
                      </p>
                    ))}
                    {cat.subcategories.length > 3 && (
                      <p className="text-xs text-primary mt-1">
                        +{cat.subcategories.length - 3}
                      </p>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
