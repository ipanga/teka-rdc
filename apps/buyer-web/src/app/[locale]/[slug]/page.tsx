import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContentPageView } from '@/components/pages/content-page-view';
import { serverFetch } from '@/lib/server-api';
import {
  allStaticPageParams,
  canonicalToUrlSlug,
  pathForCanonical,
  urlSlugToCanonical,
  type CanonicalSlug,
  type Locale,
} from '@/lib/static-pages';

type Props = { params: Promise<{ locale: string; slug: string }> };

interface ApiContentPage {
  slug: string;
  title: Record<string, string>;
  content: Record<string, string>;
  status: string;
}

function pickLocalized(field: Record<string, string> | undefined, locale: string) {
  if (!field) return '';
  return field[locale] || field.fr || Object.values(field)[0] || '';
}

/**
 * Resolve URL slug to a canonical (DB) slug, or null if the URL doesn't map
 * to a known static page. We reject unknown slugs *before* any DB roundtrip
 * so this dynamic route doesn't catch and 500 on garbage URLs.
 */
function resolveCanonical(locale: string, slug: string): CanonicalSlug | null {
  if (locale !== 'fr' && locale !== 'en') return null;
  return urlSlugToCanonical(slug, locale);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const canonical = resolveCanonical(locale, slug);
  if (!canonical) return { title: 'Teka RDC' };

  const page = await serverFetch<ApiContentPage>(`/v1/content/${canonical}`);
  if (!page) return { title: slug };

  const title = pickLocalized(page.title, locale);
  const body = pickLocalized(page.content, locale);

  // Description: first 160 chars of plain text (markdown stripped).
  const description = body
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 160);

  const canonicalPath = pathForCanonical(canonical, locale as Locale);
  const frPath = pathForCanonical(canonical, 'fr');
  const enPath = pathForCanonical(canonical, 'en');

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Teka RDC`,
      description,
      siteName: 'Teka RDC',
      locale: locale === 'fr' ? 'fr_CD' : 'en_US',
      url: `https://teka.cd${canonicalPath}`,
      images: [
        {
          url: 'https://teka.cd/og-default.png',
          width: 1200,
          height: 630,
          alt: `${title} | Teka RDC`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Teka RDC`,
      description,
    },
    alternates: {
      canonical: canonicalPath,
      languages: {
        fr: frPath,
        en: enPath,
        'x-default': frPath,
      },
    },
  };
}

export function generateStaticParams() {
  return allStaticPageParams();
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  const canonical = resolveCanonical(locale, slug);
  if (!canonical) notFound();

  const page = await serverFetch<ApiContentPage>(`/v1/content/${canonical}`);
  if (!page || page.status !== 'PUBLISHED') notFound();

  const title = pickLocalized(page.title, locale);
  const body = pickLocalized(page.content, locale);
  // Pass canonical to the view so links + JSON-LD can resolve cross-locale
  // alternates. The URL slug is the visible one in the address bar.
  const urlSlug = canonicalToUrlSlug(canonical, locale as Locale);

  return (
    <ContentPageView
      slug={urlSlug}
      canonical={canonical}
      locale={locale}
      title={title}
      body={body}
    />
  );
}
