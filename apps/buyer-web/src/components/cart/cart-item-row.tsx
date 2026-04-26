'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCartStore } from '@/lib/cart-store';
import { formatCDF, getLocalizedName } from '@/lib/format';
import type { CartItem } from '@/lib/types';

interface CartItemRowProps {
  item: CartItem;
}

export function CartItemRow({ item }: CartItemRowProps) {
  const t = useTranslations('Cart');
  const locale = useLocale();
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const [isUpdating, setIsUpdating] = useState(false);

  const { product, quantity } = item;
  const title = getLocalizedName(product.title, locale);
  const maxStock = product.quantity;
  const thumbnailUrl = product.image?.thumbnailUrl || product.image?.url;

  // Subtotal = unitPrice * quantity
  const subtotalCentimes = BigInt(product.priceCDF) * BigInt(quantity);

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
    <div className="flex gap-3 py-4 border-b border-border last:border-0">
      {/* Product image */}
      <Link
        href={`/${item.productId}`}
        className="relative w-20 h-20 md:w-24 md:h-24 bg-muted rounded-lg overflow-hidden shrink-0"
      >
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={title}
            fill
            sizes="96px"
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
      <div className="flex-1 min-w-0">
        <Link
          href={`/${item.productId}`}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors line-clamp-2"
        >
          {title}
        </Link>

        <p className="text-xs text-muted-foreground mt-1">
          {t('seller')}: {product.seller.businessName}
        </p>

        <p className="text-sm font-semibold text-primary mt-1">
          {formatCDF(product.priceCDF)}
        </p>

        {/* Quantity controls */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center border border-border rounded-lg">
            <button
              onClick={() => handleQuantityChange(quantity - 1)}
              disabled={quantity <= 1 || isUpdating}
              className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-l-lg"
              aria-label="Decrease quantity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <span className="w-10 text-center text-sm font-medium text-foreground">
              {quantity}
            </span>
            <button
              onClick={() => handleQuantityChange(quantity + 1)}
              disabled={quantity >= maxStock || isUpdating}
              className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-r-lg"
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
            className="text-xs text-destructive hover:text-destructive/80 transition-colors disabled:opacity-40"
          >
            {t('remove')}
          </button>
        </div>
      </div>

      {/* Subtotal */}
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-foreground">
          {formatCDF(subtotalCentimes.toString())}
        </p>
      </div>
    </div>
  );
}
