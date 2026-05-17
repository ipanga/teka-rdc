'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ProductReviews } from '@/components/product-reviews';
import { WishlistButton } from '@/components/wishlist-button';
import { apiFetch } from '@/lib/api-client';
import { useCartStore } from '@/lib/cart-store';
import { useAuthStore } from '@/lib/auth-store';
import { formatCDF, formatUSD } from '@/lib/format';
import { Badge, Button, Card, Container, buttonVariants, cn } from '@/components/ui';
import type { ProductDetail } from '@/lib/types';

export default function ProductDetailPage() {
  const t = useTranslations('Products');
  const tCat = useTranslations('Categories');
  // 'Messaging' translation namespace stays in messages/fr.json (with a
  // deprecation comment there); only the in-app references were removed
  // when direct buyer↔seller messaging was retired on 2026-05-17. Buyers
  // now reach Teka RDC support via /contact instead.
  const tSupport = useTranslations('Support');
  const params = useParams<{ slug: string }>();
  const productId = params.slug;
  const user = useAuthStore((s) => s.user);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartFeedback, setCartFeedback] = useState(false);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    setIsLoading(true);
    setError(false);

    apiFetch<ProductDetail>(`/v1/browse/products/${productId}`)
      .then((res) => setProduct(res.data))
      .catch(() => setError(true))
      .finally(() => setIsLoading(false));
  }, [productId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-surface-muted">
        <Header />
        <main className="flex-1">
          <Container className="py-6">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-48 mb-6" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div className="aspect-square bg-muted rounded-xl" />
                <div className="space-y-4">
                  <div className="h-8 bg-muted rounded w-3/4" />
                  <div className="h-10 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-1/4" />
                  <div className="h-32 bg-muted rounded" />
                </div>
              </div>
            </div>
          </Container>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex flex-col bg-surface-muted">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <svg
              className="mx-auto w-16 h-16 text-muted-foreground mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-muted-foreground mb-4">{t('noProducts')}</p>
            <Link href="/" className={buttonVariants({ variant: 'default', size: 'md' })}>
              {tCat('title')}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const title = product.title ?? '';
  const description = product.description ?? '';
  const images = product.images || [];
  const selectedImage = images[selectedImageIndex] || null;
  const isOutOfStock = product.quantity <= 0;

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1 pb-24 md:pb-12">
        <Container className="py-6">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5 overflow-x-auto">
            <Link href="/" className="hover:text-primary transition-colors shrink-0">
              {tCat('title')}
            </Link>
            {product.category?.breadcrumb?.map((crumb) => (
              <span key={crumb.id} className="flex items-center gap-2 shrink-0">
                <span>/</span>
                <Link
                  href={crumb.slug ? `/categorie/${crumb.slug}` : `/categories/${crumb.id}`}
                  className="hover:text-primary transition-colors"
                >
                  {crumb.name ?? ''}
                </Link>
              </span>
            ))}
            <span>/</span>
            <span className="text-foreground truncate">{title}</span>
          </nav>

          {/* Product main grid: gallery + info side-by-side on desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
            {/* Image gallery */}
            <div className="space-y-3">
              <Card padding="none" className="overflow-hidden">
                <div className="relative aspect-square bg-surface">
                  {selectedImage ? (
                    <Image
                      src={selectedImage.url}
                      alt={selectedImage.alt || title}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-contain"
                      priority
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Out-of-stock overlay badge */}
                  {isOutOfStock && (
                    <Badge variant="solid" size="md" className="absolute top-3 left-3 shadow-sm">
                      {t('outOfStock')}
                    </Badge>
                  )}
                </div>
              </Card>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, index) => (
                    <button
                      key={img.id}
                      onClick={() => setSelectedImageIndex(index)}
                      className={cn(
                        'relative w-20 h-20 rounded-lg overflow-hidden shrink-0 border-2 transition-all',
                        index === selectedImageIndex
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-border hover:border-border-strong',
                      )}
                      aria-label={`Image ${index + 1}`}
                    >
                      <Image
                        src={img.thumbnailUrl || img.url}
                        alt={img.alt || `${title} ${index + 1}`}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product info */}
            <div>
              {/* Condition badge */}
              <Badge
                variant={product.condition === 'NEW' ? 'new' : 'used'}
                size="md"
                className="mb-3"
              >
                {t(`condition_${product.condition}`)}
              </Badge>

              {/* Title + Wishlist */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                  {title}
                </h1>
                <WishlistButton productId={product.id} className="shrink-0 mt-1" />
              </div>

              {/* Price block */}
              <div className="mb-5">
                <p className="text-3xl md:text-4xl font-bold text-primary tracking-tight">
                  {formatCDF(product.priceCDF)}
                </p>
                {product.priceUSD && (
                  <p className="text-sm text-muted-foreground mt-1">
                    ~ {formatUSD(product.priceUSD)}
                  </p>
                )}
              </div>

              {/* Stock indicator */}
              <div className="mb-5">
                {isOutOfStock ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-destructive font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {t('outOfStock')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {t('inStock')} &middot; {t('available', { count: product.quantity })}
                  </span>
                )}
              </div>

              {/* Add to Cart (desktop) — hidden on small viewports where the sticky bar shows */}
              {!isOutOfStock && (
                <div className="hidden md:block py-5 border-t border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm text-muted-foreground">{t('quantity')}:</span>
                    <QuantityStepper
                      value={quantity}
                      min={1}
                      max={product.quantity}
                      onChange={setQuantity}
                    />
                  </div>

                  <Button
                    onClick={async () => {
                      setAddingToCart(true);
                      await addItem(product.id, quantity);
                      setAddingToCart(false);
                      setCartFeedback(true);
                      setTimeout(() => setCartFeedback(false), 3000);
                    }}
                    disabled={addingToCart}
                    size="lg"
                    className="w-full"
                  >
                    {addingToCart ? (
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                        />
                      </svg>
                    )}
                    {t('addToCart')}
                  </Button>

                  {cartFeedback && (
                    <div className="mt-3 flex items-center gap-2 p-3 bg-success-subtle border border-success/20 rounded-lg text-sm text-success">
                      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t('addedToCart')}
                    </div>
                  )}
                </div>
              )}

              {/* Seller card */}
              <Card padding="sm" className="mt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('seller')}</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">
                  {product.seller.businessName}
                </p>
                {/* Direct buyer↔seller chat retired 2026-05-17. Questions
                    about a product or order now flow through Teka RDC
                    support — single channel, faster moderation, clearer
                    dispute trail. */}
                <Link
                  href="/contact"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover transition-colors font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                  {tSupport('contactSupport')}
                </Link>
              </Card>

              {/* Category link */}
              {product.category && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('category')}</p>
                  <Link
                    href={
                      product.category.slug
                        ? `/categorie/${product.category.slug}`
                        : `/categories/${product.category.id}`
                    }
                    className="text-sm font-medium text-primary hover:text-primary-hover hover:underline underline-offset-4 mt-0.5 inline-block"
                  >
                    {product.category.name ?? ''}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {description && (
            <Card padding="md" className="mt-6">
              <h2 className="text-base font-semibold text-foreground mb-3 tracking-tight">
                {t('description')}
              </h2>
              <div className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
                {description}
              </div>
            </Card>
          )}

          {/* Specifications */}
          {product.specifications && product.specifications.length > 0 && (
            <Card padding="md" className="mt-4">
              <h2 className="text-base font-semibold text-foreground mb-4 tracking-tight">
                {t('specifications')}
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-x-4">
                {product.specifications.map((spec, i) => (
                  <div
                    key={spec.id}
                    className={cn(
                      'contents',
                      // alternating row backgrounds via wrapper trick: render as
                      // pair-of-cells inside a contents container
                    )}
                  >
                    <dt
                      className={cn(
                        'text-sm text-muted-foreground px-3 py-2.5',
                        i % 2 === 0 ? 'bg-surface-muted/60' : '',
                        'sm:rounded-l-md',
                      )}
                    >
                      {spec.name ?? ''}
                    </dt>
                    <dd
                      className={cn(
                        'text-sm text-foreground font-medium px-3 py-2.5',
                        i % 2 === 0 ? 'bg-surface-muted/60' : '',
                        'sm:rounded-r-md',
                      )}
                    >
                      {spec.value ?? ''}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          {/* Reviews section — the reviews API only accepts UUIDs
              (ParseUUIDPipe), but `productId` from the URL may be a slug. Pass
              the resolved UUID from the fetched product instead. */}
          <ProductReviews productId={product.id} />
        </Container>
      </main>

      {/* Mobile sticky CTA bar */}
      {!isOutOfStock && (
        <div
          className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border shadow-lg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center gap-3 p-3">
            <QuantityStepper
              value={quantity}
              min={1}
              max={product.quantity}
              onChange={setQuantity}
              compact
            />
            <Button
              onClick={async () => {
                setAddingToCart(true);
                await addItem(product.id, quantity);
                setAddingToCart(false);
                setCartFeedback(true);
                setTimeout(() => setCartFeedback(false), 3000);
              }}
              disabled={addingToCart}
              size="lg"
              className="flex-1"
            >
              {t('addToCart')}
            </Button>
          </div>
          {cartFeedback && (
            <div className="px-3 pb-3 -mt-1 text-xs text-success font-medium text-center">
              ✓ {t('addedToCart')}
            </div>
          )}
        </div>
      )}

      <Footer />
    </div>
  );
}

interface QuantityStepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  compact?: boolean;
}

function QuantityStepper({ value, min, max, onChange, compact }: QuantityStepperProps) {
  const btn = compact ? 'w-8 h-8' : 'w-10 h-10';
  const cell = compact ? 'w-10' : 'w-12';
  return (
    <div className="inline-flex items-center border border-border rounded-lg overflow-hidden shrink-0">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={cn(
          btn,
          'flex items-center justify-center text-foreground hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
        )}
        aria-label="Decrease quantity"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      </button>
      <span className={cn(cell, 'text-center text-sm font-medium text-foreground border-x border-border h-full flex items-center justify-center')}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={cn(
          btn,
          'flex items-center justify-center text-foreground hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
        )}
        aria-label="Increase quantity"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
