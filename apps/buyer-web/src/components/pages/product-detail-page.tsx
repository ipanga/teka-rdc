'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ProductReviews } from '@/components/product-reviews';
import { WishlistButton } from '@/components/wishlist-button';
import { apiFetch } from '@/lib/api-client';
import { useCartStore } from '@/lib/cart-store';
import { useAuthStore } from '@/lib/auth-store';
import { formatCDF, formatUSD, getLocalizedName } from '@/lib/format';
import type { ProductDetail } from '@/lib/types';

export default function ProductDetailPage() {
  const t = useTranslations('Products');
  const tCat = useTranslations('Categories');
  const tMsg = useTranslations('Messaging');
  const locale = useLocale();
  const router = useRouter();
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
  const [contactingSeller, setContactingSeller] = useState(false);
  const addItem = useCartStore((s) => s.addItem);

  async function handleContactSeller(sellerId: string) {
    if (!user || contactingSeller) return;
    setContactingSeller(true);
    try {
      const res = await apiFetch<{ id: string }>('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ sellerId, content: '...' }),
      });
      router.push(`/messages/${res.data.id}` as '/messages/${string}');
    } catch {
      // fallback: go to messages page
      router.push('/messages');
    } finally {
      setContactingSeller(false);
    }
  }

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
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
          <div className="animate-pulse">
            {/* Breadcrumb skeleton */}
            <div className="h-4 bg-muted rounded w-48 mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Image skeleton */}
              <div className="aspect-square bg-muted rounded-lg" />
              {/* Info skeleton */}
              <div className="space-y-4">
                <div className="h-8 bg-muted rounded w-3/4" />
                <div className="h-10 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-1/4" />
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-32 bg-muted rounded" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
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
            <Link
              href="/"
              className="text-primary hover:underline font-medium"
            >
              {tCat('title')}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const title = getLocalizedName(product.title, locale);
  const description = getLocalizedName(product.description, locale);
  const images = product.images || [];
  const selectedImage = images[selectedImageIndex] || null;
  const isOutOfStock = product.quantity <= 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6 overflow-x-auto">
          <Link href="/" className="hover:text-primary transition-colors shrink-0">
            {tCat('title')}
          </Link>
          {product.category?.breadcrumb?.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-2 shrink-0">
              <span>/</span>
              <Link
                href={`/categories/${crumb.id}`}
                className="hover:text-primary transition-colors"
              >
                {getLocalizedName(crumb.name, locale)}
              </Link>
            </span>
          ))}
          <span>/</span>
          <span className="text-foreground truncate">{title}</span>
        </nav>

        {/* Product content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Image gallery */}
          <div>
            {/* Main image */}
            <div className="relative aspect-square bg-muted rounded-lg overflow-hidden mb-3">
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
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {images.map((img, index) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImageIndex(index)}
                    className={`relative w-16 h-16 rounded-md overflow-hidden shrink-0 border-2 transition-colors ${
                      index === selectedImageIndex
                        ? 'border-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Image
                      src={img.thumbnailUrl || img.url}
                      alt={img.alt || `${title} ${index + 1}`}
                      fill
                      sizes="64px"
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
            <span
              className={`inline-block px-3 py-1 text-xs font-medium rounded mb-3 ${
                product.condition === 'NEW'
                  ? 'bg-success text-white'
                  : 'bg-warning text-white'
              }`}
            >
              {t(`condition_${product.condition}`)}
            </span>

            {/* Title + Wishlist */}
            <div className="flex items-start justify-between gap-2 mb-4">
              <h1 className="text-xl md:text-2xl font-bold text-foreground">
                {title}
              </h1>
              <WishlistButton productId={productId} className="shrink-0 mt-0.5" />
            </div>

            {/* Price */}
            <div className="mb-4">
              <p className="text-2xl md:text-3xl font-bold text-primary">
                {formatCDF(product.priceCDF)}
              </p>
              {product.priceUSD && (
                <p className="text-sm text-muted-foreground mt-1">
                  ~ {formatUSD(product.priceUSD)}
                </p>
              )}
            </div>

            {/* Stock */}
            <div className="mb-4">
              {isOutOfStock ? (
                <span className="inline-flex items-center gap-1 text-sm text-destructive font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {t('outOfStock')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-success font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {t('inStock')} &middot; {t('available', { count: product.quantity })}
                </span>
              )}
            </div>

            {/* Add to Cart */}
            {!isOutOfStock && (
              <div className="py-4 border-t border-border">
                {/* Quantity selector */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm text-muted-foreground">{t('quantity')}:</span>
                  <div className="flex items-center border border-border rounded-lg">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="w-9 h-9 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-l-lg"
                      aria-label="Decrease quantity"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="w-12 text-center text-sm font-medium text-foreground">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(product.quantity, q + 1))}
                      disabled={quantity >= product.quantity}
                      className="w-9 h-9 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-r-lg"
                      aria-label="Increase quantity"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Add to cart button */}
                <button
                  onClick={async () => {
                    setAddingToCart(true);
                    await addItem(product.id, quantity);
                    setAddingToCart(false);
                    setCartFeedback(true);
                    setTimeout(() => setCartFeedback(false), 3000);
                  }}
                  disabled={addingToCart}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
                </button>

                {/* Feedback banner */}
                {cartFeedback && (
                  <div className="mt-3 flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success">
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {t('addedToCart')}
                  </div>
                )}
              </div>
            )}

            {/* Seller */}
            <div className="py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">{t('seller')}</p>
              <p className="text-sm font-medium text-foreground">
                {product.seller.businessName}
              </p>
              {user && (
                <button
                  onClick={() => handleContactSeller(product.seller.id)}
                  disabled={contactingSeller}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors font-medium disabled:opacity-50"
                >
                  {contactingSeller ? (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                      />
                    </svg>
                  )}
                  {tMsg('contactSeller')}
                </button>
              )}
            </div>

            {/* Category */}
            {product.category && (
              <div className="py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">{t('category')}</p>
                <Link
                  href={`/categories/${product.category.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {getLocalizedName(product.category.name, locale)}
                </Link>
              </div>
            )}

            {/* Description */}
            {description && (
              <div className="py-3 border-t border-border">
                <h2 className="text-sm font-semibold text-foreground mb-2">
                  {t('description')}
                </h2>
                <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {description}
                </div>
              </div>
            )}

            {/* Specifications */}
            {product.specifications && product.specifications.length > 0 && (
              <div className="py-3 border-t border-border">
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  {t('specifications')}
                </h2>
                <dl className="space-y-2">
                  {product.specifications.map((spec) => (
                    <div
                      key={spec.id}
                      className="flex gap-4 text-sm py-1.5 border-b border-border last:border-0"
                    >
                      <dt className="text-muted-foreground w-1/3 shrink-0">
                        {getLocalizedName(spec.name, locale)}
                      </dt>
                      <dd className="text-foreground font-medium">
                        {getLocalizedName(spec.value, locale)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>

        {/* Reviews section */}
        <ProductReviews productId={productId} />
      </main>

      <Footer />
    </div>
  );
}
