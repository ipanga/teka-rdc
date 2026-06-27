'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { WishlistButton } from '@/components/wishlist-button';
import { useCartStore } from '@/lib/cart-store';
import { formatCDF, formatUSD, discountPercent } from '@/lib/format';
import { productHref } from '@/lib/urls';
import type { BrowseProduct } from '@/lib/types';

interface ProductCardProps {
  product: BrowseProduct;
}

/** Compact 5-star rating (amber filled to the nearest half). */
function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center" aria-label={`Note ${value.toFixed(1)} sur 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i)); // 0..1 for this star
        return (
          <span key={i} className="relative inline-block w-3 h-3 leading-none">
            <svg viewBox="0 0 20 20" className="absolute inset-0 w-3 h-3 text-border" fill="currentColor">
              <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.77l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z" />
            </svg>
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <svg viewBox="0 0 20 20" className="w-3 h-3 text-amber-500" fill="currentColor">
                <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.77l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z" />
              </svg>
            </span>
          </span>
        );
      })}
    </div>
  );
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

  // Promotional price (seller-set). When present, show the discounted price
  // with the original struck through + a −X% badge. The API guarantees
  // discount < price; discountPercent is defensive.
  const discount = discountPercent(product.priceCDF, product.discountPriceCDF);
  const hasDiscount = discount > 0;
  const effectiveCDF = hasDiscount
    ? (product.discountPriceCDF as string)
    : product.priceCDF;
  // Absolute savings (centimes) for "Vous économisez X" — computed from the
  // exact prices so it always matches the displayed strike-through.
  const savingsCDF = hasDiscount
    ? (BigInt(product.priceCDF) - BigInt(effectiveCDF)).toString()
    : null;
  const brandName = product.brand?.name?.trim();
  // "Officiel" badge for the platform-owned seller (no fabricated data).
  const isOfficial = product.seller?.businessName === 'Teka RDC Officiel';

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
    <div className="group relative flex h-full flex-col bg-surface rounded-xl border border-border overflow-hidden shadow-xs hover:shadow-lg hover:border-border-strong transition-all duration-200 hover:-translate-y-0.5">
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
            {/* Discount badge first — the highest-intent signal on the grid. */}
            {hasDiscount && (
              <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-md">
                {`-${discount}%`}
              </span>
            )}
            {outOfStock && (
              <span className="rounded-md bg-foreground px-2 py-0.5 text-[11px] font-semibold text-white shadow-md">
                {"Rupture de stock"}
              </span>
            )}
            {lowStock && (
              <span className="rounded-md bg-warning px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-md">
                {`🔥 Plus que ${product.quantity} disponible${product.quantity > 1 ? 's' : ''}`}
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-3 space-y-1">
          {/* Brand (when present) + Officiel badge — subtle line above the title. */}
          {(brandName || isOfficial) && (
            <div className="flex items-center gap-1.5 min-h-[1rem]">
              {brandName && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
                  {brandName}
                </span>
              )}
              {isOfficial && (
                <span className="inline-flex items-center gap-0.5 rounded-sm bg-primary-subtle px-1 py-px text-[9px] font-bold uppercase tracking-wide text-primary shrink-0">
                  <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M10 1l2.39 1.74 2.96.01.91 2.81 2.4 1.75-.92 2.81.92 2.81-2.4 1.75-.91 2.81-2.96.01L10 19l-2.39-1.69-2.96-.01-.91-2.81-2.4-1.75.92-2.81L1.34 7.3l2.4-1.75.91-2.81 2.96-.01L10 1zm3.7 6.3a1 1 0 00-1.4-1.4L9 9.18l-1.3-1.3a1 1 0 10-1.4 1.42l2 2a1 1 0 001.4 0l3.99-4z" clipRule="evenodd" />
                  </svg>
                  Officiel
                </span>
              )}
            </div>
          )}
          <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem] leading-snug">
            {title}
          </h3>
          {/* Price hierarchy: bold effective CDF + struck-through original when
              discounted (effective turns red to signal the deal) + secondary
              USD. The seller name was removed from cards to cut clutter — it
              stays on the PDP + store page. */}
          <div className="flex items-baseline gap-2 flex-wrap pt-0.5">
            <span
              className={`text-base md:text-lg font-extrabold tracking-tight ${
                hasDiscount ? 'text-primary' : 'text-foreground'
              }`}
            >
              {formatCDF(effectiveCDF)}
            </span>
            {hasDiscount && (
              <span className="text-xs font-medium text-muted-foreground line-through">
                {formatCDF(product.priceCDF)}
              </span>
            )}
            {product.priceUSD != null && product.priceUSD > 0 && (
              <span className="text-xs font-medium text-muted-foreground">
                {formatUSD(product.priceUSD)}
              </span>
            )}
          </div>
          {savingsCDF && (
            <p className="text-[11px] font-semibold text-success">
              {`Vous économisez ${formatCDF(savingsCDF)}`}
            </p>
          )}
          {/* Rating + sold count — social proof. Stars only render once a
              product has at least one review (most are 0 pre-traffic). */}
          {(product.totalReviews ?? 0) > 0 ? (
            <div className="flex items-center gap-1.5 pt-0.5">
              <StarRating value={product.avgRating ?? 0} />
              <span className="text-[11px] font-medium text-foreground">
                {(product.avgRating ?? 0).toFixed(1)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                ({product.totalReviews})
              </span>
              {product.unitsSold != null && product.unitsSold > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  · {product.unitsSold <= 1 ? `${product.unitsSold} vendu` : `${product.unitsSold} vendus`}
                </span>
              )}
            </div>
          ) : (
            product.unitsSold != null &&
            product.unitsSold > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {product.unitsSold <= 1 ? `${product.unitsSold} vendu` : `${product.unitsSold} vendus`}
              </p>
            )
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
        <div className="mt-auto px-3 pb-3 pt-0">
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
