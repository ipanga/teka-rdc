'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Container, buttonVariants } from '@/components/ui';
import { cityAccentClasses, heroImageForCity } from '@/lib/city-accent';

/** Town-record shape the hero reads for its image + accent. Structural so any
 *  City-like object works (the homepage's selected city or a landing page's). */
interface HeroCity {
  name: string;
  slug?: string | null;
  accentColor?: string | null;
  heroImageUrl?: string | null;
}

interface StoreHeroProps {
  /** H1 — page-specific copy (e.g. "Achetez en ligne à Lubumbashi"). */
  title: string;
  subtitle: string;
  ctaHref: string;
  ctaLabel: string;
  /** Active town — drives the hero image + accent + (optional) badge. */
  city?: HeroCity | null;
  /** Town pill above the title (e.g. "Livraison à Lubumbashi"); hidden when absent. */
  badgeLabel?: string;
}

/**
 * The storefront hero — single source of truth for the homepage AND the city
 * landing pages (`/{ville}`). Full-bleed town image + accent location badge +
 * H1 + subtitle + CTA, with a trust strip below. Copy is supplied by each page;
 * the image/accent come from the (data-driven) city record, so a new town gets
 * the same premium hero with no code change.
 */
export function StoreHero({
  title,
  subtitle,
  ctaHref,
  ctaLabel,
  city,
  badgeLabel,
}: StoreHeroProps) {
  const t = useTranslations('Hero');
  const accent = cityAccentClasses(city);
  const heroImage = heroImageForCity(city);

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="relative h-[320px] sm:h-[380px] md:h-[460px]">
        {/* Town hero image — LCP element → priority. */}
        <Image
          src={heroImage}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* Legibility scrim — darkest on the left where the copy sits. */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/15" />
        <Container className="relative h-full flex flex-col justify-center">
          <div className="max-w-xl text-white">
            {badgeLabel && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-4 ${accent.badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                {badgeLabel}
              </span>
            )}
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3 drop-shadow-sm">
              {title}
            </h1>
            <p className="text-base md:text-lg text-white/90 mb-6 max-w-md">
              {subtitle}
            </p>
            <Link
              href={ctaHref}
              className={buttonVariants({ variant: 'default', size: 'lg' })}
            >
              {ctaLabel}
            </Link>
          </div>
        </Container>
      </div>

      {/* Trust signals — light band below the image (fast local delivery, COD,
          verified sellers). */}
      <Container className="py-3 md:py-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              label: t('trustDelivery'),
              icon: (
                <path d="M3 7h11v8H3V7zm11 2h3l3 3v3h-2m-9 0H8m9 0a2 2 0 11-4 0 2 2 0 014 0zm-9 0a2 2 0 11-4 0 2 2 0 014 0z" />
              ),
            },
            {
              label: t('trustCod'),
              icon: (
                <>
                  <rect x="2.5" y="6" width="19" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2.5" />
                </>
              ),
            },
            {
              label: t('trustSellers'),
              icon: (
                <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zm-1 11l4-4-1.4-1.4L11 11.2 9.4 9.6 8 11l3 3z" />
              ),
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-subtle text-primary shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                  aria-hidden
                >
                  {item.icon}
                </svg>
              </span>
              <span className="text-sm font-medium text-foreground">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
