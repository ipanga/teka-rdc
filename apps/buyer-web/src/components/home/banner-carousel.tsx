'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useCityStore } from '@/lib/city-store';
import type { Banner } from '@/lib/types';

const AUTO_ADVANCE_MS = 5000;

interface BannerCarouselProps {
  /** Fallback content to render when no banners are available (e.g. static hero) */
  fallback?: ReactNode;
}

export function BannerCarousel({ fallback }: BannerCarouselProps) {
  const t = useTranslations('Banners');
  const router = useRouter();
  const selectedCity = useCityStore((s) => s.selectedCity);

  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch banners on mount
  useEffect(() => {
    apiFetch<Banner[]>('/v1/browse/banners')
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        setBanners(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Scroll to the current index
  const scrollToIndex = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const width = container.offsetWidth;
    container.scrollTo({ left: width * index, behavior: 'smooth' });
  }, []);

  // Auto-advance timer
  useEffect(() => {
    if (banners.length <= 1 || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % banners.length;
        scrollToIndex(next);
        return next;
      });
    }, AUTO_ADVANCE_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [banners.length, isPaused, scrollToIndex]);

  // Handle scroll snap event to sync dot indicators
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;

    function handleScroll() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (!container) return;
        const width = container.offsetWidth;
        if (width === 0) return;
        const index = Math.round(container.scrollLeft / width);
        setCurrentIndex(index);
      }, 100);
    }

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [banners.length]);

  // Handle banner click navigation
  function handleBannerClick(banner: Banner) {
    if (!banner.linkType || !banner.linkTarget) return;

    const citySlug = selectedCity?.slug;
    switch (banner.linkType) {
      case 'product':
        // /<id-or-slug>: the /[ville] dispatcher resolves UUID/shortCode/slug
        // and 308s to the canonical /{ville}/{slug}-{shortCode}. Admin-stored
        // UUIDs (legacy) and slugs both work.
        router.push(`/${banner.linkTarget}`);
        break;
      case 'category':
        // City-scoped category since 2026-06-06. Navigate straight to the
        // selected city's scoped page when known (avoids the 308 to the
        // default city); the route resolves UUID or slug.
        router.push(
          citySlug
            ? `/${citySlug}/categorie/${banner.linkTarget}`
            : `/categorie/${banner.linkTarget}`,
        );
        break;
      case 'url':
        if (banner.linkTarget) {
          window.open(banner.linkTarget, '_blank', 'noopener,noreferrer');
        }
        break;
      case 'promotion':
        // No bare /products route exists — send shoppers to the category index
        // (was /products, which 404'd).
        router.push('/categories');
        break;
    }
  }

  // Go to a specific dot
  function goToDot(index: number) {
    setCurrentIndex(index);
    scrollToIndex(index);
  }

  // Don't render anything if loading or no banners
  if (loading) {
    return (
      <div className="w-full aspect-[4/3] md:aspect-[16/6] bg-muted animate-pulse" />
    );
  }

  if (banners.length === 0) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <section
      className="relative w-full overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Scrollable container with CSS scroll-snap */}
      <div
        ref={scrollRef}
        className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {banners.map((banner) => {
          const title = banner.title;
          const subtitle = banner.subtitle ?? null;
          const hasLink = banner.linkType && banner.linkTarget;

          return (
            <div
              key={banner.id}
              className={`relative w-full flex-shrink-0 snap-start aspect-[4/3] md:aspect-[16/6] ${
                hasLink ? 'cursor-pointer' : ''
              }`}
              onClick={() => handleBannerClick(banner)}
              role={hasLink ? 'link' : undefined}
              tabIndex={hasLink ? 0 : undefined}
              onKeyDown={(e) => {
                if (hasLink && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleBannerClick(banner);
                }
              }}
            >
              {/* Banner image */}
              <Image
                src={banner.imageUrl}
                alt={title}
                fill
                sizes="100vw"
                className="object-cover"
                priority={banners.indexOf(banner) === 0}
              />

              {/* Dark gradient overlay at bottom (Rakuten-style soft, longer fade) */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />

              {/* Title/subtitle overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-10 text-white max-w-4xl">
                <h2 className="text-xl md:text-4xl font-bold mb-1 md:mb-3 tracking-tight line-clamp-2">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-sm md:text-lg opacity-90 line-clamp-2 mb-3 md:mb-4">
                    {subtitle}
                  </p>
                )}
                {hasLink && (
                  <span className="inline-flex items-center gap-2 text-sm md:text-base font-semibold bg-primary hover:bg-primary-hover text-primary-foreground px-4 py-2 md:px-6 md:py-2.5 rounded-lg shadow-md transition-colors">
                    {t('shopNow')} <span aria-hidden>→</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dot indicators */}
      {banners.length > 1 && (
        <div className="absolute bottom-3 md:bottom-5 right-4 md:right-8 flex items-center gap-1.5">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                goToDot(index);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'bg-white w-6 md:w-8'
                  : 'bg-white/50 hover:bg-white/80 w-1.5'
              }`}
              aria-label={`Slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
