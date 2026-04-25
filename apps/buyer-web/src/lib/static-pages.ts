/**
 * Single source of truth for the 8 static content pages.
 *
 * The DB stores ONE row per page, keyed by an English "canonical" slug (the
 * column name didn't change for the FR-only refactor — DB schema is preserved
 * per the API-contract constraint). The URL slug below is what users see in
 * the address bar:
 *
 *   /a-propos          ─→ DB row { slug: 'about', title: { fr, en }, content: { fr, en } }
 *
 * Routes resolve via `app/[locale]/[slug]/page.tsx`, which uses the helpers
 * below to translate URL slug → canonical (DB) slug.
 *
 * Adding a new page: add an entry to PAGE_DEFINITIONS — generateStaticParams,
 * the sitemap, the footer and the redirects all derive from it.
 */

export type CanonicalSlug =
  | 'about'
  | 'help'
  | 'faq'
  | 'terms'
  | 'privacy'
  | 'how-to-buy'
  | 'how-to-sell'
  | 'contact';

// `Locale` kept exported so legacy call-sites that imported the type still
// compile. Always 'fr' since the monolingual refactor.
export type Locale = 'fr';

interface PageDefinition {
  /** Stored in `content_pages.slug` — never changes; used for API lookups. */
  canonical: CanonicalSlug;
  /** URL slug visible in the address bar. */
  urlSlug: string;
}

export const PAGE_DEFINITIONS: ReadonlyArray<PageDefinition> = [
  { canonical: 'about',       urlSlug: 'a-propos' },
  { canonical: 'help',        urlSlug: 'aide' },
  { canonical: 'faq',         urlSlug: 'faq' },
  { canonical: 'terms',       urlSlug: 'conditions-utilisation' },
  { canonical: 'privacy',     urlSlug: 'politique-confidentialite' },
  { canonical: 'how-to-buy',  urlSlug: 'comment-acheter' },
  { canonical: 'how-to-sell', urlSlug: 'comment-vendre' },
  { canonical: 'contact',     urlSlug: 'contact' },
];

const URL_TO_CANONICAL: Record<string, CanonicalSlug> = Object.fromEntries(
  PAGE_DEFINITIONS.map((p) => [p.urlSlug, p.canonical]),
);

/** URL slug (e.g. 'a-propos') → DB slug ('about'), or null if unknown. */
export function urlSlugToCanonical(urlSlug: string): CanonicalSlug | null {
  return URL_TO_CANONICAL[urlSlug] ?? null;
}

/** Canonical (DB) slug → URL slug. */
export function canonicalToUrlSlug(canonical: CanonicalSlug): string {
  const def = PAGE_DEFINITIONS.find((p) => p.canonical === canonical);
  return def?.urlSlug ?? canonical;
}

/** Path for a static page (no locale prefix in monolingual mode). */
export function pathForCanonical(canonical: CanonicalSlug): string {
  return `/${canonicalToUrlSlug(canonical)}`;
}

/** All URL slugs — drives generateStaticParams + the sitemap. */
export function allStaticPageParams(): Array<{ locale: 'fr'; slug: string }> {
  return PAGE_DEFINITIONS.map((p) => ({ locale: 'fr' as const, slug: p.urlSlug }));
}

/**
 * Rewrite internal markdown links so legacy /pages/<en-slug> or /<en-slug>
 * (left over from the bilingual era's seed copy) resolve to the right FR URL.
 */
export function rewriteContentLink(href: string): string {
  let path = href;

  // Strip a stray locale prefix (e.g. /en/foo, /fr/foo from seed copy).
  if (path === '/en' || path.startsWith('/en/')) {
    path = path.slice(3) || '/';
  } else if (path === '/fr' || path.startsWith('/fr/')) {
    path = path.slice(3) || '/';
  }

  // Strip legacy /pages/ prefix.
  if (path.startsWith('/pages/')) {
    path = path.slice('/pages'.length);
  }

  // /<urlSlug> — match against the FR slug map first; fall back to the
  // canonical (English) slug since some seed copy still links by canonical.
  const slug = path.startsWith('/') ? path.slice(1).split('/')[0] : '';
  if (slug) {
    const canonicalDirect = URL_TO_CANONICAL[slug];
    if (canonicalDirect) return pathForCanonical(canonicalDirect);

    // legacy English canonical → FR URL slug
    const def = PAGE_DEFINITIONS.find((p) => p.canonical === slug);
    if (def) return pathForCanonical(def.canonical);
  }

  return path;
}
