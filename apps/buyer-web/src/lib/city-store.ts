import { create } from 'zustand';
import { apiFetch } from './api-client';

export interface City {
  id: string;
  name: string;
  // URL `{ville}` segment (e.g. "lubumbashi"). Returned by GET /v1/cities.
  // Optional for resilience against legacy cached city objects.
  slug?: string | null;
  province: string;
  isActive: boolean;
  sortOrder: number;
}

interface CityState {
  selectedCity: City | null;
  cities: City[];
  isLoading: boolean;
  showSelector: boolean;
  setCity: (city: City) => void;
  clearCity: () => void;
  fetchCities: () => Promise<void>;
  openSelector: () => void;
  closeSelector: () => void;
  initFromStorage: () => void;
}

const STORAGE_KEY = 'teka_city_id';
const STORAGE_CITY_KEY = 'teka_city';

export const useCityStore = create<CityState>((set, get) => ({
  selectedCity: null,
  cities: [],
  isLoading: false,
  showSelector: false,

  setCity: (city) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, city.id);
      localStorage.setItem(STORAGE_CITY_KEY, JSON.stringify(city));
    }
    set({ selectedCity: city, showSelector: false });
  },

  clearCity: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_CITY_KEY);
    }
    set({ selectedCity: null });
  },

  fetchCities: async () => {
    // Short-circuit when the list is already loaded. Both city-selector-modal
    // and home-page call fetchCities() on mount, so on a cold load we used
    // to make two identical GET /v1/cities requests. Idempotent: subsequent
    // calls become a no-op until the page is reloaded.
    const { cities, isLoading } = get();
    if (cities.length > 0 || isLoading) return;
    set({ isLoading: true });
    try {
      const res = await apiFetch<City[]>('/v1/cities');
      set({ cities: res.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  openSelector: () => set({ showSelector: true }),
  closeSelector: () => set({ showSelector: false }),

  initFromStorage: () => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_CITY_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as unknown;
        // Guard against stale data from before the May 2026 monolingual
        // refactor — back then `city.name` was a `{en, fr}` Map, which still
        // lives in some users' localStorage and would crash the home page's
        // next-intl interpolation (`t('subtitle', { city: city.name })`)
        // with a React #31 + INVALID_MESSAGE error. Discard anything that
        // doesn't match the current plain-string shape.
        const isCurrentShape =
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof (parsed as { id?: unknown }).id === 'string' &&
          typeof (parsed as { name?: unknown }).name === 'string';
        if (isCurrentShape) {
          set({ selectedCity: parsed as City });
        } else {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(STORAGE_CITY_KEY);
        }
      } catch {
        // Invalid JSON, clear it
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_CITY_KEY);
      }
    }
  },
}));
