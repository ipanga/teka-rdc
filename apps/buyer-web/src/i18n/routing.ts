import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // Monolingual (FR only). The `[locale]` route segment is kept on disk to
  // avoid moving every page file; with `localePrefix: 'never'` and a single
  // locale, the segment is effectively constant 'fr' and URLs have no prefix.
  locales: ['fr'],
  defaultLocale: 'fr',
  localePrefix: 'never',
  localeDetection: false,
});
