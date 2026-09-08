'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useCityStore } from '@/lib/city-store';
import { bannerHref } from '@/lib/banner-href';
import type { Banner } from '@/lib/types';

const AUTO_ADVANCE_MS = 5000;

interface BannerCarouselProps {
  /** Fallback content to render when no banners are available (e.g. static hero) */
  fallback?: ReactNode;
  /**
   * Banners the server route already fetched (SEO-1). Undefined = unknown
   * (fetch on mount, render the skeleton meanwhile); an array — even empty —
   * means "known", so the first HTML holds either the banners or the fallback
   * hero with its <h1>, instead of a grey skeleton crawlers cannot read.
   */
  initialBanners?: Banner[];
  /**
   * Page heading to keep when banners replace the hero (SEO-1). Banner titles
   * are <h2>; without this the homepage had no <h1> at all whenever an admin
   * banner existed. Rendered visually hidden — same text as the <title>.
   */
  srTitle?: string;
}

export function BannerCarousel({ fallback, initialBanners, srTitle }: BannerCarouselProps) {
  const selectedCity = useCityStore((s) => s.selectedCity);

  const [banners, setBanners] = useState<Banner[]>(initialBanners ?? []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(initialBanners === undefined);
  const [isPaused, setIsPaused] = useState(false);
  // Banners whose image failed to load (e.g. a stale/broken Cloudinary URL).
  // We drop them so a broken banner gracefully falls back to the hero instead
  // of showing an empty dark box.
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch banners on mount — unless the server already provided them.
  useEffect(() => {
    if (initialBanners !== undefined) return;
    apiFetch<Banner[]>('/v1/browse/banners')
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        setBanners(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [initialBanners]);

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

  // Go to a specific dot
  function goToDot(index: number) {
    setCurrentIndex(index);
    scrollToIndex(index);
  }

  // Drop banners whose image failed → broken banners fall back to the hero.
  const visibleBanners = banners.filter((b) => !failedIds.has(b.id));

  // Don't render anything if loading or no (valid) banners
  if (loading) {
    return (
      <div className="w-full aspect-[4/3] md:aspect-[16/6] bg-muted animate-pulse" />
    );
  }

  if (visibleBanners.length === 0) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <>
      {srTitle && <h1 className="sr-only">{srTitle}</h1>}
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
        {visibleBanners.map((banner) => {
          const title = banner.title;
          const subtitle = banner.subtitle ?? null;
          // A slide with a target is a real link (SEO-2): crawlable href,
          // native keyboard/middle-click behaviour, no router.push.
          const link = bannerHref(banner, selectedCity?.slug);
          const hasLink = link !== null;
          const slideClass =
            'relative block w-full flex-shrink-0 snap-start aspect-[4/3] md:aspect-[16/6]';
          const Slide = ({ children }: { children: ReactNode }) =>
            !link ? (
              <div className={slideClass}>{children}</div>
            ) : link.external ? (
              <a href={link.href} target="_blank" rel="noopener noreferrer" className={slideClass}>
                {children}
              </a>
            ) : (
              <Link href={link.href} className={slideClass}>
                {children}
              </Link>
            );

          return (
            <Slide key={banner.id}>
              {/* Banner image */}
              <Image
                src={banner.imageUrl}
                alt={title}
                fill
                sizes="100vw"
                className="object-cover"
                priority={visibleBanners.indexOf(banner) === 0}
                onError={() =>
                  setFailedIds((prev) => new Set(prev).add(banner.id))
                }
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
                    {"Acheter maintenant"} <span aria-hidden>→</span>
                  </span>
                )}
              </div>
            </Slide>
          );
        })}
      </div>

      {/* Dot indicators */}
      {visibleBanners.length > 1 && (
        <div className="absolute bottom-3 md:bottom-5 right-4 md:right-8 flex items-center gap-1.5">
          {visibleBanners.map((_, index) => (
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
    </>
  );
}
