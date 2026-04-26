'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { apiFetch } from '@/lib/api-client';
import { formatCDF, getLocalizedName } from '@/lib/format';
import type { WishlistItem, PaginatedWishlist } from '@/lib/types';

export default function WishlistPage() {
  const t = useTranslations('Wishlist');
  const tProducts = useTranslations('Products');
  const locale = useLocale();

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchWishlist = useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<PaginatedWishlist>(
        `/v1/wishlist?page=${p}&limit=12`,
      );
      setItems(res.data.data);
      setTotalPages(Math.ceil(res.data.meta.total / res.data.meta.limit) || 1);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWishlist(1);
  }, [fetchWishlist]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchWishlist(newPage);
  }

  async function handleRemove(productId: string) {
    setRemovingId(productId);
    try {
      await apiFetch(`/v1/wishlist/${productId}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.productId !== productId));
    } catch {
      // remove failed
    } finally {
      setRemovingId(null);
    }
  }

  // Skeleton loader
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
          <h1 className="text-xl font-bold text-foreground mb-6">{t('title')}</h1>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-muted rounded-lg mb-2" />
                <div className="h-4 bg-muted rounded w-3/4 mb-1" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            ))}
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
        <h1 className="text-xl font-bold text-foreground mb-6">{t('title')}</h1>

        {items.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16">
            <svg
              className="w-20 h-20 text-muted-foreground mb-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              />
            </svg>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t('empty')}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t('emptyDescription')}
            </p>
            <Link
              href="/"
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t('browseProducts')}
            </Link>
          </div>
        ) : (
          <>
            {/* Product grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((item) => {
                const product = item.product;
                const title = getLocalizedName(product.title, locale);
                const imageUrl = product.image?.thumbnailUrl || product.image?.url;

                return (
                  <div
                    key={item.id}
                    className="group relative bg-white rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow duration-200"
                  >
                    {/* Remove button */}
                    <button
                      onClick={() => handleRemove(item.productId)}
                      disabled={removingId === item.productId}
                      className="absolute top-2 right-2 z-10 p-1.5 bg-white/90 rounded-full shadow-sm hover:bg-white transition-colors disabled:opacity-50"
                      aria-label={t('remove')}
                    >
                      <svg
                        className="w-5 h-5 text-red-500"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                      </svg>
                    </button>

                    <Link href={`/${product.slug || product.id}`}>
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
                          {tProducts(`condition_${product.condition}`)}
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
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  &laquo;
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      p === page
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border hover:bg-muted'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  &raquo;
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
