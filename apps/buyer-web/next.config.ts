import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// URL → URL redirects for the static-page slug refactor. Kept in sync with
// apps/buyer-web/src/lib/static-pages.ts (PAGE_DEFINITIONS). Inlined here
// because next.config.ts is loaded outside the app's path-alias setup.
const PAGE_REDIRECTS: Array<{ canonical: string; fr: string; en: string }> = [
  { canonical: 'about',       fr: 'a-propos',                  en: 'about' },
  { canonical: 'help',        fr: 'aide',                      en: 'help' },
  { canonical: 'faq',         fr: 'faq',                       en: 'faq' },
  { canonical: 'terms',       fr: 'conditions-utilisation',    en: 'terms' },
  { canonical: 'privacy',     fr: 'politique-confidentialite', en: 'privacy' },
  { canonical: 'how-to-buy',  fr: 'comment-acheter',           en: 'how-to-buy' },
  { canonical: 'how-to-sell', fr: 'comment-vendre',            en: 'how-to-sell' },
  { canonical: 'contact',     fr: 'contact',                   en: 'contact' },
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

  // 301 redirects for SEO continuity after the slug refactor:
  //   - /pages/<canonical>      → /<localized>          (FR canonical, no prefix)
  //   - /en/pages/<canonical>   → /en/<canonical>       (legacy /pages/ prefix on EN)
  //   - /<en-slug>              → /<fr-slug>            (FR locale typed an English slug)
  //   - /en/<fr-slug>           → /en/<en-slug>         (EN locale typed a French slug)
  // permanent: true → 301, which Google + crawlers preserve in the index.
  async redirects() {
    const out: Array<{ source: string; destination: string; permanent: boolean }> = [];

    for (const p of PAGE_REDIRECTS) {
      // Legacy /pages/<canonical> on FR (default, no prefix)
      out.push({
        source: `/pages/${p.canonical}`,
        destination: `/${p.fr}`,
        permanent: true,
      });
      // Legacy /en/pages/<canonical>
      out.push({
        source: `/en/pages/${p.canonical}`,
        destination: `/en/${p.en}`,
        permanent: true,
      });

      // Cross-locale typo handlers — only emit when slugs differ between locales.
      if (p.fr !== p.en) {
        // FR locale (no prefix) hit an English slug → redirect to French
        out.push({
          source: `/${p.en}`,
          destination: `/${p.fr}`,
          permanent: true,
        });
        // EN locale hit a French slug → redirect to English
        out.push({
          source: `/en/${p.fr}`,
          destination: `/en/${p.en}`,
          permanent: true,
        });
      }
    }

    return out;
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
export default withNextIntl(nextConfig);
