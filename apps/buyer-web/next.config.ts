import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

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
    ],
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
export default withNextIntl(nextConfig);
