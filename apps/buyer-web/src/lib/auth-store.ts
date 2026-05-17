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
  locale: string;
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
    // The access/refresh tokens are HttpOnly, so JS can't see them. The API
    // sets a non-HttpOnly companion `teka_session=1` cookie alongside login
    // — read it here to skip the /v1/auth/me round-trip when the user is
    // clearly logged out. Eliminates the 401 console noise on every guest
    // page load and saves a request on slow 2G/3G connections.
    if (typeof document !== 'undefined') {
      const hasSession = document.cookie
        .split(';')
        .map((c) => c.trim())
        .some((c) => c.startsWith('teka_session=') && c !== 'teka_session=');
      if (!hasSession) {
        set({ user: null, isLoading: false });
        return;
      }
    }
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
