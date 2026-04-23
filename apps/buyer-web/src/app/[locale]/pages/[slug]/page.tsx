import type { Metadata } from 'next';
import ContentPageView from '@/components/pages/content-page-client';
import { serverFetch } from '@/lib/server-api';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await serverFetch<{ title: Record<string, string>; content: Record<string, string> }>(`/v1/content/${slug}`);

  const title = page?.title?.[locale] || page?.title?.fr || slug;
  const content = page?.content?.[locale] || page?.content?.fr || '';

  return {
    title,
    description: content.substring(0, 160),
    openGraph: { title: `${title} | Teka RDC`, description: content.substring(0, 160), siteName: 'Teka RDC', images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: `${title} | Teka RDC` }] },
    alternates: {
      canonical: `/pages/${slug}`,
      languages: { fr: `/fr/pages/${slug}`, en: `/en/pages/${slug}` },
    },
  };
}

export default function Page() {
  return <ContentPageView />;
}
