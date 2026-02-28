import type { Metadata } from 'next';
import ProductDetailPage from '@/components/pages/product-detail-page';
import { JsonLd } from '@/components/seo/json-ld';
import { serverFetch } from '@/lib/server-api';

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const product = await serverFetch<{
    title: Record<string, string>;
    description: Record<string, string>;
    images: Array<{ url: string }>;
    priceCDF: string;
  }>(`/v1/browse/products/${id}`);

  if (!product) {
    return { title: locale === 'fr' ? 'Produit non trouvé' : 'Product not found' };
  }

  const title = product.title?.[locale] || product.title?.fr || '';
  const desc = product.description?.[locale] || product.description?.fr || '';
  const image = product.images?.[0]?.url;

  return {
    title,
    description: desc.substring(0, 160),
    openGraph: {
      title: `${title} | Teka RDC`,
      description: desc.substring(0, 160),
      ...(image && { images: [{ url: image, width: 800, height: 800, alt: title }] }),
      type: 'website',
      siteName: 'Teka RDC',
    },
    twitter: { card: 'summary_large_image', title, description: desc.substring(0, 160) },
    alternates: {
      canonical: `/products/${id}`,
      languages: { fr: `/fr/products/${id}`, en: `/en/products/${id}` },
    },
  };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const product = await serverFetch<{
    title: Record<string, string>;
    description: Record<string, string>;
    priceCDF: string;
    avgRating: number;
    totalReviews: number;
    images: Array<{ url: string }>;
    seller: { shopName: string };
  }>(`/v1/browse/products/${id}`);

  return (
    <>
      {product && (
        <JsonLd data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.title?.fr || '',
          description: product.description?.fr || '',
          image: product.images?.[0]?.url,
          offers: {
            '@type': 'Offer',
            priceCurrency: 'CDF',
            price: product.priceCDF,
            availability: 'https://schema.org/InStock',
          },
          ...(product.totalReviews > 0 && {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: product.avgRating,
              reviewCount: product.totalReviews,
            },
          }),
          brand: { '@type': 'Organization', name: product.seller?.shopName || 'Teka RDC' },
        }} />
      )}
      <ProductDetailPage />
    </>
  );
}
