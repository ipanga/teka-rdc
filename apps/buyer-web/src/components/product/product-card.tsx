'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { formatCDF } from '@/lib/format';
import type { BrowseProduct } from '@/lib/types';

interface ProductCardProps {
  product: BrowseProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const t = useTranslations('Products');

  const title = product.title;
  const imageUrl = product.image?.thumbnailUrl || product.image?.url;
  const outOfStock = product.quantity <= 0;

  return (
    <Link
      href={`/${product.slug || product.id}`}
      className="group block bg-surface rounded-xl border border-border overflow-hidden shadow-xs hover:shadow-lg hover:border-border-strong transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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

        {/* Top-left: stock badge (only when out of stock) */}
        {outOfStock && (
          <Badge variant="solid" size="sm" className="absolute top-2 left-2 shadow-sm">
            {t('outOfStock')}
          </Badge>
        )}

        {/* Top-right: condition badge */}
        <Badge
          variant={product.condition === 'NEW' ? 'new' : 'used'}
          size="sm"
          className="absolute top-2 right-2 shadow-sm"
        >
          {t(`condition_${product.condition}`)}
        </Badge>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem] leading-snug">
          {title}
        </h3>
        <p className="text-lg font-bold text-primary tracking-tight">
          {formatCDF(product.priceCDF)}
        </p>
        <p className="text-xs text-muted-foreground truncate group-hover:text-foreground transition-colors">
          {product.seller.businessName}
        </p>
      </div>
    </Link>
  );
}
