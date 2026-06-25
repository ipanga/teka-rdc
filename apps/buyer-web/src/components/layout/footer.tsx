'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  canonicalToUrlSlug,
  type CanonicalSlug,
} from '@/lib/static-pages';
import { useCityStore } from '@/lib/city-store';
import { cityHref } from '@/lib/urls';

// Social profiles — same handle ("tekardc") across every network.
const SOCIALS: Array<{ label: string; href: string; path: string }> = [
  {
    label: 'Facebook',
    href: 'https://facebook.com/tekardc',
    path: 'M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z',
  },
  {
    label: 'Instagram',
    href: 'https://instagram.com/tekardc',
    path: 'M12 2.2c3.2 0 3.58 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 01-1.38-.9 3.7 3.7 0 01-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.2 15.58 2.2 15.2 2.2 12s0-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.2 8.8 2.2 12 2.2zm0 3.18A6.62 6.62 0 1018.62 12 6.62 6.62 0 0012 5.38zm0 10.92A4.3 4.3 0 1116.3 12 4.3 4.3 0 0112 16.3zm6.88-11.16a1.55 1.55 0 11-1.55-1.55 1.55 1.55 0 011.55 1.55z',
  },
  {
    label: 'TikTok',
    href: 'https://tiktok.com/@tekardc',
    path: 'M16.6 5.82a4.28 4.28 0 01-1.06-2.82h-3.1v12.4a2.52 2.52 0 11-2.52-2.52c.26 0 .51.04.75.12V9.8a5.6 5.6 0 00-.75-.05 5.6 5.6 0 105.6 5.6V9.01a7.3 7.3 0 004.27 1.37V7.28a4.28 4.28 0 01-3.19-1.46z',
  },
  {
    label: 'X',
    href: 'https://x.com/tekardc',
    path: 'M17.53 3H20.5l-6.48 7.4L21.75 21h-5.96l-4.67-6.1L5.77 21H2.8l6.93-7.92L2.25 3h6.11l4.22 5.58L17.53 3zm-1.04 16.2h1.65L7.6 4.7H5.83l10.66 14.5z',
  },
  {
    label: 'YouTube',
    href: 'https://youtube.com/@tekardc',
    path: 'M23 12s0-3.2-.41-4.74a2.5 2.5 0 00-1.76-1.77C19.29 5.08 12 5.08 12 5.08s-7.29 0-8.83.41a2.5 2.5 0 00-1.76 1.77C1 8.8 1 12 1 12s0 3.2.41 4.74a2.5 2.5 0 001.76 1.77c1.54.41 8.83.41 8.83.41s7.29 0 8.83-.41a2.5 2.5 0 001.76-1.77C23 15.2 23 12 23 12zm-13.4 3.27V8.73L15.18 12 9.6 15.27z',
  },
];

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
        {/* Social profiles + Android app download */}
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Teka RDC sur ${s.label}`}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              >
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d={s.path} />
                </svg>
              </a>
            ))}
          </div>
          <a
            href="https://play.google.com/store/apps/details?id=com.tootiye.teka"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 rounded-lg border border-white/20 px-4 py-2 transition-colors hover:border-white/50 hover:bg-white/5"
          >
            <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M3.6 2.3a1 1 0 00-.6.92v17.56a1 1 0 00.6.92l9.4-9.7L3.6 2.3zm10.8 7.9l2.55-2.63-9.9-5.6 7.35 8.23zm0 3.6l-7.35 8.23 9.9-5.6-2.55-2.63zm1.4-1.45l2.94-3.03 2.26 1.28a1 1 0 010 1.74l-2.26 1.28-2.94-3.27z" />
            </svg>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[10px] text-white/60">{"Disponible sur"}</span>
              <span className="text-sm font-semibold text-white">{"Google Play"}</span>
            </span>
          </a>
        </div>
        <div className="mt-6 pt-4 border-t border-white/10 text-center text-sm text-white/50">
          {`© ${year} Teka RDC. Tous droits réservés.`}
        </div>
      </div>
    </footer>
  );
}
