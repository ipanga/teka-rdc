'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { WishlistButton } from '@/components/wishlist-button';
import { useCartStore } from '@/lib/cart-store';
import { formatCDF, formatUSD } from '@/lib/format';
import { productHref } from '@/lib/urls';
import type { BrowseProduct } from '@/lib/types';

interface ProductCardProps {
  product: BrowseProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const title = product.title;
  const imageUrl = product.image?.thumbnailUrl || product.image?.url;
  const outOfStock = product.quantity <= 0;
  // Scarcity cue (Phase D): in stock but running low. Threshold mirrors
  // buyer-mobile's isLowStock (≤ 5).
  const lowStock = !outOfStock && product.quantity <= 5;

  // Quick-add (Phase D): add a single unit straight from the card. The PDP
  // keeps its own quantity selector for larger orders. addItem() already fires
  // the `add_to_cart` analytics event + handles the guest/auth paths.
  async function handleQuickAdd() {
    if (adding || outOfStock) return;
    setAdding(true);
    try {
      await addItem(product.id, 1);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } finally {
      setAdding(false);
    }
  }

  return (
    // The wishlist heart is a sibling overlay (not nested in the <Link>) so it
    // stays valid HTML and a tap on the heart never navigates to the PDP.
    <div className="group relative flex flex-col bg-surface rounded-xl border border-border overflow-hidden shadow-xs hover:shadow-lg hover:border-border-strong transition-all duration-200 hover:-translate-y-0.5">
      <Link
        href={productHref(product)}
        className="block flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {/* Image */}
        <div className="relative aspect-square bg-surface-muted overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}

          {/* Top-left: stacked stock + condition badges. Custom solid pills
              (not the subtle Badge variants) with high-contrast text + shadow
              so they stay legible over ANY product photo. */}
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
            {outOfStock && (
              <span className="rounded-md bg-foreground px-2 py-0.5 text-[11px] font-semibold text-white shadow-md">
                {"Rupture de stock"}
              </span>
            )}
            {lowStock && (
              <span className="rounded-md bg-warning px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-md">
                {`Plus que ${product.quantity} en stock`}
              </span>
            )}
            {/* Only badge second-hand items — "Neuf" is the default, so
                badging every new product just adds noise. White pill + dark
                text reads cleanly over photos. */}
            {product.condition === 'USED' && (
              <span className="rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-md ring-1 ring-black/5">
                {"Occasion"}
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-3 space-y-1">
          <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem] leading-snug">
            {title}
          </h3>
          {/* Price hierarchy: bold CDF (dark, premium) + secondary USD. The red
              is reserved for the add-to-cart CTA, not flooded across the grid. */}
          <div className="flex items-baseline gap-2 flex-wrap pt-0.5">
            <span className="text-base md:text-lg font-extrabold text-foreground tracking-tight">
              {formatCDF(product.priceCDF)}
            </span>
            {product.priceUSD != null && product.priceUSD > 0 && (
              <span className="text-xs font-medium text-muted-foreground">
                {formatUSD(product.priceUSD)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate group-hover:text-foreground transition-colors">
            {product.seller.businessName}
          </p>
          {product.unitsSold != null && product.unitsSold > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {product.unitsSold <= 1 ? `${product.unitsSold} vendu` : `${product.unitsSold} vendus`}
            </p>
          )}
        </div>
      </Link>

      {/* Top-right: wishlist heart. Positioned by this wrapper (the button's
          own wrapper stays `relative` for its toast — don't stack conflicting
          position utilities, see components/ui/utils.ts). */}
      <div className="absolute top-2 right-2 z-10">
        <WishlistButton productId={product.id} size="sm" overlay />
      </div>

      {/* Quick-add — outside the <Link> (no nested interactive), so a tap adds
          to cart without navigating. Hidden when out of stock. */}
      {!outOfStock && (
        <div className="px-3 pb-3 pt-0">
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={adding}
            aria-label={"Ajouter au panier"}
            className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
              added
                ? 'bg-success-subtle text-success'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {added ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {"Produit ajouté au panier"}
              </>
            ) : adding ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {"Ajouter au panier"}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
