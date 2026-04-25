import { create } from 'zustand';
import { apiFetch } from './api-client';

interface TranslatableText {
  fr: string;
  en?: string;
}

export interface City {
  id: string;
  name: string;
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
        const city = JSON.parse(stored) as City;
        set({ selectedCity: city });
      } catch {
        // Invalid JSON, clear it
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_CITY_KEY);
      }
    }
  },
}));
