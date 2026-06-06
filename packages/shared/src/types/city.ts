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
  communes?: Commune[];
}

export interface Commune extends Timestamps {
  id: string;
  cityId: string;
  name: string;
  sortOrder: number;
}
