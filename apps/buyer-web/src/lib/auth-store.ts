import { create } from 'zustand';
import { apiFetch } from './api-client';

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
    } catch {
      set({ user: null, isLoading: false });
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
