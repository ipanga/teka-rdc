import { effectiveCentimes } from '@/lib/format';
import { plainText, truncateForMeta } from '@/lib/seo-text';
import { isRealBrand } from '@/lib/brand';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import ProductDetailPage from '@/components/pages/product-detail-page';
import { JsonLd } from '@/components/seo/json-ld';
import { serverFetch } from '@/lib/server-api';
import { getActiveCities } from '@/lib/server-cities';
import { deliveryPhrase } from '@/lib/service-area';
import type { ProductDetail } from '@/lib/types';
import {
  productHref,
  productTail,
  productIdentifierFromParam,
  categoryHref,
} from '@/lib/urls';

type Props = { params: Promise<{ ville: string; product: string }> };

/**
 * What GET /v1/browse/products/:identifier returns — the client's
 * `ProductDetail` (the same object is passed to the client component as its
 * initial state) plus the fields only the server route reads.
 */
type ProductData = ProductDetail & {
  updatedAt?: string;
  avgRating?: number;
  totalReviews?: number;
  brand?: { id: string; name: string; slug?: string | null } | null;
  // Demo retirement (P3c): true for a demo product in a retired category.
  isRetired?: boolean;
};

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
    // Served towns from the active-town API (SEO-2 decision 2).
    const fallbackDesc = `Découvrez les produits sur Teka RDC — supermarché en ligne en RD Congo. ${deliveryPhrase(await getActiveCities())}`;
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
  // Seller descriptions are markdown; a snippet must be plain text.
  const desc = plainText(product.description);
  const ogImage = ogImageUrl(product.images?.[0]?.url);
  // Use the effective (discounted) price in the title/description.
  const effectiveCDF = effectiveCentimes(product);
  const price = (Number(effectiveCDF) / 100).toLocaleString('fr-CD');
  const categoryName = pickStr(product.category?.name);
  const cityName = pickStr(product.city?.name);
  const sellerName = product.seller?.businessName || '';

  const fullTitle = `${title} - ${price} FC${cityName ? ` à ${cityName}` : ''}`;

  const MAX_DESC = 160;
  const tail =
    `${categoryName ? ` | ${categoryName}` : ''}` +
    `${sellerName ? ` | Vendu par ${sellerName}` : ''}` +
    ' sur Teka RDC.';
  const descBudget = Math.max(40, MAX_DESC - tail.length);
  const truncatedDesc = `${truncateForMeta(desc, descBudget)}${tail}`.substring(0, MAX_DESC);

  // Canonical = the product's true city URL (independent of the requested
  // /{ville}; a mismatched city 308-redirects in the page renderer).
  const canonicalPath = canonicalPathFor(product);

  return {
    title: fullTitle,
    description: truncatedDesc,
    keywords: [title, categoryName, cityName, sellerName, 'Teka RDC', 'acheter en ligne RDC'],
    // No `type` here: Next's metadata API rejects `og:type=product` (it only
    // knows the website/article/profile families and throws at render). The
    // product type and its price tags are hoisted from the page body instead
    // (see <ProductOpenGraph/>), so the head carries ONE og:type.
    openGraph: {
      title: `${title} | Teka RDC`,
      description: truncatedDesc,
      url: `https://teka.cd${canonicalPath}`,
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

  const [product, cities] = await Promise.all([
    serverFetch<ProductData>(`/v1/browse/products/${encodeURIComponent(identifier)}`),
    getActiveCities(),
  ]);
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

  const sellerDisplayName = product.seller?.businessName || '';

  const imageUrls = (product.images ?? []).map((i) => i.url).filter(Boolean);
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: pickStr(product.title),
    // Plain text, not markdown (schema.org Text); every image, not only the
    // first (Google's Product guidance prefers several aspect ratios).
    description: plainText(product.description),
    ...(imageUrls.length > 0 && { image: imageUrls.length === 1 ? imageUrls[0] : imageUrls }),
    sku: product.shortCode ?? product.id,
    // Prefer the product's real brand (first-class Brand library); fall back to
    // the seller / platform as the brand-like entity when none is set.
    brand: isRealBrand(product.brand)
      ? { '@type': 'Brand', name: product.brand.name }
      : { '@type': 'Organization', name: sellerDisplayName || 'Teka RDC' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'CDF',
      // Effective (discounted) price — what the buyer actually pays. Same
      // helper as the cart/checkout so search engines never see a different
      // figure than the checkout charges (PR B, 2026-09-06).
      price: String(Number(effectiveCentimes(product)) / 100),
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
    ...((product.totalReviews ?? 0) > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.avgRating,
        reviewCount: product.totalReviews,
        bestRating: 5,
        worstRating: 1,
      },
    }),
  };

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
  // Full category path (Catégorie → Sous-catégorie → Type), matching the
  // visible breadcrumb. Each crumb links to its city-scoped listing page.
  const crumbs = product.breadcrumb ?? [];
  for (const crumb of crumbs) {
    const name = pickStr(crumb.name);
    if (!name) continue;
    const item =
      canonicalCity && crumb.slug
        ? `https://teka.cd/${canonicalCity}/categorie/${crumb.slug}`
        : undefined;
    breadcrumbItems.push({ '@type': 'ListItem', position: pos++, name, ...(item ? { item } : {}) });
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
      <ProductOpenGraph
        priceCentimes={effectiveCentimes(product)}
        availability={product.quantity > 0 ? 'instock' : 'oos'}
      />
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <ProductDetailPage
        key={product.id}
        identifier={identifier}
        initialProduct={product}
        initialCities={cities}
      />
    </>
  );
}

/**
 * Open Graph product tags (hoisted into <head> by React 19, like
 * `og:updated_time`). `og:type=product` cannot be expressed through Next's
 * metadata API (it throws on unknown types), so the page emits it here — and
 * generateMetadata deliberately sets no `openGraph.type`, so there is exactly
 * one og:type in the document. Price = the effective (discounted) figure, the
 * same one the JSON-LD offer and the checkout use.
 */
function ProductOpenGraph({
  priceCentimes,
  availability,
}: {
  priceCentimes: string;
  availability: 'instock' | 'oos';
}) {
  const amount = (Number(priceCentimes) / 100).toFixed(2);
  return (
    <>
      <meta property="og:type" content="product" />
      <meta property="product:price:amount" content={amount} />
      <meta property="product:price:currency" content="CDF" />
      <meta property="og:availability" content={availability} />
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
