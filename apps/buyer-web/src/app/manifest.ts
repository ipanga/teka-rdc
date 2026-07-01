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
    // App icon = the teka "T" glyph (white) on brand red — the same mark used
    // for the mobile launcher icon and browser favicon. Full-bleed + centered
    // so it doubles as a maskable icon (safe zone respected) for Android
    // home-screen installs, where the previous wordmark was letterboxed. SVG
    // renders crisply at any DPI and is supported by all modern PWA targets.
    icons: [
      { src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
