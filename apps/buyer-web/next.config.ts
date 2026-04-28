import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// URL → URL redirects for the static-page slug refactor. Kept in sync with
// apps/buyer-web/src/lib/static-pages.ts (PAGE_DEFINITIONS). Inlined here
// because next.config.ts is loaded outside the app's path-alias setup.
//
// Site is monolingual (FR-only) since 2026-04-25, so we only redirect FR
// URLs. Legacy `/en/*` URLs are caught by the wildcard below.
const PAGE_REDIRECTS: Array<{ canonical: string; fr: string }> = [
  { canonical: 'about',       fr: 'a-propos' },
  { canonical: 'help',        fr: 'aide' },
  { canonical: 'faq',         fr: 'faq' },
  { canonical: 'terms',       fr: 'conditions-utilisation' },
  { canonical: 'privacy',     fr: 'politique-confidentialite' },
  { canonical: 'how-to-buy',  fr: 'comment-acheter' },
  { canonical: 'how-to-sell', fr: 'comment-vendre' },
  { canonical: 'contact',     fr: 'contact' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Required in pnpm workspaces: without this, Next.js traces deps from
  // apps/buyer-web/ only and workspace packages (@teka/shared) never land
  // in the standalone output — the container then 502s on first request.
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  // Compile the @teka/shared workspace package through Next.js so TS sources
  // don't reach Node at runtime (its package.json main points at src/).
  transpilePackages: ['@teka/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },

  // 301 redirects for SEO continuity:
  //   - /pages/<canonical>   → /<fr-slug>  (legacy /pages/ prefix)
  //   - /<canonical-en>      → /<fr-slug>  (someone typed the English slug)
  //   - /en/<anything>       → /<anything> (legacy locale prefix)
  //   - /products/<slug>     → /<slug>     (legacy product URL prefix; product
  //                                          pages now live at the site root)
  async redirects() {
    const out: Array<{ source: string; destination: string; permanent: boolean }> = [];

    for (const p of PAGE_REDIRECTS) {
      out.push({
        source: `/pages/${p.canonical}`,
        destination: `/${p.fr}`,
        permanent: true,
      });
      // Cross-language typo handler — emit only when canonical (English) and
      // FR slugs differ.
      if (p.canonical !== p.fr) {
        out.push({
          source: `/${p.canonical}`,
          destination: `/${p.fr}`,
          permanent: true,
        });
      }
    }

    // Strip legacy /en/* prefixes from the bilingual era. Use `:path+`
    // (one-or-more) — `:path*` (zero-or-more) also matches `/en` alone, and
    // Next.js emits a malformed `Location: ` (empty header) for that case,
    // which Googlebot can't follow. The bare `/en` → `/` rule handles the
    // no-path case explicitly.
    out.push({ source: '/en/:path+', destination: '/:path+', permanent: true });
    out.push({ source: '/en', destination: '/', permanent: true });

    // Legacy /products/<slug> URLs (in use until 2026-04-26) → /<slug>.
    // Preserves Google index entries + any external product-link shares.
    out.push({
      source: '/products/:slug',
      destination: '/:slug',
      permanent: true,
    });

    // Legacy /search → /recherche (FR-only platform; route renamed for SEO).
    out.push({ source: '/search', destination: '/recherche', permanent: true });

    return out;
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
export default withNextIntl(nextConfig);
