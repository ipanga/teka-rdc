'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatCDF, getLocalizedName } from '@/lib/format';
import type { BrowseProduct } from '@/lib/types';

interface ProductCardProps {
  product: BrowseProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const locale = useLocale();
  const t = useTranslations('Products');

  const title = getLocalizedName(product.title, locale);
  const imageUrl = product.image?.thumbnailUrl || product.image?.url;

  return (
    <Link
      href={`/products/${product.slug || product.id}`}
      className="group block bg-white rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow duration-200"
    >
      {/* Image */}
      <div className="relative aspect-square bg-muted overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-200"
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

        {/* Condition badge */}
        <span
          className={`absolute top-2 left-2 px-2 py-0.5 text-xs font-medium rounded ${
            product.condition === 'NEW'
              ? 'bg-success text-white'
              : 'bg-warning text-white'
          }`}
        >
          {t(`condition_${product.condition}`)}
        </span>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem]">
          {title}
        </h3>
        <p className="mt-1 text-base font-bold text-primary">
          {formatCDF(product.priceCDF)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground truncate">
          {product.seller.businessName}
        </p>
      </div>
    </Link>
  );
}
