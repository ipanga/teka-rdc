'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { CartItemRow } from '@/components/cart/cart-item-row';
import { useCartStore } from '@/lib/cart-store';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api-client';
import { formatCDF } from '@/lib/format';
import { Card, Container, buttonVariants } from '@/components/ui';
import type { CartItem, GuestCartItem, ProductDetail } from '@/lib/types';

export default function CartPage() {
  const t = useTranslations('Cart');
  const user = useAuthStore((s) => s.user);
  const isLoadingAuth = useAuthStore((s) => s.isLoading);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const storeItems = useCartStore((s) => s.items);
  const storeLoading = useCartStore((s) => s.isLoading);
  const fetchCart = useCartStore((s) => s.fetchCart);

  useEffect(() => {
    if (isLoadingAuth) return;
    if (user) {
      fetchCart().then(() => setIsLoading(false));
    } else {
      loadGuestCart();
    }
  }, [user, isLoadingAuth, fetchCart]);

  useEffect(() => {
    if (user) {
      setCartItems(storeItems);
      setIsLoading(storeLoading);
    }
  }, [user, storeItems, storeLoading]);

  async function loadGuestCart() {
    try {
      const raw = localStorage.getItem('teka_guest_cart');
      if (!raw) {
        setCartItems([]);
        setIsLoading(false);
        return;
      }
      const parsed = JSON.parse(raw);
      const guestItems: GuestCartItem[] = Array.isArray(parsed?.items) ? parsed.items : [];
      if (guestItems.length === 0) {
        setCartItems([]);
        setIsLoading(false);
        return;
      }

      const hydratedItems: CartItem[] = [];
      for (const gi of guestItems) {
        try {
          // The detail endpoint returns the full `images: ProductImage[]`
          // gallery, not the singular `image` shape used by the product-list
          // endpoint. Pick the first image and reshape it so CartItemRow,
          // which reads `product.image?.thumbnailUrl`, can render the
          // thumbnail (was falling through to the placeholder icon).
          const res = await apiFetch<ProductDetail>(`/v1/browse/products/${gi.productId}`);
          const p = res.data;
          const firstImage = p.images?.[0] ?? null;
          hydratedItems.push({
            productId: gi.productId,
            quantity: Math.min(gi.quantity, p.quantity),
            product: {
              id: p.id,
              title: p.title,
              priceCDF: p.priceCDF,
              priceUSD: p.priceUSD,
              quantity: p.quantity,
              condition: p.condition,
              image: firstImage
                ? { url: firstImage.url, thumbnailUrl: firstImage.thumbnailUrl }
                : null,
              seller: p.seller,
            },
          });
        } catch {
          // skip missing product
        }
      }
      setCartItems(hydratedItems);
    } catch {
      setCartItems([]);
    } finally {
      setIsLoading(false);
    }
  }

  const itemsBySeller = useMemo(() => {
    const grouped: Record<string, { sellerName: string; items: CartItem[] }> = {};
    for (const item of cartItems) {
      const sid = item.product.seller.id;
      if (!grouped[sid]) {
        grouped[sid] = {
          sellerName: item.product.seller.businessName,
          items: [],
        };
      }
      grouped[sid].items.push(item);
    }
    return grouped;
  }, [cartItems]);

  const totalCDF = useMemo(() => {
    return cartItems.reduce(
      (sum, item) => sum + BigInt(item.product.priceCDF) * BigInt(item.quantity),
      BigInt(0),
    );
  }, [cartItems]);

  const totalItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  if (isLoading || isLoadingAuth) {
    return (
      <div className="min-h-screen flex flex-col bg-surface-muted">
        <Header />
        <main className="flex-1">
          <Container className="py-6">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-muted rounded w-48" />
              <div className="h-32 bg-muted rounded-xl" />
              <div className="h-32 bg-muted rounded-xl" />
            </div>
          </Container>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1">
        <Container className="py-6 md:py-10">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-6">
            {t('title')}{' '}
            {totalItemCount > 0 && (
              <span className="text-base font-normal text-muted-foreground ml-2">
                ({t('itemCount', { count: totalItemCount })})
              </span>
            )}
          </h1>

          {cartItems.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-surface-muted mb-4">
                <svg
                  className="w-10 h-10 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                  />
                </svg>
              </div>
              <p className="text-muted-foreground mb-5">{t('empty')}</p>
              <Link href="/categories" className={buttonVariants({ variant: 'default', size: 'lg' })}>
                {t('emptyAction')}
              </Link>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Cart items grouped by seller */}
              <div className="lg:col-span-2 space-y-4">
                {Object.entries(itemsBySeller).map(([sellerId, group]) => {
                  const sellerSubtotal = group.items.reduce(
                    (sum, item) =>
                      sum + BigInt(item.product.priceCDF) * BigInt(item.quantity),
                    BigInt(0),
                  );
                  // Defensive: `sellerName` should always come from
                  // `BrowseSeller.businessName`, but if the API ever returns
                  // an undefined we fall back to a dash rather than crashing
                  // the whole cart. A prior detail-endpoint shape mismatch
                  // surfaced exactly this crash.
                  const safeSellerName = (group.sellerName ?? '').trim();
                  const initial = safeSellerName.charAt(0).toUpperCase() || '?';

                  return (
                    <Card key={sellerId} padding="sm">
                      {/* Seller header */}
                      <div className="flex items-center gap-3 pb-3 border-b border-border">
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-subtle text-primary text-sm font-bold shrink-0"
                          aria-hidden
                        >
                          {initial}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">{t('seller')}</p>
                          <p className="text-sm font-semibold text-foreground truncate">
                            {safeSellerName || '—'}
                          </p>
                        </div>
                      </div>

                      {/* Items */}
                      <div>
                        {group.items.map((item) => (
                          <CartItemRow key={item.productId} item={item} />
                        ))}
                      </div>

                      {/* Seller subtotal */}
                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-border">
                        <span className="text-sm text-muted-foreground">{t('subtotal')}</span>
                        <span className="text-base font-semibold text-foreground">
                          {formatCDF(sellerSubtotal.toString())}
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Order summary sidebar */}
              <div className="lg:col-span-1">
                <Card padding="md" className="sticky top-20">
                  <h2 className="text-lg font-semibold text-foreground tracking-tight mb-4">
                    {t('total')}
                  </h2>

                  <div className="space-y-3 mb-5">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        {t('subtotal')} ({t('itemCount', { count: totalItemCount })})
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {formatCDF(totalCDF.toString())}
                      </span>
                    </div>

                    <div className="border-t border-border pt-3">
                      <div className="flex justify-between items-baseline">
                        <span className="text-base font-semibold text-foreground">{t('total')}</span>
                        <span className="text-2xl font-bold text-primary tracking-tight">
                          {formatCDF(totalCDF.toString())}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={user ? '/paiement' : '/connexion?redirect=/panier'}
                    className={buttonVariants({ variant: 'default', size: 'lg', className: 'w-full' })}
                  >
                    {t('checkout')}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </Card>
              </div>
            </div>
          )}
        </Container>
      </main>

      <Footer />
    </div>
  );
}
