import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ContentPageView } from '@/components/pages/content-page-view';
import CityLandingPage from '@/components/pages/city-landing-page';
import { serverFetch } from '@/lib/server-api';
import { findCityBySlug } from '@/lib/server-cities';
import { productHref } from '@/lib/urls';
import {
  allStaticPageParams,
  canonicalToUrlSlug,
  pathForCanonical,
  urlSlugToCanonical,
} from '@/lib/static-pages';

// Root single-segment dispatcher (city-first URL refactor, 2026-06-06).
// One of:
//   /{ville}        → city landing       (active city slug)
//   /{static-slug}  → CMS content page   (a-propos, faq, …)
//   /{legacy}       → 308 → canonical product URL  (old flat product link)
//   else            → 404
// Product detail lives at /{ville}/{slug}-{shortCode} (see [product]/page.tsx);
// city-scoped categories at /{ville}/categorie/{slug}.

type Props = { params: Promise<{ ville: string }> };

interface ApiContentPage {
  slug: string;
  title: string;
  content: string;
  status: string;
}

interface ProductRedirectData {
  id: string;
  slug?: string | null;
  shortCode?: string | null;
  city?: { slug: string | null } | null;
}

function pickStr(field: string | undefined | null) {
  return field ?? '';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ville } = await params;

  // 1) City landing
  const city = await findCityBySlug(ville);
  if (city) {
    // Page title (the <title> tag) — the root layout's `%s | Teka RDC` template
    // appends the brand, so do NOT add it here (that produced a doubled
    // "… — Teka RDC | Teka RDC"). OG/Twitter don't use the template, so they get
    // the explicitly branded variant.
    const title = `Achetez en ligne à ${city.name}`;
    const brandedTitle = `${title} | Teka RDC`;
    const description = `Découvrez les produits disponibles à ${city.name}, ${city.province} sur Teka RDC. Livraison rapide et paiement à la livraison.`;
    const canonical = `/${ville}`;
    return {
      title,
      description,
      keywords: [
        `acheter en ligne ${city.name}`,
        `livraison ${city.name}`,
        'Teka RDC',
      ],
      openGraph: {
        title: brandedTitle,
        description,
        siteName: 'Teka RDC',
        locale: 'fr_CD',
        type: 'website',
        url: `https://teka.cd${canonical}`,
        images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: brandedTitle }],
      },
      twitter: { card: 'summary_large_image', title: brandedTitle, description },
      alternates: { canonical },
    };
  }

  // 2) Static content page
  const canonical = urlSlugToCanonical(ville);
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
          images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: `${title} | Teka RDC` }],
        },
        twitter: { card: 'summary_large_image', title: `${title} | Teka RDC`, description },
        alternates: { canonical: path },
      };
    }
  }

  // 3) Legacy product / unknown — minimal (page() will redirect or 404).
  return { title: 'Teka RDC' };
}

// Prerender the static content pages; cities + products stay dynamic.
export function generateStaticParams() {
  return allStaticPageParams().map((p) => ({ ville: p.slug }));
}

export default async function Page({ params }: Props) {
  const { ville } = await params;

  // 1) City landing
  const city = await findCityBySlug(ville);
  if (city && city.slug) {
    return (
      <CityLandingPage
        cityId={city.id}
        citySlug={city.slug}
        cityName={city.name}
        province={city.province}
        accentColor={city.accentColor ?? null}
        heroImageUrl={city.heroImageUrl ?? null}
      />
    );
  }

  // 2) Static content page
  const canonical = urlSlugToCanonical(ville);
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

  // 3) Legacy flat product URL → 308 to the canonical city URL.
  // The browse API resolves UUID / shortCode / slug; if it resolves and has a
  // city, send the crawler to the canonical /{ville}/{slug}-{shortCode}.
  const product = await serverFetch<ProductRedirectData>(
    `/v1/browse/products/${encodeURIComponent(ville)}`,
  );
  if (product && product.city?.slug) {
    permanentRedirect(
      productHref({
        id: product.id,
        slug: product.slug,
        shortCode: product.shortCode,
        citySlug: product.city.slug,
      }),
    );
  }

  notFound();
}
