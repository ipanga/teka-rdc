import type { Metadata } from 'next';
import ProductDetailPage from '@/components/pages/product-detail-page';
import { JsonLd } from '@/components/seo/json-ld';
import { serverFetch } from '@/lib/server-api';

type Props = { params: Promise<{ locale: string; slug: string }> };

interface ProductData {
  title: Record<string, string>;
  description: Record<string, string>;
  priceCDF: string;
  priceUSD?: string | null;
  avgRating: number;
  totalReviews: number;
  quantity: number;
  condition: string;
  images: Array<{ url: string }>;
  seller: { businessName?: string; shopName?: string };
  category?: { name: Record<string, string> };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await serverFetch<ProductData>(`/v1/browse/products/${slug}`);

  if (!product) {
    return { title: locale === 'fr' ? 'Produit non trouvé' : 'Product not found' };
  }

  const title = product.title?.[locale] || product.title?.fr || '';
  const desc = product.description?.[locale] || product.description?.fr || '';
  const image = product.images?.[0]?.url;
  const price = (Number(product.priceCDF) / 100).toLocaleString('fr-CD');
  const categoryName = product.category?.name?.[locale] || product.category?.name?.fr || '';
  const sellerName = product.seller?.businessName || product.seller?.shopName || '';

  const fullTitle = `${title} - ${price} FC`;
  const fullDesc = locale === 'fr'
    ? `${desc.substring(0, 120)}${desc.length > 120 ? '...' : ''} | ${categoryName} | Vendu par ${sellerName} sur Teka RDC. Livraison à Lubumbashi & Kolwezi.`
    : `${desc.substring(0, 120)}${desc.length > 120 ? '...' : ''} | ${categoryName} | Sold by ${sellerName} on Teka RDC. Delivery to Lubumbashi & Kolwezi.`;

  return {
    title: fullTitle,
    description: fullDesc.substring(0, 160),
    keywords: [title, categoryName, sellerName, 'Teka RDC', locale === 'fr' ? 'acheter en ligne RDC' : 'buy online DRC'],
    openGraph: {
      title: `${title} | Teka RDC`,
      description: fullDesc.substring(0, 160),
      images: image
        ? [{ url: image, width: 800, height: 800, alt: title }]
        : [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: title }],
      type: 'website',
      siteName: 'Teka RDC',
      locale: locale === 'fr' ? 'fr_CD' : 'en_CD',
    },
    twitter: { card: 'summary_large_image', title: `${title} | Teka RDC`, description: fullDesc.substring(0, 160) },
    alternates: {
      canonical: `/products/${slug}`,
      languages: { fr: `/fr/products/${slug}`, en: `/en/products/${slug}` },
    },
  };
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  const product = await serverFetch<ProductData>(`/v1/browse/products/${slug}`);

  const productJsonLd = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title?.fr || '',
    description: product.description?.fr || '',
    image: product.images?.[0]?.url,
    sku: slug,
    brand: { '@type': 'Organization', name: product.seller?.businessName || product.seller?.shopName || 'Teka RDC' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'CDF',
      price: String(Number(product.priceCDF) / 100),
      availability: product.quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: product.condition === 'NEW' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
      seller: { '@type': 'Organization', name: product.seller?.businessName || product.seller?.shopName || '' },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'CD' },
      },
    },
    ...(product.totalReviews > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.avgRating,
        reviewCount: product.totalReviews,
        bestRating: 5,
        worstRating: 1,
      },
    }),
  } : null;

  const categoryName = product?.category?.name?.[locale] || product?.category?.name?.fr || '';
  const productName = product?.title?.[locale] || product?.title?.fr || '';
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: locale === 'fr' ? 'Accueil' : 'Home', item: 'https://teka.cd' },
      ...(categoryName ? [{ '@type': 'ListItem', position: 2, name: categoryName, item: `https://teka.cd/${locale}/categories` }] : []),
      { '@type': 'ListItem', position: categoryName ? 3 : 2, name: productName },
    ],
  };

  return (
    <>
      {productJsonLd && <JsonLd data={productJsonLd} />}
      <JsonLd data={breadcrumbJsonLd} />
      <ProductDetailPage />
    </>
  );
}
