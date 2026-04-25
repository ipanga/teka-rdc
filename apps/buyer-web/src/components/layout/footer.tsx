'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  canonicalToUrlSlug,
  type CanonicalSlug,
} from '@/lib/static-pages';

// Static pages in the order rendered in the footer.
const FOOTER_LINKS: Array<{ canonical: CanonicalSlug; key: string }> = [
  { canonical: 'about',       key: 'about' },
  { canonical: 'help',        key: 'help' },
  { canonical: 'faq',         key: 'faq' },
  { canonical: 'terms',       key: 'terms' },
  { canonical: 'privacy',     key: 'privacy' },
  { canonical: 'how-to-buy',  key: 'howToBuy' },
  { canonical: 'how-to-sell', key: 'howToSell' },
  { canonical: 'contact',     key: 'contact' },
];

export function Footer() {
  const t = useTranslations('Footer');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-foreground text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-white.svg"
            alt="Teka RDC"
            className="h-7 w-auto"
            width={140}
            height={28}
          />
          <nav className="flex flex-wrap justify-center gap-4 text-sm text-white/70">
            {FOOTER_LINKS.map(({ canonical, key }) => (
              <Link
                key={canonical}
                href={`/${canonicalToUrlSlug(canonical)}`}
                className="hover:text-white transition-colors"
              >
                {t(key)}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-6 pt-4 border-t border-white/10 text-center text-sm text-white/50">
          {t('copyright', { year: String(year) })}
        </div>
      </div>
    </footer>
  );
}
