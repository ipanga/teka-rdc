import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  localePrefix: 'as-needed',
  // Always serve French to first-time visitors regardless of browser
  // Accept-Language. Users opt into English via the language switcher
  // (which sets the NEXT_LOCALE cookie that next-intl honors on subsequent
  // requests). French is the target-market language; English is secondary.
  localeDetection: false,
});
