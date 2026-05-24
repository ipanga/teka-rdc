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
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// See apps/buyer-web/next.config.ts for the withSentryConfig rationale.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: 'teka-rdc',
  project: 'teka-seller-web',
  silent: !process.env.CI,
  disableLogger: true,
});
