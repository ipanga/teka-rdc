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
  // The browse API actually returns the business name under
  // `seller.sellerProfile.businessName`. Older code paths read flat
  // shopName/businessName fields on `seller` directly — those don't exist
  // here but we keep them as fallbacks for forward-compatibility.
  seller: {
    businessName?: string;
    shopName?: string;
    sellerProfile?: { businessName?: string };
  };
  category?: { name: Record<string, string> };
}

/**
 * Convert a Cloudinary product image URL into an OG-friendly 1200x630 card.
 * Pads with white so the product is centered + fully visible (no head-crop).
 * For non-Cloudinary URLs, returns the input unchanged — the social crawler
 * will scale it itself.
 */
function ogImageUrl(url: string | undefined): string {
  if (!url) return 'https://teka.cd/og-default.png';
  if (url.includes('res.cloudinary.com')) {
    return url.replace('/upload/', '/upload/c_pad,w_1200,h_630,b_white/');
  }
  return url;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await serverFetch<ProductData>(`/v1/browse/products/${slug}`);

  if (!product) {
    return { title: locale === 'fr' ? 'Produit non trouvé' : 'Product not found' };
  }

  const title = product.title?.[locale] || product.title?.fr || '';
  const desc = product.description?.[locale] || product.description?.fr || '';
  const ogImage = ogImageUrl(product.images?.[0]?.url);
  const price = (Number(product.priceCDF) / 100).toLocaleString('fr-CD');
  const categoryName = product.category?.name?.[locale] || product.category?.name?.fr || '';
  const sellerName =
    product.seller?.sellerProfile?.businessName ||
    product.seller?.businessName ||
    product.seller?.shopName ||
    '';

  const fullTitle = `${title} - ${price} FC`;
  const fullDesc = locale === 'fr'
    ? `${desc.substring(0, 120)}${desc.length > 120 ? '...' : ''} | ${categoryName} | Vendu par ${sellerName} sur Teka RDC. Livraison à Lubumbashi & Kolwezi.`
    : `${desc.substring(0, 120)}${desc.length > 120 ? '...' : ''} | ${categoryName} | Sold by ${sellerName} on Teka RDC. Delivery to Lubumbashi & Kolwezi.`;
  const truncatedDesc = fullDesc.substring(0, 160);

  // Locale-aware paths (next-intl `localePrefix: 'as-needed'` — FR has no prefix).
  const localizedPath = `/products/${slug}`;
  const canonical = locale === 'fr' ? localizedPath : `/${locale}${localizedPath}`;
  const absoluteUrl = `https://teka.cd${canonical}`;

  return {
    title: fullTitle,
    description: truncatedDesc,
    keywords: [
      title,
      categoryName,
      sellerName,
      'Teka RDC',
      locale === 'fr' ? 'acheter en ligne RDC' : 'buy online DRC',
    ],
    openGraph: {
      title: `${title} | Teka RDC`,
      description: truncatedDesc,
      url: absoluteUrl,
      // Stays 'website' — Next.js 15 validates openGraph.type at runtime
      // against its typed union and throws on unknown values like 'product'.
      // Rich previews work the same on FB/WhatsApp/LinkedIn — they read
      // og:title/og:description/og:image regardless of og:type.
      type: 'website',
      siteName: 'Teka RDC',
      locale: locale === 'fr' ? 'fr_CD' : 'en_CD',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Teka RDC`,
      description: truncatedDesc,
      // Without an image URL Twitter falls back to the small summary card
      // even when summary_large_image is requested.
      images: [ogImage],
    },
    alternates: {
      canonical,
      languages: {
        fr: localizedPath,
        en: `/en${localizedPath}`,
        'x-default': localizedPath,
      },
    },
  };
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  const product = await serverFetch<ProductData>(`/v1/browse/products/${slug}`);

  const sellerDisplayName =
    product?.seller?.sellerProfile?.businessName ||
    product?.seller?.businessName ||
    product?.seller?.shopName ||
    '';

  const productJsonLd = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title?.fr || '',
    description: product.description?.fr || '',
    image: product.images?.[0]?.url,
    sku: slug,
    brand: { '@type': 'Organization', name: sellerDisplayName || 'Teka RDC' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'CDF',
      price: String(Number(product.priceCDF) / 100),
      availability: product.quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: product.condition === 'NEW' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
      seller: { '@type': 'Organization', name: sellerDisplayName },
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
