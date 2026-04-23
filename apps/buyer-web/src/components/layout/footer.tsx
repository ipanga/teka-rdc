'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export function Footer() {
  const t = useTranslations('Footer');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-foreground text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-lg font-bold text-primary">Teka</div>
          <nav className="flex flex-wrap justify-center gap-4 text-sm text-white/70">
            <Link href="/pages/about" className="hover:text-white transition-colors">
              {t('about')}
            </Link>
            <Link href="/pages/help" className="hover:text-white transition-colors">
              {t('help')}
            </Link>
            <Link href="/pages/faq" className="hover:text-white transition-colors">
              {t('faq')}
            </Link>
            <Link href="/pages/terms" className="hover:text-white transition-colors">
              {t('terms')}
            </Link>
            <Link href="/pages/privacy" className="hover:text-white transition-colors">
              {t('privacy')}
            </Link>
            <Link href="/pages/how-to-buy" className="hover:text-white transition-colors">
              {t('howToBuy')}
            </Link>
            <Link href="/pages/how-to-sell" className="hover:text-white transition-colors">
              {t('howToSell')}
            </Link>
            <Link href="/pages/contact" className="hover:text-white transition-colors">
              {t('contact')}
            </Link>
          </nav>
        </div>
        <div className="mt-6 pt-4 border-t border-white/10 text-center text-sm text-white/50">
          {t('copyright', { year: String(year) })}
        </div>
      </div>
    </footer>
  );
}
