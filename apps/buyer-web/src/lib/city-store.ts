import { create } from 'zustand';
import { apiFetch } from './api-client';
import { useAuthStore } from './auth-store';

export interface City {
  id: string;
  name: string;
  // URL `{ville}` segment (e.g. "lubumbashi"). Returned by GET /v1/cities.
  // Optional for resilience against legacy cached city objects.
  slug?: string | null;
  province: string;
  isActive: boolean;
  sortOrder: number;
  // Data-driven town identity (Town Architecture Refactor) so future towns are
  // config-only — no hardcoded slug switches. accentColor: accent key
  // ('copper' | 'cobalt' | …) for the town badge/chips; heroImageUrl: town hero
  // image. Both optional → brand-red accent + default hero when absent.
  accentColor?: string | null;
  heroImageUrl?: string | null;
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
  /**
   * Adopt the town saved on the user's profile (preferredCity) after login,
   * but only when the visitor has no local selection — the device choice wins
   * for the session. Lets the chosen town follow the user across devices.
   */
  hydrateFromProfile: (city: City | null) => void;
  /**
   * First-visit gate (decision D1). Opens the selector ONCE when the visitor
   * has no town and hasn't been prompted before (cookie-gated). Called from the
   * homepage AFTER content has rendered, so it's a client overlay over fully
   * server-rendered content — SEO-safe, never a content gate.
   */
  maybePromptFirstVisit: () => void;
}

const STORAGE_KEY = 'teka_city_id';
const STORAGE_CITY_KEY = 'teka_city';
// Non-HttpOnly cookie holding the selected town id so the server/SSR layer can
// read the town (decision D1: persist to Cookie + LocalStorage + profile).
const COOKIE_CITY = 'teka_city';
// Set once the visitor has seen/acted on the first-visit selector, so we never
// auto-open it again.
const COOKIE_PROMPTED = 'teka_city_prompted';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function setCookie(name: string, value: string, maxAge: number) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1)) || null;
}

/** Persist the selected town to the user profile when authenticated. */
function persistTownToProfile(cityId: string | null) {
  if (!useAuthStore.getState().user) return; // guests: cookie + localStorage only
  // Fire-and-forget: a failed sync must never block town selection. The cookie
  // + localStorage already hold the choice; the next /me reconciles.
  void apiFetch('/v1/users/me/preferred-city', {
    method: 'PATCH',
    body: JSON.stringify({ cityId }),
  }).catch(() => {});
}

export const useCityStore = create<CityState>((set, get) => {
  // Shared apply path. `persistProfile` is false for profile-driven hydration
  // (the value already came from the server — no need to PATCH it back).
  const applyCity = (city: City, persistProfile: boolean) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, city.id);
      localStorage.setItem(STORAGE_CITY_KEY, JSON.stringify(city));
      setCookie(COOKIE_CITY, city.id, COOKIE_MAX_AGE);
      // Choosing a town counts as being prompted.
      setCookie(COOKIE_PROMPTED, '1', COOKIE_MAX_AGE);
    }
    if (persistProfile) persistTownToProfile(city.id);
    set({ selectedCity: city, showSelector: false });
  };

  return {
    selectedCity: null,
    cities: [],
    isLoading: false,
    showSelector: false,

    setCity: (city) => applyCity(city, true),

    clearCity: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_CITY_KEY);
        deleteCookie(COOKIE_CITY);
      }
      persistTownToProfile(null);
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
    closeSelector: () => {
      // Dismissing the selector still counts as "prompted" so the first-visit
      // gate doesn't re-open it on the next navigation.
      setCookie(COOKIE_PROMPTED, '1', COOKIE_MAX_AGE);
      set({ showSelector: false });
    },

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
            const city = parsed as City;
            // Keep the cookie in lockstep with a localStorage-restored town so
            // the SSR layer sees the same selection.
            setCookie(COOKIE_CITY, city.id, COOKIE_MAX_AGE);
            set({ selectedCity: city });
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

    hydrateFromProfile: (city) => {
      if (!city) return;
      // Device choice wins for the session — only adopt the profile town when
      // nothing is selected locally.
      if (get().selectedCity) return;
      applyCity(city, false);
    },

    maybePromptFirstVisit: () => {
      if (typeof window === 'undefined') return;
      if (get().selectedCity) return;
      if (getCookie(COOKIE_PROMPTED) === '1') return;
      set({ showSelector: true });
    },
  };
});
