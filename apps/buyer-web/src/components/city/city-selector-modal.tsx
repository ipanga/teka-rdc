'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCityStore, type City } from '@/lib/city-store';
import { useSelectTown } from '@/lib/use-select-town';
import { cityAccentClasses } from '@/lib/city-accent';

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z" />
    </svg>
  );
}

/**
 * Town selector — mounted ONCE globally in the root layout (so the header
 * "Livrer à …" button opens it on every page, not just the homepage). Renders
 * null until `showSelector` is set, so it has no SSR/SEO footprint.
 *
 * Compact, premium, searchable picker: a search field keeps it usable as the
 * town list grows (10 / 50+ towns), province grouping, a strong town-accent
 * selected state, full keyboard/screen-reader support, and a mobile bottom-sheet.
 * Selecting a town goes through `useSelectTown` (persist + centralized routing).
 */
export function CitySelectorModal() {
  const { selectedCity, cities, isLoading, showSelector, fetchCities, closeSelector } =
    useCityStore();
  const selectTown = useSelectTown();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cities.length === 0) fetchCities();
  }, [cities.length, fetchCities]);

  // On open: lock body scroll, focus the search, close on ESC. On close: reset query.
  useEffect(() => {
    if (!showSelector) {
      setQuery('');
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => searchRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSelector();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showSelector, closeSelector]);

  // Active towns, filtered by the search query, grouped by province.
  const grouped = useMemo<[string, City[]][]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = cities.filter(
      (c) =>
        c.isActive &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.province.toLowerCase().includes(q)),
    );
    const map = new Map<string, City[]>();
    for (const c of filtered) {
      const list = map.get(c.province) ?? [];
      list.push(c);
      map.set(c.province, list);
    }
    return Array.from(map.entries());
  }, [cities, query]);

  if (!showSelector) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={closeSelector}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="city-modal-title"
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — clean, no oversized red block */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <PinIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2
                id="city-modal-title"
                className="truncate text-base font-bold text-foreground"
              >
                {"Choisissez votre ville de livraison"}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {"Pour vous montrer les produits disponibles près de chez vous"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSelector}
            aria-label={"Fermer"}
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search — keeps the picker usable as the town list grows */}
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={"Rechercher une ville…"}
              aria-label={"Rechercher une ville…"}
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : grouped.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {"Aucune ville trouvée"}
            </p>
          ) : (
            grouped.map(([province, list]) => (
              <div key={province} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {province}
                </p>
                <ul role="listbox" aria-label={province}>
                  {list.map((city) => {
                    const isSelected = selectedCity?.id === city.id;
                    const acc = cityAccentClasses(city);
                    return (
                      <li key={city.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => selectTown(city)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isSelected
                              ? `${acc.surface} font-semibold`
                              : 'text-foreground hover:bg-surface-muted'
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                              isSelected ? 'bg-white/60' : 'bg-surface-muted'
                            }`}
                          >
                            <PinIcon className="h-4 w-4" />
                          </span>
                          <span className="flex-1 text-sm">{city.name}</span>
                          {isSelected && (
                            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
