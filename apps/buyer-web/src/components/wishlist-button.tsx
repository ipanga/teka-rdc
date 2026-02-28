'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

interface WishlistButtonProps {
  productId: string;
  className?: string;
}

export function WishlistButton({ productId, className = '' }: WishlistButtonProps) {
  const t = useTranslations('Wishlist');
  const user = useAuthStore((s) => s.user);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ isInWishlist: boolean }>(
        `/v1/wishlist/${productId}/status`,
      );
      setIsWishlisted(res.data.isInWishlist);
    } catch {
      // ignore — user may not be logged in
    }
  }, [productId, user]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  async function handleToggle() {
    if (!user || isLoading) return;

    // Optimistic update
    const prev = isWishlisted;
    setIsWishlisted(!prev);
    setIsLoading(true);

    try {
      if (prev) {
        await apiFetch(`/v1/wishlist/${productId}`, { method: 'DELETE' });
        setFeedback(t('removedFromWishlist'));
      } else {
        await apiFetch(`/v1/wishlist/${productId}`, { method: 'POST' });
        setFeedback(t('addedToWishlist'));
      }
    } catch {
      // Revert on error
      setIsWishlisted(prev);
    } finally {
      setIsLoading(false);
      setTimeout(() => setFeedback(null), 2500);
    }
  }

  if (!user) return null;

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className="p-2 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
        aria-label={isWishlisted ? t('remove') : t('addedToWishlist')}
      >
        {isWishlisted ? (
          <svg
            className="w-6 h-6 text-red-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
          </svg>
        ) : (
          <svg
            className="w-6 h-6 text-muted-foreground hover:text-red-500 transition-colors"
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
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap bg-foreground text-white text-xs px-3 py-1.5 rounded-lg shadow-lg z-10">
          {feedback}
        </div>
      )}
    </div>
  );
}
