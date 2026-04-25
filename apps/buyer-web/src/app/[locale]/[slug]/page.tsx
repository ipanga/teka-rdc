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
} from '@/lib/static-pages';

type Props = { params: Promise<{ locale: string; slug: string }> };

interface ApiContentPage {
  slug: string;
  title: Record<string, string>;
  content: Record<string, string>;
  status: string;
}

/**
 * Pick the FR-language value from the API's translatable JSON shape. The
 * shape is preserved as `{ fr, en }` per the API-contract constraint, but
 * the UI is monolingual (FR only) since 2026-04-25.
 */
function pickFr(field: Record<string, string> | undefined) {
  if (!field) return '';
  return field.fr || Object.values(field)[0] || '';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const canonical = urlSlugToCanonical(slug);
  if (!canonical) return { title: 'Teka RDC' };

  const page = await serverFetch<ApiContentPage>(`/v1/content/${canonical}`);
  if (!page) return { title: slug };

  const title = pickFr(page.title);
  const body = pickFr(page.content);

  // Description: first 160 chars of plain text (markdown stripped).
  const description = body
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 160);

  const canonicalPath = pathForCanonical(canonical);

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Teka RDC`,
      description,
      siteName: 'Teka RDC',
      locale: 'fr_CD',
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
    },
  };
}

export function generateStaticParams() {
  return allStaticPageParams();
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const canonical = urlSlugToCanonical(slug);
  if (!canonical) notFound();

  const page = await serverFetch<ApiContentPage>(`/v1/content/${canonical}`);
  if (!page || page.status !== 'PUBLISHED') notFound();

  const title = pickFr(page.title);
  const body = pickFr(page.content);
  const urlSlug = canonicalToUrlSlug(canonical);

  return (
    <ContentPageView
      slug={urlSlug}
      canonical={canonical}
      title={title}
      body={body}
    />
  );
}
