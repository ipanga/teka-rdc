import { create } from 'zustand';
import { apiFetch, ApiError } from './api-client';

export interface User {
  id: string;
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
