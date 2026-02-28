'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale() {
    const newLocale = locale === 'fr' ? 'en' : 'fr';
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <button
      onClick={switchLocale}
      className="text-sm font-medium px-3 py-1 rounded border border-border hover:bg-muted transition-colors"
    >
      {locale === 'fr' ? 'EN' : 'FR'}
    </button>
  );
}
