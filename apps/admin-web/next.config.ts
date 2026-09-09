import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';
import { portalSecurityHeaders } from './src/lib/security-headers';

// Prod-on-subdomain sets NEXT_PUBLIC_BASE_PATH='' so admin.teka.cd serves from
// the root; local dev keeps the /admin path prefix so all three Next.js apps
// can coexist under a single docker-compose NGINX.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/admin';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
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
  // admin-web origin /ingest/* (same origin) so ad-blockers don't drop
  // analytics; Next forwards to PostHog US Cloud. posthog-js is configured
  // with api_host:'/ingest'. In production NEXT_PUBLIC_BASE_PATH is empty
  // (deploy.yml) so /ingest sits at the admin.teka.cd root, identical to
  // buyer-web. skipTrailingSlashRedirect is required for PostHog's API paths.
  skipTrailingSlashRedirect: true,
  // D4 (2026-09-06): non-CSP security headers on every response (the CSP is
  // per-request, see src/middleware.ts + src/lib/security-headers.ts).
  async headers() {
    return [{ source: '/:path*', headers: portalSecurityHeaders() }];
  },
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
      { source: '/ingest/flags', destination: 'https://us.i.posthog.com/flags' },
    ];
  },

  async redirects() {
    return [
      // /dashboard/users was the mixed buyers+sellers+admins list. Replaced
      // by the role-scoped trio Acheteurs / Vendeurs / Administrateurs.
      // Redirect any bookmarks to Acheteurs (the most common admin task).
      { source: '/dashboard/users', destination: '/dashboard/buyers', permanent: true },
    ];
  },
};

// See apps/buyer-web/next.config.ts for the withSentryConfig rationale.
export default withSentryConfig(nextConfig, {
  org: 'teka-rdc',
  project: 'teka-admin-web',
  silent: !process.env.CI,
  disableLogger: true,
});
