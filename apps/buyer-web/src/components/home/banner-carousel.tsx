'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api-client';
import { getLocalizedName } from '@/lib/format';
import type { Banner } from '@/lib/types';

const AUTO_ADVANCE_MS = 5000;

interface BannerCarouselProps {
  /** Fallback content to render when no banners are available (e.g. static hero) */
  fallback?: ReactNode;
}

export function BannerCarousel({ fallback }: BannerCarouselProps) {
  const t = useTranslations('Banners');
  const locale = useLocale();
  const router = useRouter();

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

    switch (banner.linkType) {
      case 'product':
        router.push(`/products/${banner.linkTarget}`);
        break;
      case 'category':
        // /categorie/<id-or-slug>: the route fetches by /v1/browse/categories/<identifier>
        // which accepts UUID or slug, so admin-stored UUIDs (legacy) and
        // slugs (new) both resolve correctly.
        router.push(`/categorie/${banner.linkTarget}`);
        break;
      case 'url':
        if (banner.linkTarget) {
          window.open(banner.linkTarget, '_blank', 'noopener,noreferrer');
        }
        break;
      case 'promotion':
        router.push('/products');
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
      <div className="w-full h-[200px] md:h-[400px] bg-muted animate-pulse" />
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
          const title = getLocalizedName(banner.title, locale);
          const subtitle = banner.subtitle
            ? getLocalizedName(banner.subtitle, locale)
            : null;
          const hasLink = banner.linkType && banner.linkTarget;

          return (
            <div
              key={banner.id}
              className={`relative w-full flex-shrink-0 snap-start h-[200px] md:h-[400px] ${
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

              {/* Dark gradient overlay at bottom */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              {/* Title/subtitle overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 text-white">
                <h2 className="text-lg md:text-3xl font-bold mb-1 md:mb-2 line-clamp-2">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-sm md:text-lg opacity-90 line-clamp-2">
                    {subtitle}
                  </p>
                )}
                {hasLink && (
                  <span className="inline-block mt-2 md:mt-3 text-xs md:text-sm font-medium bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1.5 md:px-4 md:py-2 rounded-lg transition-colors">
                    {t('shopNow')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dot indicators */}
      {banners.length > 1 && (
        <div className="absolute bottom-3 md:bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                goToDot(index);
              }}
              className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'bg-white w-5 md:w-6'
                  : 'bg-white/50 hover:bg-white/80'
              }`}
              aria-label={`Slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
