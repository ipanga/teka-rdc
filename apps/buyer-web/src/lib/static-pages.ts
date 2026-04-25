/**
 * Single source of truth for the 8 static content pages.
 *
 * The DB stores ONE row per page, keyed by an English "canonical" slug. Each
 * locale renders the same content under a different URL slug:
 *
 *   FR /a-propos                  ─┐
 *                                  ├─→ DB row { slug: 'about', title: { fr, en }, content: { fr, en } }
 *   EN /en/about                   ┘
 *
 * Routes resolve via `app/[locale]/[slug]/page.tsx`, which uses the helpers
 * below to translate between URL slug and canonical (DB) slug.
 *
 * Adding a new page: add an entry to PAGE_DEFINITIONS — generateStaticParams,
 * the sitemap, the footer, hreflang and the redirects all derive from it.
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

export type Locale = 'fr' | 'en';

interface PageDefinition {
  /** Stored in `content_pages.slug` — never changes; used for API lookups. */
  canonical: CanonicalSlug;
  /** URL slugs per locale. Same as canonical for pages we don't translate (faq, contact). */
  urlSlug: Record<Locale, string>;
}

export const PAGE_DEFINITIONS: ReadonlyArray<PageDefinition> = [
  { canonical: 'about',        urlSlug: { fr: 'a-propos',                   en: 'about' } },
  { canonical: 'help',         urlSlug: { fr: 'aide',                       en: 'help' } },
  { canonical: 'faq',          urlSlug: { fr: 'faq',                        en: 'faq' } },
  { canonical: 'terms',        urlSlug: { fr: 'conditions-utilisation',     en: 'terms' } },
  { canonical: 'privacy',      urlSlug: { fr: 'politique-confidentialite',  en: 'privacy' } },
  { canonical: 'how-to-buy',   urlSlug: { fr: 'comment-acheter',            en: 'how-to-buy' } },
  { canonical: 'how-to-sell',  urlSlug: { fr: 'comment-vendre',             en: 'how-to-sell' } },
  { canonical: 'contact',      urlSlug: { fr: 'contact',                    en: 'contact' } },
];

const URL_TO_CANONICAL: Record<Locale, Record<string, CanonicalSlug>> = {
  fr: Object.fromEntries(PAGE_DEFINITIONS.map((p) => [p.urlSlug.fr, p.canonical])),
  en: Object.fromEntries(PAGE_DEFINITIONS.map((p) => [p.urlSlug.en, p.canonical])),
};

/** URL slug (e.g. 'a-propos') → DB slug ('about'), or null if unknown. */
export function urlSlugToCanonical(
  urlSlug: string,
  locale: Locale,
): CanonicalSlug | null {
  return URL_TO_CANONICAL[locale]?.[urlSlug] ?? null;
}

/** Canonical (DB) slug → URL slug for the given locale. */
export function canonicalToUrlSlug(
  canonical: CanonicalSlug,
  locale: Locale,
): string {
  const def = PAGE_DEFINITIONS.find((p) => p.canonical === canonical);
  return def?.urlSlug[locale] ?? canonical;
}

/**
 * Path for a static page, locale-aware. With `localePrefix: 'as-needed'` the
 * default (FR) has no prefix; EN does.
 */
export function pathForCanonical(canonical: CanonicalSlug, locale: Locale): string {
  const slug = canonicalToUrlSlug(canonical, locale);
  return locale === 'fr' ? `/${slug}` : `/${locale}/${slug}`;
}

/** All (locale, urlSlug) tuples — drives generateStaticParams + the sitemap. */
export function allStaticPageParams(): Array<{ locale: Locale; slug: string }> {
  return PAGE_DEFINITIONS.flatMap((p) => [
    { locale: 'fr' as const, slug: p.urlSlug.fr },
    { locale: 'en' as const, slug: p.urlSlug.en },
  ]);
}

const LOCALES: ReadonlyArray<Locale> = ['fr', 'en'];

/** Used by JSON-LD link rewriting in markdown — translate inbound paths to the current locale. */
export function rewriteContentLink(href: string, currentLocale: Locale): string {
  // Strip locale prefix if present, e.g. /en/foo → /foo
  let path = href;
  for (const l of LOCALES) {
    if (path === `/${l}` || path.startsWith(`/${l}/`)) {
      path = path.slice(l.length + 1) || '/';
      break;
    }
  }

  // Strip legacy /pages/ prefix.
  if (path.startsWith('/pages/')) {
    path = path.slice('/pages'.length);
  }

  // /<urlSlug> — try to match against any locale's URL slugs (handles cases
  // where seed copy links to '/about' from FR content, etc.).
  const slug = path.startsWith('/') ? path.slice(1).split('/')[0] : '';
  if (slug) {
    for (const l of LOCALES) {
      const canonical = URL_TO_CANONICAL[l][slug];
      if (canonical) {
        return pathForCanonical(canonical, currentLocale);
      }
    }
  }

  // Not a static-page link; return as-is. next-intl's <Link> will add the
  // locale prefix when rendering.
  return href.startsWith('/pages/') ? href.slice('/pages'.length) : href;
}
