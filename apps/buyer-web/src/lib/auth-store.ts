import { create } from 'zustand';
import { apiFetch, ApiError } from './api-client';
import type { City } from './city-store';

export interface User {
  id: string;
  // Nullable since the 2026-05-12 email-auth refactor: buyers registered via
  // email no longer have a phone on file until they add one in their profile.
  phone: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  status: string;
  avatar?: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  // Preferred delivery town (Town Architecture Refactor). preferredCity is the
  // resolved row from /me; lets the buyer apps hydrate the town on login.
  preferredCityId?: string | null;
  preferredCity?: City | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  fetchUser: async () => {
    // Always call /me on AuthProvider mount. apiFetch transparently
    // auto-refreshes on 401 (via /v1/auth/refresh), so a successful /me
    // here means the session is healthy. A failure means the user is
    // genuinely logged out (refresh token also dead or never present).
    //
    // The previous PR #80 short-circuit (skip /me when the
    // `teka_session=1` hint cookie was missing) was a perf win for
    // guests but locked out users whose sessions predated that PR — they
    // had valid tokens but no hint cookie, so the short-circuit set them
    // to user=null and they appeared logged out. The 1-round-trip cost
    // for guest cold loads is acceptable; /me returns ~200 bytes. Guests
    // pay one 401 console line per cold load (same as pre-PR#80); the
    // priority is correctness over silencing that noise.
    try {
      const res = await apiFetch<User>('/v1/auth/me');
      set({ user: res.data, isLoading: false });
    } catch (err) {
      // Only a genuine 401 (auth failed even after the api-client's own
      // refresh attempt) means "logged out" → null the user. A transient
      // network error or a 5xx must NOT null an existing session. Network
      // errors aren't ApiErrors (status 0) and 5xx carry their own status,
      // so both are preserved.
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401) {
        set({ user: null, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    }
  },
  logout: async () => {
    try {
      await apiFetch('/v1/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    set({ user: null });
  },
}));
