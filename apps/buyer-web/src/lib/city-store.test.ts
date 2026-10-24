import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn((..._a: unknown[]) => Promise.resolve({ success: true, data: {} }));
vi.mock('./api-client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  ApiError: class extends Error {},
}));

import { useCityStore, type City } from './city-store';
import { useAuthStore, type User } from './auth-store';

const LUBUMBASHI: City = { id: 'c1', name: 'Lubumbashi', slug: 'lubumbashi', province: 'Haut-Katanga', isActive: true, sortOrder: 1 };
const KOLWEZI: City = { id: 'c2', name: 'Kolwezi', slug: 'kolwezi', province: 'Lualaba', isActive: true, sortOrder: 2 };

const cookie = (name: string) =>
  document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.split('=')[1] ?? null;

/** Every access to window.localStorage throws — the QA « blocked site data » case. */
function blockStorageEntirely(): () => void {
  const own = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('QA blocked', 'SecurityError');
    },
  });
  return () => {
    if (own) Object.defineProperty(window, 'localStorage', own);
    else delete (window as unknown as { localStorage?: Storage }).localStorage;
  };
}

beforeEach(() => {
  window.localStorage.clear();
  for (const c of ['teka_city', 'teka_city_prompted']) document.cookie = `${c}=; path=/; max-age=0`;
  useCityStore.setState({ selectedCity: null, cities: [], isLoading: false, showSelector: false });
  useAuthStore.setState({ user: null, isLoading: false });
  apiFetch.mockClear();
});

describe('city store — normal storage (behaviour unchanged)', () => {
  it('setCity persists to localStorage + cookie; initFromStorage restores it', () => {
    useCityStore.getState().setCity(LUBUMBASHI);
    expect(window.localStorage.getItem('teka_city_id')).toBe('c1');
    expect(JSON.parse(window.localStorage.getItem('teka_city')!)).toMatchObject({ id: 'c1', name: 'Lubumbashi' });
    expect(cookie('teka_city')).toBe('c1');

    useCityStore.setState({ selectedCity: null });
    useCityStore.getState().initFromStorage();
    expect(useCityStore.getState().selectedCity?.id).toBe('c1');
  });

  it('clearCity removes storage + cookie; stale/invalid stored data is discarded', () => {
    useCityStore.getState().setCity(LUBUMBASHI);
    useCityStore.getState().clearCity();
    expect(window.localStorage.getItem('teka_city')).toBeNull();
    expect(cookie('teka_city')).toBeNull();
    expect(useCityStore.getState().selectedCity).toBeNull();

    window.localStorage.setItem('teka_city', '{not json');
    useCityStore.getState().initFromStorage();
    expect(window.localStorage.getItem('teka_city')).toBeNull();

    window.localStorage.setItem('teka_city', JSON.stringify({ id: 'c1', name: { en: 'x', fr: 'y' } }));
    useCityStore.getState().initFromStorage();
    expect(useCityStore.getState().selectedCity).toBeNull();
    expect(window.localStorage.getItem('teka_city')).toBeNull();
  });

  it('profile hydration adopts the profile town only when nothing is selected locally', () => {
    useCityStore.getState().hydrateFromProfile(KOLWEZI);
    expect(useCityStore.getState().selectedCity?.id).toBe('c2');
    useCityStore.getState().hydrateFromProfile(LUBUMBASHI);
    expect(useCityStore.getState().selectedCity?.id).toBe('c2'); // device choice wins
    expect(apiFetch).not.toHaveBeenCalled(); // profile-driven: no PATCH back
  });
});

describe('city store — localStorage entirely blocked (window.localStorage throws)', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = blockStorageEntirely();
  });
  afterEach(() => restore());

  it('initFromStorage (homepage mount) does not throw and leaves no town selected', () => {
    expect(() => useCityStore.getState().initFromStorage()).not.toThrow();
    expect(useCityStore.getState().selectedCity).toBeNull();
  });

  it('setCity still selects in memory, writes the cookie and syncs a signed-in profile', () => {
    useAuthStore.setState({ user: { id: 'u1', role: 'BUYER' } as User });
    expect(() => useCityStore.getState().setCity(LUBUMBASHI)).not.toThrow();
    expect(useCityStore.getState().selectedCity?.id).toBe('c1');
    expect(useCityStore.getState().showSelector).toBe(false);
    expect(cookie('teka_city')).toBe('c1');
    expect(cookie('teka_city_prompted')).toBe('1');
    expect(apiFetch).toHaveBeenCalledWith('/v1/users/me/preferred-city', expect.objectContaining({ method: 'PATCH' }));
  });

  it('clearCity does not throw, deletes the cookie and clears the selection', () => {
    useCityStore.getState().setCity(LUBUMBASHI);
    expect(() => useCityStore.getState().clearCity()).not.toThrow();
    expect(useCityStore.getState().selectedCity).toBeNull();
    expect(cookie('teka_city')).toBeNull();
  });

  it('profile hydration still adopts the profile town (and the cookie) without storage', () => {
    expect(() => useCityStore.getState().hydrateFromProfile(KOLWEZI)).not.toThrow();
    expect(useCityStore.getState().selectedCity?.id).toBe('c2');
    expect(cookie('teka_city')).toBe('c2');
  });

  it('the first-visit gate keeps its cookie rule', () => {
    useCityStore.getState().maybePromptFirstVisit();
    expect(useCityStore.getState().showSelector).toBe(true);
    useCityStore.getState().closeSelector();
    useCityStore.getState().maybePromptFirstVisit();
    expect(cookie('teka_city_prompted')).toBe('1');
  });
});

describe('city store — individual storage calls throw', () => {
  afterEach(() => vi.restoreAllMocks());

  it('getItem throws → initFromStorage is a no-op', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('x', 'SecurityError'); });
    expect(() => useCityStore.getState().initFromStorage()).not.toThrow();
    expect(useCityStore.getState().selectedCity).toBeNull();
  });

  it('setItem throws (quota) → the town is still selected', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('x', 'QuotaExceededError'); });
    expect(() => useCityStore.getState().setCity(LUBUMBASHI)).not.toThrow();
    expect(useCityStore.getState().selectedCity?.id).toBe('c1');
    expect(cookie('teka_city')).toBe('c1');
  });

  it('removeItem throws while discarding invalid data → no crash', () => {
    window.localStorage.setItem('teka_city', '{not json');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('x', 'SecurityError'); });
    expect(() => useCityStore.getState().initFromStorage()).not.toThrow();
    expect(() => useCityStore.getState().clearCity()).not.toThrow();
  });
});
