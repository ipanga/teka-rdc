import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/checkout/', '/cart/', '/orders/', '/messages/', '/login/', '/register/', '/profile/', '/wishlist/'],
      },
    ],
    sitemap: 'https://teka.cd/sitemap.xml',
  };
}
