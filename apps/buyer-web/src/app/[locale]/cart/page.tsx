'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { CartItemRow } from '@/components/cart/cart-item-row';
import { useCartStore } from '@/lib/cart-store';
import { useAuthStore } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api-client';
import { formatCDF, getLocalizedName } from '@/lib/format';
import type { Cart, CartItem, GuestCartItem, BrowseProduct } from '@/lib/types';

export default function CartPage() {
  const t = useTranslations('Cart');
  const tProducts = useTranslations('Products');
  const locale = useLocale();
  const user = useAuthStore((s) => s.user);
  const isLoadingAuth = useAuthStore((s) => s.isLoading);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // For authenticated users, subscribe to cart store
  const storeItems = useCartStore((s) => s.items);
  const storeLoading = useCartStore((s) => s.isLoading);
  const fetchCart = useCartStore((s) => s.fetchCart);

  useEffect(() => {
    if (isLoadingAuth) return;

    if (user) {
      // Authenticated: fetch cart from API
      fetchCart().then(() => setIsLoading(false));
    } else {
      // Guest: load from localStorage and hydrate product info
      loadGuestCart();
    }
  }, [user, isLoadingAuth, fetchCart]);

  // Keep local state in sync with store for auth users
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

      // Fetch product details for each guest item
      const hydratedItems: CartItem[] = [];
      for (const gi of guestItems) {
        try {
          const res = await apiFetch<BrowseProduct>(`/v1/browse/products/${gi.productId}`);
          const p = res.data;
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
              image: p.image,
              seller: p.seller,
            },
          });
        } catch {
          // Product may no longer exist, skip
        }
      }
      setCartItems(hydratedItems);
    } catch {
      setCartItems([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Group items by seller
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

  // Total in centimes
  const totalCDF = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      return sum + BigInt(item.product.priceCDF) * BigInt(item.quantity);
    }, BigInt(0));
  }, [cartItems]);

  const totalItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  if (isLoading || isLoadingAuth) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-48" />
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
        <h1 className="text-xl md:text-2xl font-bold text-foreground mb-6">
          {t('title')} {totalItemCount > 0 && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({t('itemCount', { count: totalItemCount })})
            </span>
          )}
        </h1>

        {cartItems.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16">
            <svg
              className="w-20 h-20 text-muted-foreground/50 mb-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
              />
            </svg>
            <p className="text-muted-foreground mb-4">{t('empty')}</p>
            <Link
              href="/categories"
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t('emptyAction')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cart items grouped by seller */}
            <div className="lg:col-span-2 space-y-6">
              {Object.entries(itemsBySeller).map(([sellerId, group]) => {
                const sellerSubtotal = group.items.reduce(
                  (sum, item) =>
                    sum + BigInt(item.product.priceCDF) * BigInt(item.quantity),
                  BigInt(0),
                );

                return (
                  <div key={sellerId} className="bg-white rounded-lg border border-border p-4">
                    {/* Seller header */}
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
                      </svg>
                      <span className="text-sm font-medium text-foreground">
                        {t('seller')}: {group.sellerName}
                      </span>
                    </div>

                    {/* Items */}
                    {group.items.map((item) => (
                      <CartItemRow key={item.productId} item={item} />
                    ))}

                    {/* Seller subtotal */}
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-border">
                      <span className="text-sm text-muted-foreground">{t('subtotal')}</span>
                      <span className="text-sm font-semibold text-foreground">
                        {formatCDF(sellerSubtotal.toString())}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Order summary sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg border border-border p-4 sticky top-20">
                <h2 className="text-base font-semibold text-foreground mb-4">
                  {t('total')}
                </h2>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      {t('subtotal')} ({t('itemCount', { count: totalItemCount })})
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {formatCDF(totalCDF.toString())}
                    </span>
                  </div>

                  <div className="border-t border-border pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-semibold text-foreground">{t('total')}</span>
                      <span className="text-lg font-bold text-primary">
                        {formatCDF(totalCDF.toString())}
                      </span>
                    </div>
                  </div>
                </div>

                {user ? (
                  <Link
                    href="/checkout"
                    className="mt-4 w-full flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    {t('checkout')}
                  </Link>
                ) : (
                  <Link
                    href="/login?redirect=/cart"
                    className="mt-4 w-full flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    {t('checkout')}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
