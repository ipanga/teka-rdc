'use client';

import { useEffect } from 'react';
import { useWishlistStore, takePendingWishlistAdd } from '@/lib/wishlist-store';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Headless wishlist ↔ auth sync. Renders nothing.
 *
 * This is the single place that syncs the wishlist store to auth — hydrate the
 * count on login, reset on logout, and complete a continue-after-login add.
 * Previously this effect lived inside the header `WishlistBadge`; it was lifted
 * out (and mounted globally in the root layout) when the wishlist icon was
 * removed from the header chrome, so product-card heart state keeps working on
 * every surface regardless of header layout.
 */
export function WishlistSync() {
  const setAuthenticated = useWishlistStore((s) => s.setAuthenticated);
  const loadCount = useWishlistStore((s) => s.loadCount);
  const addToWishlist = useWishlistStore((s) => s.add);
  const reset = useWishlistStore((s) => s.reset);
  const user = useAuthStore((s) => s.user);
  const isLoadingAuth = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (isLoadingAuth) return;
    if (user) {
      setAuthenticated(true);
      void loadCount();
      // Continue-after-login: complete a wishlist add a guest started before
      // logging in (stashed in localStorage, set on the heart they tapped).
      const pending = takePendingWishlistAdd();
      if (pending) void addToWishlist(pending);
    } else {
      setAuthenticated(false);
      reset();
    }
  }, [user, isLoadingAuth, setAuthenticated, loadCount, addToWishlist, reset]);

  return null;
}
