/**
 * Town accent colors. Subtle, NOT per-city themes — the global brand (logo,
 * layout, primary red) stays identical everywhere; cities only get a small
 * accent on the city badge / chips / delivery banner so a buyer instantly knows
 * which city they're browsing.
 *
 * Data-driven (Town Architecture Refactor): the accent + hero come from the
 * city record (`City.accentColor` / `City.heroImageUrl`), NOT from a hardcoded
 * slug switch — so future towns are configurable from data alone. `accentColor`
 * is an accent KEY ('copper' | 'cobalt' | 'default'); the class strings stay
 * literal here so Tailwind's scanner generates the utilities. A town with no
 * accent set falls back to the brand-red accent + the default hero image.
 *
 * Tokens live in `app/globals.css` (`--color-accent-*`).
 */
export type CityAccent = 'copper' | 'cobalt' | 'default';

/** Town-record shape this module reads. Kept structural so any City-like object works. */
interface CityLike {
  accentColor?: string | null;
  heroImageUrl?: string | null;
}

const DEFAULT_HERO = '/hero/lubumbashi.webp';

export function resolveAccent(city?: CityLike | null): CityAccent {
  const key = city?.accentColor;
  return key === 'copper' || key === 'cobalt' ? key : 'default';
}

interface AccentClasses {
  /** filled pill/badge (subtle bg + accent text + border) */
  badge: string;
  /** outlined chip with accent hover */
  chip: string;
  /** small solid dot / indicator */
  dot: string;
  /** accent text only */
  text: string;
  /** soft accent surface (e.g. delivery banner background) */
  surface: string;
}

const ACCENT_CLASSES: Record<CityAccent, AccentClasses> = {
  copper: {
    badge:
      'bg-accent-copper-subtle text-accent-copper border border-accent-copper/30',
    chip: 'border border-accent-copper/40 text-accent-copper hover:bg-accent-copper-subtle',
    dot: 'bg-accent-copper',
    text: 'text-accent-copper',
    surface: 'bg-accent-copper-subtle text-accent-copper',
  },
  cobalt: {
    badge:
      'bg-accent-cobalt-subtle text-accent-cobalt border border-accent-cobalt/30',
    chip: 'border border-accent-cobalt/40 text-accent-cobalt hover:bg-accent-cobalt-subtle',
    dot: 'bg-accent-cobalt',
    text: 'text-accent-cobalt',
    surface: 'bg-accent-cobalt-subtle text-accent-cobalt',
  },
  default: {
    badge: 'bg-primary-subtle text-primary border border-primary/20',
    chip: 'border border-primary/30 text-primary hover:bg-primary-subtle',
    dot: 'bg-primary',
    text: 'text-primary',
    surface: 'bg-primary-subtle text-primary',
  },
};

export function cityAccentClasses(city?: CityLike | null): AccentClasses {
  return ACCENT_CLASSES[resolveAccent(city)];
}

/**
 * City homepage hero background image. Driven by `City.heroImageUrl` (data); a
 * town with none set falls back to a generic "Teka supermarket" default.
 */
export function heroImageForCity(city?: CityLike | null): string {
  return city?.heroImageUrl || DEFAULT_HERO;
}
