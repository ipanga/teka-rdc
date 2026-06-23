'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCartStore } from '@/lib/cart-store';
import { formatCDF } from '@/lib/format';
import { cn } from '@/components/ui';
import type { CartItem } from '@/lib/types';

interface CartItemRowProps {
  item: CartItem;
}

export function CartItemRow({ item }: CartItemRowProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const [isUpdating, setIsUpdating] = useState(false);

  const { product, quantity } = item;
  const title = product.title;
  const maxStock = product.quantity;
  const thumbnailUrl = product.image?.thumbnailUrl || product.image?.url;
  // Charge the effective (discounted) price; keep the original for strikethrough.
  const hasDiscount =
    product.discountPriceCDF != null &&
    Number(product.discountPriceCDF) < Number(product.priceCDF);
  const effectiveCDF = hasDiscount
    ? (product.discountPriceCDF as string)
    : product.priceCDF;
  const subtotalCentimes = BigInt(effectiveCDF) * BigInt(quantity);

  async function handleQuantityChange(newQty: number) {
    if (newQty < 1 || newQty > maxStock || isUpdating) return;
    setIsUpdating(true);
    await updateQuantity(item.productId, newQty);
    setIsUpdating(false);
  }

  async function handleRemove() {
    if (isUpdating) return;
    setIsUpdating(true);
    await removeItem(item.productId);
    setIsUpdating(false);
  }

  return (
    <div className="flex gap-3 md:gap-4 py-4 border-b border-border last:border-0">
      {/* Product image */}
      <Link
        href={`/${item.productId}`}
        className="relative w-20 h-20 md:w-28 md:h-28 bg-surface-muted rounded-lg overflow-hidden shrink-0 border border-border"
      >
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 80px, 112px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </Link>

      {/* Product info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <Link
            href={`/${item.productId}`}
            className="text-sm md:text-base font-medium text-foreground hover:text-primary transition-colors line-clamp-2 leading-snug"
          >
            {title}
          </Link>
          <p className="text-xs text-muted-foreground mt-1">
            {"Vendeur"}: <span className="font-medium">{product.seller.businessName}</span>
          </p>
          <p className="text-base md:text-lg font-bold text-primary mt-1.5">
            {formatCDF(effectiveCDF)}
            {hasDiscount && (
              <span className="ml-2 text-xs font-medium text-muted-foreground line-through">
                {formatCDF(product.priceCDF)}
              </span>
            )}
          </p>
        </div>

        {/* Quantity + remove */}
        <div className="flex items-center gap-3 mt-3">
          <div className="inline-flex items-center border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => handleQuantityChange(quantity - 1)}
              disabled={quantity <= 1 || isUpdating}
              className={cn(
                'w-8 h-8 flex items-center justify-center text-foreground',
                'hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
              )}
              aria-label="Decrease quantity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <span className="w-10 text-center text-sm font-semibold text-foreground border-x border-border h-8 flex items-center justify-center">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => handleQuantityChange(quantity + 1)}
              disabled={quantity >= maxStock || isUpdating}
              className={cn(
                'w-8 h-8 flex items-center justify-center text-foreground',
                'hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
              )}
              aria-label="Increase quantity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <button
            onClick={handleRemove}
            disabled={isUpdating}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 underline-offset-4 hover:underline"
          >
            {"Supprimer"}
          </button>
        </div>
      </div>

      {/* Subtotal */}
      <div className="text-right shrink-0 self-start">
        <p className="text-xs text-muted-foreground hidden md:block">{"Sous-total"}</p>
        <p className="text-base md:text-lg font-bold text-foreground mt-0.5">
          {formatCDF(subtotalCentimes.toString())}
        </p>
      </div>
    </div>
  );
}
