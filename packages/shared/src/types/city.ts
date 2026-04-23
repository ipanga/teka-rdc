import type { TranslatableText, Timestamps } from './common';

export interface City extends Timestamps {
  id: string;
  name: TranslatableText;
  province: string;
  isActive: boolean;
  sortOrder: number;
  communes?: Commune[];
}

export interface Commune extends Timestamps {
  id: string;
  cityId: string;
  name: TranslatableText;
  sortOrder: number;
}
