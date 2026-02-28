import { create } from 'zustand';
import { apiFetch } from './api-client';
import type { Cart, CartItem, GuestCartItem } from './types';

const GUEST_CART_KEY = 'teka_guest_cart';

// ========================
// localStorage helpers
// ========================

function getGuestCart(): GuestCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function saveGuestCart(items: GuestCartItem[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify({ items }));
}

function clearGuestCartStorage() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GUEST_CART_KEY);
}

// ========================
// Store
// ========================

interface CartState {
  items: CartItem[];
  isLoading: boolean;
  totalItems: number;
  isAuthenticated: boolean;

  setAuthenticated: (auth: boolean) => void;
  fetchCart: () => Promise<void>;
  addItem: (productId: string, quantity: number) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  mergeGuestCart: () => Promise<void>;

  // Guest cart helpers
  loadGuestCart: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  isLoading: false,
  totalItems: 0,
  isAuthenticated: false,

  setAuthenticated: (auth: boolean) => set({ isAuthenticated: auth }),

  fetchCart: async () => {
    const { isAuthenticated } = get();

    if (!isAuthenticated) {
      // Load guest cart from localStorage
      get().loadGuestCart();
      return;
    }

    set({ isLoading: true });
    try {
      const res = await apiFetch<Cart>('/v1/cart');
      set({
        items: res.data.items,
        totalItems: res.data.totalItems,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  addItem: async (productId: string, quantity: number) => {
    const { isAuthenticated } = get();

    if (!isAuthenticated) {
      // Guest: add to localStorage
      const guestItems = getGuestCart();
      const existing = guestItems.find((i) => i.productId === productId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        guestItems.push({ productId, quantity });
      }
      saveGuestCart(guestItems);
      set({ totalItems: guestItems.reduce((sum, i) => sum + i.quantity, 0) });
      return;
    }

    try {
      await apiFetch('/v1/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId, quantity }),
      });
      await get().fetchCart();
    } catch {
      // silently fail
    }
  },

  updateQuantity: async (productId: string, quantity: number) => {
    const { isAuthenticated } = get();

    if (!isAuthenticated) {
      const guestItems = getGuestCart();
      const item = guestItems.find((i) => i.productId === productId);
      if (item) {
        item.quantity = quantity;
        saveGuestCart(guestItems);
        set({ totalItems: guestItems.reduce((sum, i) => sum + i.quantity, 0) });
      }
      return;
    }

    try {
      await apiFetch(`/v1/cart/items/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      });
      await get().fetchCart();
    } catch {
      // silently fail
    }
  },

  removeItem: async (productId: string) => {
    const { isAuthenticated } = get();

    if (!isAuthenticated) {
      let guestItems = getGuestCart();
      guestItems = guestItems.filter((i) => i.productId !== productId);
      saveGuestCart(guestItems);
      set({ totalItems: guestItems.reduce((sum, i) => sum + i.quantity, 0) });
      return;
    }

    try {
      await apiFetch(`/v1/cart/items/${productId}`, {
        method: 'DELETE',
      });
      await get().fetchCart();
    } catch {
      // silently fail
    }
  },

  clearCart: async () => {
    const { isAuthenticated } = get();

    if (!isAuthenticated) {
      clearGuestCartStorage();
      set({ items: [], totalItems: 0 });
      return;
    }

    try {
      await apiFetch('/v1/cart', { method: 'DELETE' });
      set({ items: [], totalItems: 0 });
    } catch {
      // silently fail
    }
  },

  mergeGuestCart: async () => {
    const guestItems = getGuestCart();
    if (guestItems.length === 0) return;

    try {
      await apiFetch('/v1/cart/merge', {
        method: 'POST',
        body: JSON.stringify({ items: guestItems }),
      });
      clearGuestCartStorage();
      await get().fetchCart();
    } catch {
      // If merge fails, just clear guest cart and fetch server cart
      clearGuestCartStorage();
      await get().fetchCart();
    }
  },

  loadGuestCart: () => {
    const guestItems = getGuestCart();
    set({
      totalItems: guestItems.reduce((sum, i) => sum + i.quantity, 0),
      isLoading: false,
    });
  },
}));
