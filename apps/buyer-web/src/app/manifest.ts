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
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
