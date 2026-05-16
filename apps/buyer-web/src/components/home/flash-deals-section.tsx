'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Badge, Container, SectionHeader } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';
import { formatCDF } from '@/lib/format';
import type { FlashDeal } from '@/lib/types';

/**
 * Calculate the discounted price in centimes (BigInt string).
 */
function calcDiscountedPrice(
  originalCentimes: string,
  discountPercent?: number | null,
  discountCDF?: string | null,
): string {
  const original = Number(originalCentimes);
  if (discountCDF) {
    const discount = Number(discountCDF);
    const result = Math.max(original - discount, 0);
    return String(result);
  }
  if (discountPercent) {
    const result = Math.round(original * (1 - discountPercent / 100));
    return String(Math.max(result, 0));
  }
  return originalCentimes;
}

/**
 * Format remaining time as HH:MM:SS.
 */
function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '00:00:00';

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

function CountdownTimer({ endsAt }: { endsAt: string }) {
  const t = useTranslations('FlashDeals');
  const [remaining, setRemaining] = useState<string>('');

  useEffect(() => {
    function update() {
      const diff = new Date(endsAt).getTime() - Date.now();
      setRemaining(formatCountdown(diff));
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (!remaining) return null;

  return (
    <div className="inline-flex items-center gap-1 text-xs text-primary font-semibold tabular-nums">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      <span>{t('endsIn')} {remaining}</span>
    </div>
  );
}

export function FlashDealsSection() {
  const t = useTranslations('FlashDeals');

  const [deals, setDeals] = useState<FlashDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<FlashDeal[]>('/v1/browse/flash-deals')
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        // Filter to only active deals (endsAt in the future)
        const active = data.filter(
          (deal) => new Date(deal.endsAt).getTime() > Date.now(),
        );
        setDeals(active);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Scroll helpers
  const scrollBy = useCallback((direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollAmount = container.offsetWidth * 0.8;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  if (loading) {
    return (
      <section className="bg-background">
        <Container className="py-8 md:py-12">
          <div className="h-7 bg-muted rounded w-40 animate-pulse mb-4" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-40 md:w-52 bg-surface rounded-xl border border-border p-3 animate-pulse"
              >
                <div className="aspect-square bg-muted rounded mb-3" />
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (deals.length === 0) {
    return null;
  }

  return (
    <section className="bg-background border-y border-border">
      <Container className="py-8 md:py-12">
        {/* Section header — flash bolt + title left, "see all" right */}
        <div className="flex items-end justify-between gap-4 mb-4 md:mb-6">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary text-primary-foreground shadow-sm"
              aria-hidden
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </span>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">
              {t('title')}
            </h2>
          </div>
          <Link
            href="/products"
            className="text-sm font-medium text-primary hover:text-primary-hover hover:underline underline-offset-4 whitespace-nowrap"
          >
            {t('seeAll')} <span aria-hidden>→</span>
          </Link>
        </div>

        {/* Scrollable row */}
        <div className="relative group">
          {/* Left arrow (desktop only) */}
          {deals.length > 3 && (
            <button
              onClick={() => scrollBy('left')}
              className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-9 h-9 items-center justify-center bg-surface border border-border rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-hover hover:border-border-strong"
              aria-label="Scroll left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <div
            ref={scrollContainerRef}
            className="flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory pb-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {deals.map((deal) => {
              const title = deal.product.title;
              const originalPrice = deal.product.priceCDF;
              const discountedPrice = calcDiscountedPrice(
                originalPrice,
                deal.discountPercent,
                deal.discountCDF,
              );
              const imageUrl = deal.product.images?.[0]?.url;
              const hasDiscount =
                deal.discountPercent != null || deal.discountCDF != null;

              return (
                <Link
                  key={deal.id}
                  href={`/${deal.product.slug || deal.product.id}`}
                  className="group/card flex-shrink-0 w-44 md:w-56 snap-start bg-surface rounded-xl border border-border overflow-hidden shadow-xs hover:shadow-lg hover:border-border-strong transition-all duration-200 hover:-translate-y-0.5"
                >
                  {/* Product image */}
                  <div className="relative aspect-square bg-surface-muted overflow-hidden">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        sizes="(max-width: 768px) 176px, 224px"
                        className="object-cover group-hover/card:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}

                    {/* Discount badge top-left */}
                    {hasDiscount && deal.discountPercent && (
                      <Badge variant="discount" size="md" className="absolute top-2 left-2 shadow-sm">
                        -{deal.discountPercent}%
                      </Badge>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 space-y-2">
                    <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem] leading-snug">
                      {title}
                    </h3>

                    {/* Pricing */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-lg font-bold text-primary tracking-tight">
                        {formatCDF(discountedPrice)}
                      </span>
                      {hasDiscount && originalPrice !== discountedPrice && (
                        <span className="text-xs text-muted-foreground line-through">
                          {formatCDF(originalPrice)}
                        </span>
                      )}
                    </div>

                    {/* Countdown */}
                    <CountdownTimer endsAt={deal.endsAt} />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Right arrow (desktop only) */}
          {deals.length > 3 && (
            <button
              onClick={() => scrollBy('right')}
              className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-9 h-9 items-center justify-center bg-surface border border-border rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-hover hover:border-border-strong"
              aria-label="Scroll right"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </Container>
    </section>
  );
}
