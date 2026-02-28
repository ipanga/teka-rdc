import { create } from 'zustand';
import { apiFetch } from './api-client';

export interface User {
  id: string;
  phone: string;
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
