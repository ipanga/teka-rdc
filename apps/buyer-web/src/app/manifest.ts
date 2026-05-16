import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Teka RDC — Marketplace en ligne',
    short_name: 'Teka',
    description: 'Achetez en ligne en RD Congo',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#BF0000',
    lang: 'fr',
    categories: ['shopping', 'business'],
    // SVG wordmark used for all icon sizes. The previous `/icons/icon-*.png`
    // PNG variants did not exist in `public/` and caused a manifest 404 +
    // console warning on every page load. SVG icons render crisply at any
    // DPI and are supported by all modern PWA targets.
    icons: [
      { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
