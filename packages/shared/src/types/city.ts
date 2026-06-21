import type { Timestamps } from './common';

export interface City extends Timestamps {
  id: string;
  name: string;
  // URL `{ville}` segment, e.g. "lubumbashi" (city-first URL refactor).
  // Nullable on legacy rows pending backfill.
  slug?: string | null;
  province: string;
  isActive: boolean;
  sortOrder: number;
  // Data-driven town identity (Town Architecture Refactor) so future towns are
  // config-only. accentColor: accent key ('copper' | 'cobalt' | hex) for the
  // town badge/chips; heroImageUrl: town hero/landing image URL. Both null on
  // towns that haven't set them (-> brand-red accent + default hero).
  accentColor?: string | null;
  heroImageUrl?: string | null;
  communes?: Commune[];
}

export interface Commune extends Timestamps {
  id: string;
  cityId: string;
  name: string;
  sortOrder: number;
}
