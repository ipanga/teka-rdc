'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { categoryHref, productIdentifierFromParam } from '@/lib/urls';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ProductReviews } from '@/components/product-reviews';
import { RelatedProducts } from '@/components/product/related-products';
import { RecentlyViewed } from '@/components/product/recently-viewed';
import { addRecentlyViewed, detailToBrowseProduct } from '@/lib/recently-viewed';
import { WishlistButton } from '@/components/wishlist-button';
import { apiFetch } from '@/lib/api-client';
import { useCartStore } from '@/lib/cart-store';
import { useAuthStore } from '@/lib/auth-store';
import { track } from '@/lib/analytics';
import { formatCDF, formatUSD, discountPercent } from '@/lib/format';
import { Badge, Button, Card, Container, buttonVariants, cn } from '@/components/ui';
import type { ProductDetail } from '@/lib/types';

/**
 * @param identifier  Resolver token for the browse API (shortCode / UUID /
 *   legacy slug). The server route extracts it from the `[product]` segment
 *   and passes it down. Falls back to parsing the route param client-side so
 *   the component also works if rendered without the prop.
 */
export default function ProductDetailPage({ identifier }: { identifier?: string } = {}) {
  // 'Messaging' translation namespace stays in messages/fr.json (with a
  // deprecation comment there); only the in-app references were removed
  // when direct buyer↔seller messaging was retired on 2026-05-17. Buyers
  // now reach Teka RDC support via /contact instead.
  const params = useParams<{ ville?: string; product?: string }>();
  // Prefer the server-extracted identifier; otherwise derive it from the
  // `[product]` route segment (`iphone-15-pro-max-a1b2c3` -> `a1b2c3`).
  const productId =
    identifier ??
    (params.product ? productIdentifierFromParam(params.product) : '');
  const user = useAuthStore((s) => s.user);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartFeedback, setCartFeedback] = useState(false);
  const addItem = useCartStore((s) => s.addItem);

  // Always open a product page at the top. The PDP is a client component that
  // renders a short loading state at navigation time, so Next.js skips its
  // scroll-to-top and the previous page's scroll position is preserved (the
  // PDP would open mid-page on the title/price instead of the image). Reset on
  // every product change.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [productId]);

  useEffect(() => {
    setIsLoading(true);
    setError(false);

    apiFetch<ProductDetail>(`/v1/browse/products/${productId}`)
      .then((res) => {
        setProduct(res.data);
        // Record in the client-local recently-viewed history (Phase D).
        addRecentlyViewed(detailToBrowseProduct(res.data));
        // Buyer-owned UI event — fires once per successful product load.
        track('product_viewed', {
          productId: res.data.id,
          categoryId: res.data.categoryId,
          // Effective (charged) price + discount enrichment on the existing
          // event (no new event — keeps analytics noise-free).
          price_cdf: Number(res.data.discountPriceCDF ?? res.data.priceCDF),
          ...(discountPercent(res.data.priceCDF, res.data.discountPriceCDF) > 0
            ? {
                discount_percent: discountPercent(
                  res.data.priceCDF,
                  res.data.discountPriceCDF,
                ),
              }
            : {}),
          sellerId: res.data.seller?.id,
        });
      })
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
            <p className="text-muted-foreground mb-4">{"Aucun produit trouvé."}</p>
            <Link href="/" className={buttonVariants({ variant: 'default', size: 'md' })}>
              {"Catégories"}
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
  const specs = (product.specifications ?? []).filter(
    (s) => s.name?.trim() && s.value?.trim(),
  );

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1 pb-24 md:pb-12">
        <Container className="py-6">
          {/* Breadcrumb — full category path (Accueil › Catégorie › Sous-catégorie
              › … › produit). product.breadcrumb ends with the product's own
              category; the last node renders as the current (non-link) page. */}
          <nav aria-label="Fil d'Ariane" className="mb-5">
            <ol className="flex items-center gap-1.5 text-sm text-muted-foreground overflow-x-auto whitespace-nowrap">
              <li className="shrink-0">
                <Link href="/" className="hover:text-primary transition-colors">
                  {"Accueil"}
                </Link>
              </li>
              {product.breadcrumb?.map((crumb) => (
                <li key={crumb.id} className="flex items-center gap-1.5 shrink-0">
                  <span className="text-muted-foreground/50" aria-hidden>
                    /
                  </span>
                  <Link
                    href={categoryHref(product.city?.slug, crumb)}
                    className="hover:text-primary transition-colors"
                  >
                    {crumb.name ?? ''}
                  </Link>
                </li>
              ))}
              <li className="flex items-center gap-1.5 min-w-0">
                <span className="text-muted-foreground/50" aria-hidden>
                  /
                </span>
                <span
                  className="text-foreground font-medium truncate max-w-[40ch]"
                  aria-current="page"
                >
                  {title}
                </span>
              </li>
            </ol>
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
                      {"Rupture de stock"}
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
                {product.condition === 'NEW' ? 'Neuf' : 'Occasion'}
              </Badge>

              {/* Title + Wishlist */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                  {title}
                </h1>
                <WishlistButton productId={product.id} className="shrink-0 mt-1" />
              </div>

              {/* Price block — effective price prominent; when discounted, show
                  the original struck through, a −X% badge, and the savings. */}
              <div className="mb-5">
                {(() => {
                  const discount = discountPercent(
                    product.priceCDF,
                    product.discountPriceCDF,
                  );
                  const hasDiscount = discount > 0;
                  const effectiveCDF = hasDiscount
                    ? (product.discountPriceCDF as string)
                    : product.priceCDF;
                  const savings = hasDiscount
                    ? (Number(product.priceCDF) - Number(effectiveCDF)).toString()
                    : null;
                  return (
                    <>
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-3xl md:text-4xl font-bold text-primary tracking-tight">
                          {formatCDF(effectiveCDF)}
                        </p>
                        {hasDiscount && (
                          <span className="rounded-md bg-primary px-2 py-1 text-sm font-bold text-primary-foreground">
                            {`-${discount}%`}
                          </span>
                        )}
                      </div>
                      {hasDiscount && (
                        <p className="text-base text-muted-foreground line-through mt-1">
                          {formatCDF(product.priceCDF)}
                        </p>
                      )}
                      {savings && (
                        <p className="text-sm font-medium text-success mt-1">
                          {`Vous économisez ${formatCDF(savings)}`}
                        </p>
                      )}
                      {product.priceUSD && (
                        <p className="text-sm text-muted-foreground mt-1">
                          ~ {formatUSD(product.priceUSD)}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Stock indicator */}
              <div className="mb-5">
                {isOutOfStock ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-destructive font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {"Rupture de stock"}
                  </span>
                ) : product.quantity <= 5 ? (
                  // Scarcity cue (Phase D): low stock — nudge urgency.
                  <span className="inline-flex items-center gap-1.5 text-sm text-warning font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
                    </svg>
                    {`Plus que ${product.quantity} en stock`}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-success font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {"En stock"} &middot; {`${product.quantity} disponible(s)`}
                  </span>
                )}
              </div>

              {/* Add to Cart (desktop) — hidden on small viewports where the sticky bar shows */}
              {!isOutOfStock && (
                <div className="hidden md:block py-5 border-t border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm text-muted-foreground">{"Quantité"}:</span>
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
                    {"Ajouter au panier"}
                  </Button>

                  {cartFeedback && (
                    <div className="mt-3 flex items-center gap-2 p-3 bg-success-subtle border border-success/20 rounded-lg text-sm text-success">
                      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {"Produit ajouté au panier"}
                    </div>
                  )}
                </div>
              )}

              {/* Trust signals — reassurance in the buy box. COD-only platform,
                  local delivery, approved sellers (no fabricated data). */}
              <ul className="mt-4 space-y-2.5 rounded-lg border border-border bg-surface-muted/40 p-3.5">
                {[
                  { d: 'M3 7h11v8H3V7zm11 2h3l3 3v3h-2m-9 0H8m9 0a2 2 0 11-4 0 2 2 0 014 0zm-9 0a2 2 0 11-4 0 2 2 0 014 0z', t: 'Livraison locale rapide' },
                  { d: 'M2.5 6h19a1 1 0 011 1v10a1 1 0 01-1 1h-19a1 1 0 01-1-1V7a1 1 0 011-1zm9.5 3a3 3 0 100 6 3 3 0 000-6z', t: 'Paiement à la livraison (cash)' },
                  { d: 'M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zm-1 11l4-4-1.4-1.4L11 11.2 9.4 9.6 8 11l3 3z', t: 'Vendeur vérifié' },
                ].map((row) => (
                  <li key={row.t} className="flex items-center gap-2.5 text-sm text-foreground">
                    <svg className="w-5 h-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d={row.d} />
                    </svg>
                    {row.t}
                  </li>
                ))}
              </ul>

              {/* Seller card */}
              <Card padding="sm" className="mt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{"Vendeur"}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {product.seller.businessName}
                  </p>
                  {product.seller.businessName === 'Teka RDC Officiel' ? (
                    <span className="inline-flex items-center gap-0.5 rounded-sm bg-primary-subtle px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                        <path fillRule="evenodd" d="M10 1l2.39 1.74 2.96.01.91 2.81 2.4 1.75-.92 2.81.92 2.81-2.4 1.75-.91 2.81-2.96.01L10 19l-2.39-1.69-2.96-.01-.91-2.81-2.4-1.75.92-2.81L1.34 7.3l2.4-1.75.91-2.81 2.96-.01L10 1zm3.7 6.3a1 1 0 00-1.4-1.4L9 9.18l-1.3-1.3a1 1 0 10-1.4 1.42l2 2a1 1 0 001.4 0l3.99-4z" clipRule="evenodd" />
                      </svg>
                      Officiel
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 rounded-sm bg-success-subtle px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4L8.5 12l6.8-6.7a1 1 0 011.4 0z" clipRule="evenodd" />
                      </svg>
                      Vérifié
                    </span>
                  )}
                </div>
                {/* Direct buyer↔seller chat was retired 2026-05-17; the
                    support link that stood here was removed 2026-07-26 for
                    parity with mobile. Support is reachable from the footer,
                    the account menu and /contact. */}
              </Card>

              {/* Category link */}
              {product.category && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{"Catégorie"}</p>
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
                {"Description"}
              </h2>
              <div className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
                {description}
              </div>
            </Card>
          )}

          {/* Specifications. A spec missing either side would render as a
              half-empty row, so filter before deciding to show the card. */}
          {specs.length > 0 && (
            <Card padding="md" className="mt-4">
              <h2 className="text-base font-semibold text-foreground mb-4 tracking-tight">
                {"Caractéristiques"}
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-x-4">
                {specs.map((spec, i) => (
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
              the resolved UUID from the fetched product instead. The `avis`
              anchor lets the delivered-order page deep-link buyers here to rate. */}
          <div id="avis" className="scroll-mt-24">
            <ProductReviews productId={product.id} />
          </div>

          {/* Cross-sell: same category + price proximity. */}
          <RelatedProducts productId={product.id} />

          {/* Recently viewed (client-local), excluding the current product. */}
          <RecentlyViewed excludeId={product.id} />
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
              {"Ajouter au panier"}
            </Button>
          </div>
          {cartFeedback && (
            <div className="px-3 pb-3 -mt-1 text-xs text-success font-medium text-center">
              ✓ {"Produit ajouté au panier"}
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
