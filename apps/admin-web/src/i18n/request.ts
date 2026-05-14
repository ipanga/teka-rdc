import { getRequestConfig } from 'next-intl/server';

// Monolingual: there is no locale routing, no `[locale]` segment, no
// language switcher. `next-intl` is kept solely as a French-only string
// loader for `messages/fr.json`.
export default getRequestConfig(async () => ({
  locale: 'fr',
  messages: (await import('../../messages/fr.json')).default,
}));
