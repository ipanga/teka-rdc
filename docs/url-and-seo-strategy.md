# URL & SEO Strategy (city-first)

Authoritative reference for buyer-web URLs, routing, slugs, redirects, and the
city-selection flow. Established by the city-first URL refactor (2026-06-06).
buyer-web is the only SEO-relevant surface; seller-web (`/seller`) and admin-web
(`/admin`) are login-gated and `noindex`.

## URL scheme

```
/                              Global homepage (crawlable; city selector, featured content)
/{ville}                       City landing page (e.g. /lubumbashi)
/{ville}/{slug}-{shortCode}    Product detail (e.g. /lubumbashi/iphone-15-pro-max-a1b2c3)
/{ville}/categorie/{catSlug}   City-scoped category (e.g. /lubumbashi/categorie/telephones-et-electronique)
/categories                    Global category index (links into the selected/ default city)
/recherche                     Search
/a-propos /aide /faq …         Static CMS pages (French slugs, root level)
/panier /paiement /commandes /favoris /profil /connexion /reclamer-compte   App routes (French)
```

`{ville}` is a city **slug** (`City.slug`, e.g. `lubumbashi`). The product
`{slug}` is cosmetic; the trailing **`{shortCode}`** (6-char, `Product.shortCode
@unique`) is the resolver.

## Why this shape

- **City-based marketplace.** Products are sold within a city; the city belongs
  in the path, not buried in a query string or the slug. City + category pages
  (`/lubumbashi/categorie/telephones`) capture local-intent search.
- **Stable, clean product URLs.** The slug is decorative (renaming a product
  doesn't break links); the `shortCode` resolves the product. The city comes
  from `product.cityId`, never from the slug.
- **Future cities just work.** Activate a city (admin) → its `slug` is generated
  → `/{newville}/…` resolves with zero code changes.

## Resolution (backend)

`GET /v1/browse/products/:identifier` resolves in order: **UUID → shortCode →
slug** (slug is the legacy fallback). `GET /v1/browse/categories/:identifier`
resolves UUID **or** slug. `GET /v1/cities` returns active cities incl. `slug`.

The `/[ville]` route is a **dispatcher**:
1. active city slug → city landing
2. known static-page slug → CMS content
3. otherwise → resolve as a (legacy) product → **308** to its canonical
   `/{ville}/{slug}-{shortCode}`; else `404`.

The `/[ville]/[product]` route 308-redirects to canonical when the requested
city or slug-tail doesn't match the product's true values — so duplicate and
wrong-city URLs collapse to one canonical.

## Slugs & shortCode

- `slug = slugify(title)` — clean, accent-stripped, **city-free, id-free**, NOT
  unique. Source: `apps/api/src/common/utils/slugify.ts` (also mirrored in
  `prisma/seed.ts`).
- `shortCode` — 6-char base36, `@unique`, collision-checked at product create
  (`generateUniqueShortCode`). Seed/backfill derive it deterministically from
  the UUID via `md5(id)[0:6]` so re-seeds and the SQL backfill agree.
- `City.slug = slugify(name)` — set on admin create/rename.
- **Single source of truth for building URLs:** `apps/buyer-web/src/lib/urls.ts`
  (`productHref`, `cityHref`, `categoryHref`, `productIdentifierFromParam`). The
  sitemap reuses these so it can't drift from the live routes.

## Redirects (all 301/308, no chains)

Configured in `apps/buyer-web/next.config.ts` + the `/[ville]` dispatcher:

| From | To |
|---|---|
| `/cart` | `/panier` |
| `/checkout/*` | `/paiement/*` |
| `/orders/*` | `/commandes/*` |
| `/wishlist` | `/favoris` |
| `/profile` | `/profil` |
| `/products/:slug` | `/:slug` (legacy) |
| `/search` | `/recherche` |
| `/categorie/{slug}` | `/{defaultCity}/categorie/{slug}` |
| `/categories/{id}` | `/{defaultCity}/categorie/{slug}` (one hop) |
| `/{legacy-flat-product}` | `/{ville}/{slug}-{shortCode}` (via dispatcher) |
| `/en/*`, `/fr/*` | `/*` (legacy locale strip) |

`next.config` redirects run before routing, so old paths never reach the
dispatcher. Children use `:path+` (one-or-more) — `:path*` would emit a
malformed `Location` for the bare base.

## City selection (non-blocking)

The homepage **never** forces a city modal (that gated crawling). Behaviour:
- No city chosen → all-cities listings + a dismissable inline `CityPrompt` +
  an always-present header city control + a crawlable "Achetez dans votre
  ville" links section.
- Landing on `/{ville}` adopts that city as the active selection (URL is the
  source of truth).
- Web persists the choice client-side (`localStorage` via `useCityStore`);
  mobile via `FlutterSecureStorage`. No server-side `preferredCity` (yet).

## Crawl / indexability

- Every product, city, and city-scoped category page renders without login,
  cookies, city selection, or JS interaction.
- One canonical per page (product canonical = its city URL).
- `robots.txt` (static, `public/robots.txt`) disallows only private routes
  (`/panier/ /paiement/ /commandes/ /favoris/ /profil/ /api/ /_next/`); social
  crawlers use empty `Disallow:` per the FB spec.
- `sitemap.ts` emits canonical city-first URLs for cities, city-scoped
  categories (categories × active cities), and products (city-less skipped).
- JSON-LD breadcrumb: Accueil → Ville → Catégorie → Produit.

## Mobile & analytics

- **Mobile is decoupled** from web URLs: go_router is ID-based, French-named,
  with **no `teka.cd` deep-link intent-filters** and no web-URL construction.
- **Analytics impact is dashboard-only** (no code): PostHog `$pageview` is
  path-keyed (custom events are id-keyed and unaffected); Clarity groups by URL
  (new page groups); Sentry is route-agnostic (`tracesSampleRate: 0`). See
  `docs/analytics.md` § "URL migration impact".
