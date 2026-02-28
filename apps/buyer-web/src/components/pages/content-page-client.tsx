'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { apiFetch } from '@/lib/api-client';
import { getLocalizedName } from '@/lib/format';
import type { ContentPage } from '@/lib/types';

export default function ContentPageView() {
  const t = useTranslations('ContentPages');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [page, setPage] = useState<ContentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    apiFetch<ContentPage>(`/v1/content/${slug}`)
      .then((res) => {
        setPage(res.data);
      })
      .catch((err) => {
        if (err?.status === 404) {
          setNotFound(true);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const title = page ? getLocalizedName(page.title, locale) : '';
  const content = page ? getLocalizedName(page.content, locale) : '';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 md:py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/" className="hover:text-primary transition-colors">
            {tCommon('home')}
          </Link>
          <span>/</span>
          {loading ? (
            <span className="h-4 w-24 bg-muted rounded animate-pulse inline-block" />
          ) : notFound ? (
            <span>{t('pageNotFound')}</span>
          ) : (
            <span className="text-foreground">{title}</span>
          )}
        </nav>

        {/* Loading state */}
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-8 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-5/6" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-4/5" />
          </div>
        )}

        {/* Not found state */}
        {!loading && notFound && (
          <div className="text-center py-16">
            <div className="text-6xl text-muted-foreground mb-4">404</div>
            <h1 className="text-xl font-bold text-foreground mb-2">
              {t('pageNotFound')}
            </h1>
            <Link
              href="/"
              className="inline-block mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              {t('backToHome')}
            </Link>
          </div>
        )}

        {/* Content */}
        {!loading && page && (
          <article>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
              {title}
            </h1>
            <div
              className="prose prose-sm md:prose-base max-w-none text-foreground"
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {content}
            </div>
          </article>
        )}
      </main>

      <Footer />
    </div>
  );
}
