'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  canonicalToUrlSlug,
  type CanonicalSlug,
} from '@/lib/static-pages';
import { useCityStore } from '@/lib/city-store';
import { cityHref } from '@/lib/urls';

// Static pages in the order rendered in the footer.
const FOOTER_LINKS: Array<{ canonical: CanonicalSlug; label: string }> = [
  { canonical: 'about',       label: 'À propos' },
  { canonical: 'help',        label: 'Aide' },
  { canonical: 'faq',         label: 'FAQ' },
  { canonical: 'terms',       label: "Conditions d'utilisation" },
  { canonical: 'privacy',     label: 'Politique de confidentialité' },
  { canonical: 'how-to-buy',  label: 'Comment acheter' },
  { canonical: 'how-to-sell', label: 'Comment vendre' },
  { canonical: 'contact',     label: 'Contact' },
];

export function Footer() {
  const year = new Date().getFullYear();

  // Crawlable /{ville} internal links (moved here from the homepage in the Town
  // Architecture Refactor). Rendered site-wide so search engines discover every
  // town landing page; the sitemap covers them too.
  const { cities, fetchCities } = useCityStore();
  useEffect(() => {
    fetchCities();
  }, [fetchCities]);
  const townLinks = cities.filter((c) => c.isActive && c.slug);

  return (
    <footer className="bg-foreground text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {townLinks.length > 0 && (
          <div className="mb-6 pb-6 border-b border-white/10">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">
              {"Achetez dans votre ville"}
            </h2>
            <nav className="flex flex-wrap gap-2">
              {townLinks.map((c) => (
                <Link
                  key={c.id}
                  href={cityHref(c.slug as string)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white/80 transition-colors hover:border-white/40 hover:text-white"
                >
                  <span aria-hidden>{'📍'}</span>
                  {c.name}
                </Link>
              ))}
            </nav>
          </div>
        )}
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
            {FOOTER_LINKS.map(({ canonical, label }) => (
              <Link
                key={canonical}
                href={`/${canonicalToUrlSlug(canonical)}`}
                className="hover:text-white transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-6 pt-4 border-t border-white/10 text-center text-sm text-white/50">
          {`© ${year} Teka RDC. Tous droits réservés.`}
        </div>
      </div>
    </footer>
  );
}
