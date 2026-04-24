import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContentPageView } from '@/components/pages/content-page-view';
import { serverFetch } from '@/lib/server-api';

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await serverFetch<ApiContentPage>(`/v1/content/${slug}`);
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

  const canonicalPath = locale === 'fr' ? `/pages/${slug}` : `/${locale}/pages/${slug}`;

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
        fr: `/pages/${slug}`,
        en: `/en/pages/${slug}`,
        'x-default': `/pages/${slug}`,
      },
    },
  };
}

// Pre-render the known slugs at build time so every footer link is an
// already-generated static HTML shell. The server-fetch inside each page
// still runs on the Next.js server (revalidated every 60s) so admin-panel
// edits propagate without needing a redeploy.
export function generateStaticParams() {
  const slugs = [
    'about',
    'help',
    'faq',
    'terms',
    'privacy',
    'how-to-buy',
    'how-to-sell',
    'contact',
  ];
  const locales = ['fr', 'en'];
  return locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  const page = await serverFetch<ApiContentPage>(`/v1/content/${slug}`);

  if (!page || page.status !== 'PUBLISHED') {
    notFound();
  }

  const title = pickLocalized(page.title, locale);
  const body = pickLocalized(page.content, locale);

  return (
    <ContentPageView slug={slug} locale={locale} title={title} body={body} />
  );
}
