import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import ProductDetailPage from '@/components/pages/product-detail-page';
import { JsonLd } from '@/components/seo/json-ld';
import { serverFetch } from '@/lib/server-api';
import {
  productHref,
  productTail,
  productIdentifierFromParam,
  categoryHref,
} from '@/lib/urls';

type Props = { params: Promise<{ ville: string; product: string }> };

interface ProductData {
  id: string;
  slug?: string | null;
  shortCode?: string | null;
  title: string;
  description: string;
  priceCDF: string;
  priceUSD?: string | null;
  discountPriceCDF?: string | null;
  discountPriceUSD?: string | null;
  avgRating: number;
  totalReviews: number;
  quantity: number;
  condition: string;
  updatedAt?: string;
  images: Array<{ url: string }>;
  city?: { id: string; slug: string | null; name: string; province: string } | null;
  seller: {
    businessName?: string;
    shopName?: string;
    sellerProfile?: { businessName?: string };
  };
  category?: { id: string; slug?: string | null; name: string };
  brand?: { id: string; name: string; slug?: string | null } | null;
  // Demo retirement (P3c): true for a demo product in a retired category.
  isRetired?: boolean;
}

function pickStr(field: string | undefined | null) {
  return field ?? '';
}

function ogImageUrl(url: string | undefined): string {
  if (!url) return 'https://teka.cd/og-default.png';
  if (url.includes('res.cloudinary.com')) {
    return url.replace('/upload/', '/upload/c_pad,w_1200,h_630,b_white/');
  }
  return url;
}

/** Canonical path `/{citySlug}/{slug}-{shortCode}` for a resolved product. */
function canonicalPathFor(product: ProductData): string {
  return productHref({
    id: product.id,
    slug: product.slug,
    shortCode: product.shortCode,
    citySlug: product.city?.slug,
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { product: productParam } = await params;
  const identifier = productIdentifierFromParam(productParam);
  const product = await serverFetch<ProductData>(
    `/v1/browse/products/${encodeURIComponent(identifier)}`,
  );

  if (!product) {
    const fallbackDesc =
      'Découvrez les produits sur Teka RDC — supermarché en ligne en RD Congo. Livraison à Lubumbashi, Kolwezi et Likasi.';
    return {
      title: 'Teka RDC',
      description: fallbackDesc,
      openGraph: {
        title: 'Teka RDC',
        description: fallbackDesc,
        siteName: 'Teka RDC',
        locale: 'fr_CD',
        type: 'website',
        images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: 'Teka RDC' }],
      },
      twitter: { card: 'summary_large_image', title: 'Teka RDC', description: fallbackDesc },
    };
  }

  const title = pickStr(product.title);
  const desc = pickStr(product.description);
  const ogImage = ogImageUrl(product.images?.[0]?.url);
  // Use the effective (discounted) price in the title/description.
  const effectiveCDF = product.discountPriceCDF ?? product.priceCDF;
  const price = (Number(effectiveCDF) / 100).toLocaleString('fr-CD');
  const categoryName = pickStr(product.category?.name);
  const cityName = pickStr(product.city?.name);
  const sellerName =
    product.seller?.sellerProfile?.businessName ||
    product.seller?.businessName ||
    product.seller?.shopName ||
    '';

  const fullTitle = `${title} - ${price} FC${cityName ? ` à ${cityName}` : ''}`;

  const MAX_DESC = 160;
  const tail =
    `${categoryName ? ` | ${categoryName}` : ''}` +
    `${sellerName ? ` | Vendu par ${sellerName}` : ''}` +
    ' sur Teka RDC.';
  const descBudget = Math.max(40, MAX_DESC - tail.length);
  const descShort =
    desc.length > descBudget
      ? `${desc.substring(0, descBudget - 3).replace(/[\s.,;:]+$/, '')}...`
      : desc;
  const truncatedDesc = `${descShort}${tail}`.substring(0, MAX_DESC);

  // Canonical = the product's true city URL (independent of the requested
  // /{ville}; a mismatched city 308-redirects in the page renderer).
  const canonicalPath = canonicalPathFor(product);

  return {
    title: fullTitle,
    description: truncatedDesc,
    keywords: [title, categoryName, cityName, sellerName, 'Teka RDC', 'acheter en ligne RDC'],
    openGraph: {
      title: `${title} | Teka RDC`,
      description: truncatedDesc,
      url: `https://teka.cd${canonicalPath}`,
      type: 'website',
      siteName: 'Teka RDC',
      locale: 'fr_CD',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Teka RDC`,
      description: truncatedDesc,
      images: [ogImage],
    },
    alternates: { canonical: canonicalPath },
  };
}

export default async function Page({ params }: Props) {
  const { ville, product: productParam } = await params;
  const identifier = productIdentifierFromParam(productParam);

  const product = await serverFetch<ProductData>(
    `/v1/browse/products/${encodeURIComponent(identifier)}`,
  );
  if (!product) notFound();

  // Demo retirement (P3c): a retired demo product (its category now has enough
  // real merchant products) 301s to its category page, funnelling inbound
  // links/SEO to the category instead of 404'ing. Dormant unless the operator
  // has enabled retirement.
  if (product.isRetired && product.category) {
    permanentRedirect(
      categoryHref(product.city?.slug ?? null, {
        id: product.category.id,
        slug: product.category.slug,
      }),
    );
  }

  // Enforce the canonical URL: if the requested city or slug-tail differs from
  // the product's true values, 308 to canonical (kills duplicate URLs and
  // wrong-city links). Only when the product actually has a city slug.
  const canonicalCity = product.city?.slug ?? null;
  const canonicalTail = productTail({
    id: product.id,
    slug: product.slug,
    shortCode: product.shortCode,
  });
  if (canonicalCity && (ville !== canonicalCity || productParam !== canonicalTail)) {
    permanentRedirect(canonicalPathFor(product));
  }

  const sellerDisplayName =
    product.seller?.sellerProfile?.businessName ||
    product.seller?.businessName ||
    product.seller?.shopName ||
    '';

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: pickStr(product.title),
    description: pickStr(product.description),
    image: product.images?.[0]?.url,
    sku: product.shortCode ?? product.id,
    // Prefer the product's real brand (first-class Brand library); fall back to
    // the seller / platform as the brand-like entity when none is set.
    brand: product.brand?.name
      ? { '@type': 'Brand', name: product.brand.name }
      : { '@type': 'Organization', name: sellerDisplayName || 'Teka RDC' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'CDF',
      // Effective (discounted) price — what the buyer actually pays.
      price: String(Number(product.discountPriceCDF ?? product.priceCDF) / 100),
      availability:
        product.quantity > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      itemCondition:
        product.condition === 'NEW'
          ? 'https://schema.org/NewCondition'
          : 'https://schema.org/UsedCondition',
      seller: { '@type': 'Organization', name: sellerDisplayName },
      ...(canonicalCity && {
        url: `https://teka.cd${canonicalPathFor(product)}`,
      }),
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
  };

  const categoryName = pickStr(product.category?.name);
  const cityName = pickStr(product.city?.name);
  const productName = pickStr(product.title);
  const cityUrl = canonicalCity ? `https://teka.cd/${canonicalCity}` : undefined;
  const breadcrumbItems: Array<Record<string, unknown>> = [
    { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://teka.cd' },
  ];
  let pos = 2;
  if (cityName && cityUrl) {
    breadcrumbItems.push({ '@type': 'ListItem', position: pos++, name: cityName, item: cityUrl });
  }
  if (categoryName) {
    breadcrumbItems.push({ '@type': 'ListItem', position: pos++, name: categoryName });
  }
  breadcrumbItems.push({ '@type': 'ListItem', position: pos, name: productName });
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems,
  };

  return (
    <>
      <OgUpdatedTime value={product.updatedAt} />
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <ProductDetailPage identifier={identifier} />
    </>
  );
}

/**
 * Emits `<meta property="og:updated_time">` (React 19 hoists it into <head>) so
 * FB/LinkedIn/etc. refresh their per-URL scrape cache. Max(product.updatedAt,
 * hour-precision now) keeps it always at least current-hour fresh.
 */
function OgUpdatedTime({ value }: { value?: string }) {
  const now = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const product = value ? Date.parse(value) : 0;
  const stamp = new Date(
    Math.max(now, Number.isFinite(product) ? product : 0),
  ).toISOString();
  return <meta property="og:updated_time" content={stamp} />;
}
