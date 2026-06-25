'use client';

import { useEffect } from 'react';
import { ProductCard } from './product-card';
import { useWishlistStore } from '@/lib/wishlist-store';
import type { BrowseProduct } from '@/lib/types';

interface ProductCarouselProps {
  products: BrowseProduct[];
  isLoading?: boolean;
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden animate-pulse">
      <div className="aspect-square bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/2" />
        <div className="h-5 bg-muted rounded w-2/3" />
      </div>
    </div>
  );
}

/**
 * Horizontal, scroll-snapping shelf of product cards — for homepage shelves
 * (Promotions / Populaires / Nouveautés). Unlike the responsive ProductGrid,
 * a carousel keeps a 1–2 item shelf looking intentional instead of leaving
 * empty grid cells. Each card is a fixed width so partial cards hint at more.
 */
export function ProductCarousel({ products, isLoading }: ProductCarouselProps) {
  const hydrateWishlist = useWishlistStore((s) => s.hydrate);

  useEffect(() => {
    if (products.length === 0) return;
    void hydrateWishlist(products.map((p) => p.id));
  }, [products, hydrateWishlist]);

  if (isLoading) {
    return (
      <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 snap-x scroll-px-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-40 sm:w-48 shrink-0 snap-start">
            <SkeletonCard />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) return null;

  return (
    <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 snap-x scroll-px-4">
      {products.map((product) => (
        <div key={product.id} className="w-40 sm:w-48 shrink-0 snap-start">
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
