'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useWishlistStore, setPendingWishlistAdd } from '@/lib/wishlist-store';
import { cn } from '@/components/ui';

interface WishlistButtonProps {
  productId: string;
  className?: string;
  /** 'md' for the PDP (default), 'sm' for the compact card overlay. */
  size?: 'sm' | 'md';
  /** Circular translucent background — used when overlaid on a product image. */
  overlay?: boolean;
}

export function WishlistButton({
  productId,
  className = '',
  size = 'md',
  overlay = false,
}: WishlistButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  // Auth is unknown until fetchUser() resolves. On DRC 2G/3G that window can
  // last seconds — and during it `user` is null while a valid session cookie
  // is still present. Treating that as "guest" and routing to /connexion makes
  // the middleware (which sees the cookie) bounce the user to home. So we wait.
  const authLoading = useAuthStore((s) => s.isLoading);
  // Subscribe to membership only — re-renders just this heart when its product
  // is toggled. The store batch-hydrates ids on grid load (no per-card fetch).
  const isWishlisted = useWishlistStore((s) => s.ids.has(productId));
  const toggle = useWishlistStore((s) => s.toggle);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleToggle(e: React.MouseEvent) {
    // The heart is overlaid on the product-card <Link>; never navigate to PDP.
    e.preventDefault();
    e.stopPropagation();
    if (isLoading || authLoading) return;

    // Genuine guest (auth resolved, no user): stash the intended add and send
    // to login. WishlistBadge completes it once auth resolves back on this page
    // (continue-after-login). Never reached while auth is still loading.
    if (!user) {
      setPendingWishlistAdd(productId);
      router.push(`/connexion?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    const adding = !isWishlisted;
    setIsLoading(true);
    try {
      await toggle(productId);
      setFeedback(adding ? "Ajouté à la liste de souhaits" : "Retiré de la liste de souhaits");
    } catch {
      setFeedback("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
      setTimeout(() => setFeedback(null), 2500);
    }
  }

  const iconSize = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className={cn(
          'inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-50',
          size === 'sm' ? 'p-1.5' : 'p-2',
          overlay
            ? 'bg-surface/85 backdrop-blur-sm shadow-sm hover:bg-surface'
            : 'hover:bg-muted',
        )}
        aria-label={isWishlisted ? "Retirer" : "Ajouté à la liste de souhaits"}
        aria-pressed={isWishlisted}
      >
        {isWishlisted ? (
          <svg className={cn(iconSize, 'text-red-500')} viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
          </svg>
        ) : (
          <svg
            className={cn(iconSize, 'text-muted-foreground hover:text-red-500 transition-colors')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
            />
          </svg>
        )}
      </button>

      {/* Feedback toast */}
      {feedback && (
        <div className="absolute top-full right-0 mt-2 whitespace-nowrap bg-foreground text-white text-xs px-3 py-1.5 rounded-lg shadow-lg z-20">
          {feedback}
        </div>
      )}
    </div>
  );
}
