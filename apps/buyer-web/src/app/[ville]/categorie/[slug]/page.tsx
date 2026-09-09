import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CategoryPage from '@/components/pages/category-page';
import { JsonLd } from '@/components/seo/json-ld';
import { serverFetch } from '@/lib/server-api';
import { findCityBySlug, getActiveCities } from '@/lib/server-cities';
import type { PaginatedProducts } from '@/lib/types';
import { listingRobots } from '@/lib/indexability';

type Props = { params: Promise<{ ville: string; slug: string }> };

interface ApiCategoryDetail {
  id: string;
  slug: string | null;
  name: string;
  productCount?: number;
  // Ancestor path root→self (inclusive) from getCategoryDetail.
  breadcrumb?: { id: string; slug: string | null; name: string }[];
  // Live children (sub-categories or product types), from getCategoryDetail.
  subcategories?: { id: string; slug: string | null; name: string }[];
}

/** First listing page, identical to the client's default query. */
const FIRST_PAGE_LIMIT = 12;

/**
 * Category detail with the TOWN-SCOPED eligible product count (SEO-2
 * decision 1): `productCount` is the number of publicly eligible products in
 * this town across the category's subtree — the API's single eligibility
 * definition (`BrowseService.publicProductWhere`), never a client-side card
 * count and never the global figure. Memoised by Next across generateMetadata
 * and the page for one request.
 */
async function fetchCategoryForTown(slug: string, cityId: string) {
  return serverFetch<ApiCategoryDetail>(
    `/v1/browse/categories/${encodeURIComponent(slug)}?cityId=${encodeURIComponent(cityId)}`,
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ville, slug } = await params;
  const city = await findCityBySlug(ville);
  const category = city ? await fetchCategoryForTown(slug, city.id) : null;

  const name = category?.name || '';
  const cityName = city?.name || '';
  // <title> = "{name} à {ville} — Acheter en ligne | Teka RDC": the root
  // layout's `%s | Teka RDC` template appends the brand, so the page title
  // must not repeat it (it used to render "… sur Teka RDC | Teka RDC").
  const title = `${name} à ${cityName} — Acheter en ligne`;
  const description = `Découvrez les produits ${name} disponibles à ${cityName} sur Teka RDC. Livraison rapide et paiement à la livraison.`;
  const canonical = `/${ville}/categorie/${slug}`;

  return {
    title,
    description,
    keywords: [name, `${name} ${cityName}`, 'Teka RDC', `livraison ${cityName}`],
    openGraph: {
      title: `${name} à ${cityName} | Teka RDC`,
      description,
      siteName: 'Teka RDC',
      type: 'website',
      locale: 'fr_CD',
      url: `https://teka.cd${canonical}`,
      images: [{ url: 'https://teka.cd/og-default.png', width: 1200, height: 630, alt: `${name} | Teka RDC` }],
    },
    twitter: { card: 'summary', title: `${name} à ${cityName} | Teka RDC`, description },
    alternates: { canonical },
    // Empty town × category (SEO-2 decision 1): the page stays reachable and
    // self-canonical, links are followed, but it is not indexed until this
    // town has eligible inventory again — then this flips back on its own
    // (ISR 60 s), no redirect and no fake 404 in either direction.
    robots: listingRobots(category),
  };
}

export default async function Page({ params }: Props) {
  const { ville, slug } = await params;
  const city = await findCityBySlug(ville);
  const category = city ? await fetchCategoryForTown(slug, city.id) : null;
  if (!city || !category) notFound();

  // SEO-1: the first product page for this town × category, server-rendered
  // (ISR-cached 60 s). Same query the client issued after paint, so the
  // hydrated page shows exactly what the HTML already held.
  const [firstPage, cities] = await Promise.all([
    serverFetch<PaginatedProducts>(
      `/v1/browse/products?categoryId=${category.id}&sortBy=newest&limit=${FIRST_PAGE_LIMIT}&cityId=${city.id}`,
    ),
    getActiveCities(),
  ]);

  const name = category.name || '';
  const ogUpdated = new Date(
    Math.floor(Date.now() / 3_600_000) * 3_600_000,
  ).toISOString();

  // Full ancestor path (Accueil › Ville › Catégorie › … › current) — matches
  // the visible breadcrumb. Each ancestor links to its city-scoped listing.
  const crumbs = category.breadcrumb ?? [{ id: category.id, slug: category.slug, name }];
  const itemListElement: Array<Record<string, unknown>> = [
    { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://teka.cd' },
    { '@type': 'ListItem', position: 2, name: city.name, item: `https://teka.cd/${ville}` },
  ];
  crumbs.forEach((c, i) => {
    const isLast = i === crumbs.length - 1;
    itemListElement.push({
      '@type': 'ListItem',
      position: 3 + i,
      name: c.name,
      ...(isLast || !c.slug ? {} : { item: `https://teka.cd/${ville}/categorie/${c.slug}` }),
    });
  });

  return (
    <>
      <meta property="og:updated_time" content={ogUpdated} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement,
        }}
      />
      <CategoryPage
        // Remount on client navigation to another town/category so the state
        // re-initialises from that page's server-rendered data.
        key={`${city.id}:${category.id}`}
        categoryUuid={category.id}
        cityId={city.id}
        initialCategory={{
          id: category.id,
          name,
          slug: category.slug,
          breadcrumb: category.breadcrumb,
          subcategories: category.subcategories,
        }}
        initialProducts={firstPage?.data}
        initialPagination={firstPage?.pagination}
        initialCities={cities}
      />
    </>
  );
}
