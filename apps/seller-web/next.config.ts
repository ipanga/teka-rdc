import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// See admin-web/next.config.ts for the basePath rationale.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/seller';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Required in pnpm workspaces — see buyer-web/next.config.ts for details.
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  transpilePackages: ['@teka/shared'],
  basePath: basePath || undefined,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },

  // PostHog reverse proxy — same as buyer-web. The browser talks to the
  // seller-web origin /ingest/* (same origin) so ad-blockers on DRC networks
  // don't drop analytics; Next forwards to PostHog US Cloud. posthog-js is
  // configured with api_host:'/ingest'. In production NEXT_PUBLIC_BASE_PATH is
  // empty (deploy.yml) so /ingest sits at the seller.teka.cd root, identical to
  // buyer-web. skipTrailingSlashRedirect is required for PostHog's API paths.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
      { source: '/ingest/flags', destination: 'https://us.i.posthog.com/flags' },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// See apps/buyer-web/next.config.ts for the withSentryConfig rationale.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: 'teka-rdc',
  project: 'teka-seller-web',
  silent: !process.env.CI,
  disableLogger: true,
});
