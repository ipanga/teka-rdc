import { create } from 'zustand';
import { apiFetch } from './api-client';
import { track } from './analytics';

/**
 * A wishlist add a guest attempted before logging in. Stashed in localStorage
 * so it survives the round-trip to /connexion and is completed by
 * WishlistSync once auth resolves on the original page.
 */
const PENDING_WISHLIST_KEY = 'teka_pending_wishlist';

export function setPendingWishlistAdd(productId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PENDING_WISHLIST_KEY, productId);
  } catch {
    // ignore (private mode / storage full)
  }
}

export function takePendingWishlistAdd(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = localStorage.getItem(PENDING_WISHLIST_KEY);
    if (id) localStorage.removeItem(PENDING_WISHLIST_KEY);
    return id;
  } catch {
    return null;
  }
}

/**
 * Global wishlist state for buyer-web.
 *
 * Holds the set of wishlisted product ids (for O(1) heart state on any
 * surface) + the header count. Cards read `ids.has(id)` so a toggle anywhere
 * updates every heart for that product. Grids batch-hydrate visible ids via
 * `/v1/wishlist/check` (one request per page of cards — no per-card N+1).
 *
 * Mirrors the cart-store ↔ auth wiring: `WishlistSync` syncs auth → store
 * (hydrate/reset on login/logout). Analytics (`wishlist_added`/`removed`)
 * fire here so they're emitted once regardless of which surface toggled.
 */
interface WishlistState {
  ids: Set<string>;
  count: number;
  isAuthenticated: boolean;

  setAuthenticated: (auth: boolean) => void;
  isWishlisted: (productId: string) => boolean;
  /** Reconcile the wishlisted state of a specific set of visible product ids. */
  hydrate: (productIds: string[]) => Promise<void>;
  loadCount: () => Promise<void>;
  /** Optimistic add/remove with rollback. Throws on API failure. */
  toggle: (productId: string) => Promise<void>;
  /** Idempotent add (no toggle-off). Used to complete a pending guest add. */
  add: (productId: string) => Promise<void>;
  reset: () => void;
}

export const useWishlistStore = create<WishlistState>((set, get) => ({
  ids: new Set<string>(),
  count: 0,
  isAuthenticated: false,

  setAuthenticated: (auth: boolean) => set({ isAuthenticated: auth }),

  isWishlisted: (productId: string) => get().ids.has(productId),

  hydrate: async (productIds: string[]) => {
    if (!get().isAuthenticated || productIds.length === 0) return;
    try {
      const qs = encodeURIComponent(productIds.join(','));
      const res = await apiFetch<string[]>(`/v1/wishlist/check?productIds=${qs}`);
      const wishlisted = new Set(res.data);
      // Reconcile only the queried ids — leave the rest of the set untouched.
      const next = new Set(get().ids);
      for (const id of productIds) {
        if (wishlisted.has(id)) next.add(id);
        else next.delete(id);
      }
      set({ ids: next });
    } catch {
      // Non-critical: hearts just stay in their default (empty) state.
    }
  },

  loadCount: async () => {
    if (!get().isAuthenticated) return;
    try {
      const res = await apiFetch<{ count: number }>('/v1/wishlist/count');
      set({ count: res.data.count });
    } catch {
      // leave previous count
    }
  },

  toggle: async (productId: string) => {
    const prevIds = get().ids;
    const prevCount = get().count;
    const wasWishlisted = prevIds.has(productId);

    // Optimistic update
    const next = new Set(prevIds);
    if (wasWishlisted) next.delete(productId);
    else next.add(productId);
    set({
      ids: next,
      count: Math.max(0, prevCount + (wasWishlisted ? -1 : 1)),
    });

    try {
      await apiFetch(`/v1/wishlist/${productId}`, {
        method: wasWishlisted ? 'DELETE' : 'POST',
      });
      track(wasWishlisted ? 'wishlist_removed' : 'wishlist_added', { productId });
    } catch (err) {
      // Roll back to the pre-click state and surface the error to the caller.
      set({ ids: prevIds, count: prevCount });
      throw err;
    }
  },

  add: async (productId: string) => {
    if (get().ids.has(productId)) return; // already wishlisted — no-op
    const prevIds = get().ids;
    const prevCount = get().count;
    const next = new Set(prevIds);
    next.add(productId);
    set({ ids: next, count: prevCount + 1 });
    try {
      await apiFetch(`/v1/wishlist/${productId}`, { method: 'POST' });
      track('wishlist_added', { productId });
    } catch {
      set({ ids: prevIds, count: prevCount });
    }
  },

  reset: () => set({ ids: new Set<string>(), count: 0 }),
}));
