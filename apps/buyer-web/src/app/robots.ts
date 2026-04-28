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
      // Social card scrapers — one block per UA. Sharing one Allow across
      // multiple `User-Agent:` lines is valid RFC 9309 but Facebook's parser
      // doesn't handle it reliably and still reports "robots.txt block".
      { userAgent: 'facebookexternalhit', allow: '/' },
      { userAgent: 'facebookcatalog', allow: '/' },
      { userAgent: 'Twitterbot', allow: '/' },
      { userAgent: 'LinkedInBot', allow: '/' },
      { userAgent: 'WhatsApp', allow: '/' },
      { userAgent: 'Slackbot', allow: '/' },
      { userAgent: 'Slackbot-LinkExpanding', allow: '/' },
      { userAgent: 'Discordbot', allow: '/' },
      { userAgent: 'TelegramBot', allow: '/' },
    ],
    sitemap: 'https://teka.cd/sitemap.xml',
    host: 'https://teka.cd',
  };
}
