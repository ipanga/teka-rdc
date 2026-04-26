import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/checkout/',
          '/cart/',
          '/orders/',
          '/messages/',
          '/login/',
          '/register/',
          '/profile/',
          '/wishlist/',
          '/*/checkout/',
          '/*/cart/',
          '/*/orders/',
          '/*/messages/',
          '/*/login/',
          '/*/register/',
          '/*/profile/',
          '/*/wishlist/',
          '/api/',
          '/_next/',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/checkout/',
          '/cart/',
          '/orders/',
          '/messages/',
          '/login/',
          '/register/',
          '/profile/',
          '/wishlist/',
        ],
      },
      // Social card scrapers — they fetch a single page to build link
      // previews. Without an explicit allowlist Facebook's debugger reports a
      // robots.txt block (even when the * block's `Allow: /` would technically
      // permit them), so list them by name.
      {
        userAgent: [
          'facebookexternalhit',
          'facebookcatalog',
          'Twitterbot',
          'LinkedInBot',
          'WhatsApp',
          'Slackbot',
          'Slackbot-LinkExpanding',
          'Discordbot',
          'TelegramBot',
        ],
        allow: '/',
      },
    ],
    sitemap: 'https://teka.cd/sitemap.xml',
    host: 'https://teka.cd',
  };
}
