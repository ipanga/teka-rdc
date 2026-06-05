'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { useWishlistStore, takePendingWishlistAdd } from '@/lib/wishlist-store';
import { useAuthStore } from '@/lib/auth-store';

interface WishlistBadgeProps {
  /** Compact variant for the mobile top bar. */
  compact?: boolean;
}

/**
 * Header wishlist icon + count badge. Mirrors CartBadge: also the single place
 * that syncs the wishlist store to auth — load the count on login, reset on
 * logout. Renders nothing for guests (matches PR-2 behaviour); the sync effect
 * still runs so the store clears on logout.
 */
export function WishlistBadge({ compact = false }: WishlistBadgeProps) {
  const count = useWishlistStore((s) => s.count);
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

  if (!user) return null;

  return (
    <Link
      href="/wishlist"
      className={
        compact
          ? 'relative p-1.5 text-foreground hover:text-primary transition-colors'
          : 'relative p-2 text-foreground hover:text-primary transition-colors'
      }
      aria-label="Wishlist"
    >
      <svg
        className={compact ? 'w-5 h-5' : 'w-6 h-6'}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
      {count > 0 && (
        <Badge
          variant="discount"
          size="sm"
          className="absolute -top-1 -right-1 min-w-5 h-5 px-1 justify-center shadow-sm"
        >
          {count > 99 ? '99+' : count}
        </Badge>
      )}
    </Link>
  );
}
