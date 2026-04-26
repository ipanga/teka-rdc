import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContentPageView } from '@/components/pages/content-page-view';
import ProductDetailPage from '@/components/pages/product-detail-page';
import { JsonLd } from '@/components/seo/json-ld';
import { serverFetch } from '@/lib/server-api';
import {
  allStaticPageParams,
  canonicalToUrlSlug,
  pathForCanonical,
  urlSlugToCanonical,
} from '@/lib/static-pages';

type Props = { params: Promise<{ locale: string; slug: string }> };

interface ApiContentPage {
  slug: string;
  title: string | Record<string, string>;
  content: string | Record<string, string>;
  status: string;
}

interface ProductData {
  title: string | Record<string, string>;
  description: string | Record<string, string>;
  priceCDF: string;
  priceUSD?: string | null;
  avgRating: number;
  totalReviews: number;
  quantity: number;
  condition: string;
  images: Array<{ url: string }>;
  seller: {
    businessName?: string;
    shopName?: string;
    sellerProfile?: { businessName?: string };
  };
  category?: { name: string | Record<string, string> };
}

/**
 * Pick a plain string out of a field that may either be a string (current
 * monolingual API response) or a `{ fr, en }` JSON object (legacy shape from
 * cached payloads or older callers). The DB has been flattened to TEXT, but
 * the union keeps things robust.
 */
function pickStr(field: string | Record<string, string> | undefined) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field.fr || Object.values(field)[0] || '';
}

/**
 * Build the OG image URL for a product. Cloudinary URLs get padded to a
 * 1200x630 share-card; everything else passes through.
 */
function ogImageUrl(url: string | undefined): string {
  if (!url) return 'https://teka.cd/og-default.png';
  if (url.includes('res.cloudinary.com')) {
    return url.replace('/upload/', '/upload/c_pad,w_1200,h_630,b_white/');
  }
  return url;
}

// ===========================================================================
// generateMetadata: static-page → product → minimal title fallback.
// ===========================================================================

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  // 1) Known static page (about, faq, terms, etc.)
  const canonical = urlSlugToCanonical(slug);
  if (canonical) {
    const page = await serverFetch<ApiContentPage>(`/v1/content/${canonical}`);
    if (page) {
      const title = pickStr(page.title);
      const body = pickStr(page.content);
      const description = body
        .replace(/^#+\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 160);
      const path = pathForCanonical(canonical);
      return {
        title,
        description,
        openGraph: {
          title: `${title} | Teka RDC`,
          description,
          siteName: 'Teka RDC',
          locale: 'fr_CD',
          url: `https://teka.cd${path}`,
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
        alternates: { canonical: path },
      };
    }
  }

  // 2) Product slug. Browse API resolves both UUIDs and slugs.
  const product = await serverFetch<ProductData>(`/v1/browse/products/${slug}`);
  if (product) {
    const title = pickStr(product.title);
    const desc = pickStr(product.description);
    const ogImage = ogImageUrl(product.images?.[0]?.url);
    const price = (Number(product.priceCDF) / 100).toLocaleString('fr-CD');
    const categoryName = pickStr(product.category?.name);
    const sellerName =
      product.seller?.sellerProfile?.businessName ||
      product.seller?.businessName ||
      product.seller?.shopName ||
      '';

    const fullTitle = `${title} - ${price} FC`;
    const fullDesc =
      `${desc.substring(0, 120)}${desc.length > 120 ? '...' : ''} | ${categoryName} | Vendu par ${sellerName} sur Teka RDC. Livraison à Lubumbashi & Kolwezi.`;
    const truncatedDesc = fullDesc.substring(0, 160);

    const canonicalPath = `/${slug}`;

    return {
      title: fullTitle,
      description: truncatedDesc,
      keywords: [
        title,
        categoryName,
        sellerName,
        'Teka RDC',
        'acheter en ligne RDC',
      ],
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

  return { title: 'Teka RDC' };
}

// ===========================================================================
// generateStaticParams: prerender static pages only. Product pages stay
// dynamic — there can be thousands and they change frequently.
// ===========================================================================

export function generateStaticParams() {
  return allStaticPageParams();
}

// ===========================================================================
// Page renderer: same priority as metadata.
// ===========================================================================

export default async function Page({ params }: Props) {
  const { slug } = await params;

  // 1) Static page
  const canonical = urlSlugToCanonical(slug);
  if (canonical) {
    const page = await serverFetch<ApiContentPage>(`/v1/content/${canonical}`);
    if (page && page.status === 'PUBLISHED') {
      return (
        <ContentPageView
          slug={canonicalToUrlSlug(canonical)}
          canonical={canonical}
          title={pickStr(page.title)}
          body={pickStr(page.content)}
        />
      );
    }
  }

  // 2) Product
  const product = await serverFetch<ProductData>(`/v1/browse/products/${slug}`);
  if (product) {
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
      sku: slug,
      brand: { '@type': 'Organization', name: sellerDisplayName || 'Teka RDC' },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'CDF',
        price: String(Number(product.priceCDF) / 100),
        availability: product.quantity > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        itemCondition: product.condition === 'NEW'
          ? 'https://schema.org/NewCondition'
          : 'https://schema.org/UsedCondition',
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
    };

    const categoryName = pickStr(product.category?.name);
    const productName = pickStr(product.title);
    const breadcrumbJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://teka.cd' },
        ...(categoryName
          ? [{ '@type': 'ListItem', position: 2, name: categoryName, item: 'https://teka.cd/categories' }]
          : []),
        { '@type': 'ListItem', position: categoryName ? 3 : 2, name: productName },
      ],
    };

    return (
      <>
        <JsonLd data={productJsonLd} />
        <JsonLd data={breadcrumbJsonLd} />
        <ProductDetailPage />
      </>
    );
  }

  notFound();
}
