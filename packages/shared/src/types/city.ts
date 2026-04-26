import type { Timestamps } from './common';

export interface City extends Timestamps {
  id: string;
  name: string;
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
