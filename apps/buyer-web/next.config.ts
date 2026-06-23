import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

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
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      // Dev-only: the local/sample seed catalog still uses picsum.photos
      // placeholder images. Prod product images are all on Cloudinary, so this
      // host is NOT allowed in production (keeps the prod allow-list tight).
      // Without it, next/image throws "unconfigured host" and crashes product
      // cards when running buyer-web against a picsum-seeded dev DB.
      ...(process.env.NODE_ENV !== 'production'
        ? [{ protocol: 'https' as const, hostname: 'picsum.photos' }]
        : []),
    ],
  },

  // PostHog reverse proxy. The browser talks to teka.cd/ingest/* (same origin)
  // so ad-blockers on DRC networks don't drop analytics; Next forwards to
  // PostHog US Cloud. posthog-js is configured with api_host:'/ingest'.
  // skipTrailingSlashRedirect is required — PostHog's API paths must not be
  // 308-redirected to a trailing-slash variant.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
      { source: '/ingest/flags', destination: 'https://us.i.posthog.com/flags' },
    ];
  },

  // Serve the deep-link association files as application/json with a modest
  // cache. Both live in public/.well-known/; assetlinks.json already gets the
  // right type from its extension, but the extensionless apple-app-site-
  // association needs it set explicitly (Apple is lenient, but be correct).
  // Additive only — does not touch routing, redirects, or SEO.
  async headers() {
    return [
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
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

    // Legacy /en/* + /fr/* prefixes from when URLs had a locale segment.
    // The platform is monolingual now; strip the prefix and redirect to the
    // un-prefixed path. `:path+` (one-or-more) — `:path*` (zero-or-more) also
    // matches `/en` alone, and Next.js emits a malformed `Location:` (empty
    // header) for that case, which Googlebot can't follow.
    out.push({ source: '/en/:path+', destination: '/:path+', permanent: true });
    out.push({ source: '/en', destination: '/', permanent: true });
    out.push({ source: '/fr/:path+', destination: '/:path+', permanent: true });
    out.push({ source: '/fr', destination: '/', permanent: true });

    // Legacy /products/<slug> URLs (in use until 2026-04-26) → /<slug>.
    // Preserves Google index entries + any external product-link shares.
    out.push({
      source: '/products/:slug',
      destination: '/:slug',
      permanent: true,
    });

    // Legacy /search → /recherche (FR-only platform; route renamed for SEO).
    out.push({ source: '/search', destination: '/recherche', permanent: true });

    // Buyer auth route refactor (2026-05-15): email+password buyer auth was
    // replaced by WhatsApp OTP. Old English-slug routes redirect to the new
    // French-slug routes; password-flow URLs redirect to the OTP login.
    out.push({ source: '/login',           destination: '/connexion',        permanent: true });
    out.push({ source: '/register',        destination: '/connexion',        permanent: true });
    out.push({ source: '/migrate',         destination: '/reclamer-compte',  permanent: true });
    out.push({ source: '/forgot-password', destination: '/connexion',        permanent: false });
    out.push({ source: '/setup-password',  destination: '/connexion',        permanent: false });
    out.push({ source: '/reset-password',  destination: '/connexion',        permanent: false });

    // French route renames (2026-06-06, city-first URL refactor). Old English
    // storefront routes 301 to their French equivalents. These MUST exist:
    // without them the old paths fall through to the /[ville] dispatcher and
    // 404. Base + `:path+` (one-or-more) for children — `:path*` would also
    // match the base and emit a malformed Location header (see /en note above).
    const ROUTE_RENAMES: Array<[string, string]> = [
      ['/cart', '/panier'],
      ['/checkout', '/paiement'],
      ['/orders', '/commandes'],
      ['/wishlist', '/favoris'],
      ['/profile', '/profil'], // old English path → existing FR route
    ];
    for (const [from, to] of ROUTE_RENAMES) {
      out.push({ source: from, destination: to, permanent: true });
      out.push({ source: `${from}/:path+`, destination: `${to}/:path+`, permanent: true });
    }

    return out;
  },
};

// withSentryConfig injects the build-time source-map upload step (gated by
// SENTRY_AUTH_TOKEN, no-op without it — wired in PR 4).
export default withSentryConfig(nextConfig, {
  org: 'teka-rdc',
  project: 'teka-buyer-web',
  // Quiet build output unless we're on CI. Source-map upload + release
  // tagging gate on SENTRY_AUTH_TOKEN — wired in PR 4. Until then this
  // wrap is a no-op aside from setting Sentry's release metadata.
  silent: !process.env.CI,
  disableLogger: true,
});
