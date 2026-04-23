import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// See admin-web/next.config.ts for the basePath rationale.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/seller';

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: basePath || undefined,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
export default withNextIntl(nextConfig);
