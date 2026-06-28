'use client';

import { useState, useEffect, useRef, FormEvent, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { productHref, categoryHref } from '@/lib/urls';

interface SuggestProduct {
  id: string;
  title: string;
  slug?: string | null;
  shortCode?: string | null;
  citySlug?: string | null;
  thumbnailUrl?: string | null;
}
interface SuggestCategory {
  id: string;
  name: string;
  slug?: string | null;
}
interface SuggestBrand {
  id: string;
  name: string;
  slug?: string | null;
}
interface Suggestions {
  products: SuggestProduct[];
  categories: SuggestCategory[];
  brands: SuggestBrand[];
}

// Recent searches (client-local, max 8, most-recent first).
const RECENT_KEY = 'teka_recent_searches';
function getRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function addRecent(term: string): string[] {
  const t = term.trim();
  if (!t || typeof window === 'undefined') return getRecent();
  const next = [t, ...getRecent().filter((e) => e.toLowerCase() !== t.toLowerCase())].slice(0, 8);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

/**
 * Header search with a debounced autocomplete dropdown (top relevant products +
 * matching categories from /v1/browse/search/suggestions). Enter / submit goes
 * to the full /recherche page; clicking a suggestion deep-links. Keyboard:
 * ↑/↓ to move, Enter to open, Esc to close.
 */
export function SearchAutocomplete({
  cityId,
  citySlug,
  placeholder,
  categoryLabel,
  onNavigate,
}: {
  cityId?: string | null;
  citySlug?: string | null;
  placeholder: string;
  categoryLabel: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sug, setSug] = useState<Suggestions>({ products: [], categories: [], brands: [] });
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Discovery state (recent local + popular API) for the empty/focused dropdown.
  useEffect(() => {
    setRecent(getRecent());
    const params = new URLSearchParams();
    if (cityId) params.set('cityId', cityId);
    apiFetch<{ term: string }[]>(`/v1/browse/search/popular?${params.toString()}`)
      .then((res) => setPopular((res.data ?? []).map((r) => r.term).filter(Boolean)))
      .catch(() => setPopular([]));
  }, [cityId]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSug({ products: [], categories: [], brands: [] });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: term });
      if (cityId) params.set('cityId', cityId);
      apiFetch<Suggestions>(`/v1/browse/search/suggestions?${params.toString()}`)
        .then((res) => {
          if (cancelled) return;
          setSug({ products: res.data.products ?? [], categories: res.data.categories ?? [], brands: res.data.brands ?? [] });
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) setSug({ products: [], categories: [], brands: [] });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, cityId]);

  const showDiscovery = q.trim().length < 2 && (recent.length > 0 || popular.length > 0);

  function runTerm(term: string) {
    setRecent(addRecent(term));
    setOpen(false);
    onNavigate?.();
    router.push(`/recherche?q=${encodeURIComponent(term)}`);
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const items = [
    ...sug.products.map((p) => ({ kind: 'product' as const, product: p })),
    ...sug.categories.map((c) => ({ kind: 'category' as const, category: c })),
    ...sug.brands.map((b) => ({ kind: 'brand' as const, brand: b })),
  ];

  function goToSearch(e?: FormEvent) {
    e?.preventDefault();
    const term = q.trim();
    if (!term) return;
    setRecent(addRecent(term));
    setOpen(false);
    onNavigate?.();
    router.push(`/recherche?q=${encodeURIComponent(term)}`);
  }
  function goBrand(b: SuggestBrand) {
    runTerm(b.name);
  }
  function goProduct(p: SuggestProduct) {
    setOpen(false);
    onNavigate?.();
    router.push(
      productHref({
        id: p.id,
        slug: p.slug,
        shortCode: p.shortCode,
        citySlug: p.citySlug,
      }),
    );
  }
  function goCategory(c: SuggestCategory) {
    setOpen(false);
    onNavigate?.();
    router.push(categoryHref(citySlug, { slug: c.slug, id: c.id }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) {
      if (e.key === 'Enter') goToSearch();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) {
        const it = items[active];
        if (it.kind === 'product') goProduct(it.product);
        else if (it.kind === 'category') goCategory(it.category);
        else goBrand(it.brand);
      } else {
        goToSearch();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <form
        onSubmit={goToSearch}
        className="flex h-11 items-center overflow-hidden rounded-full bg-surface-muted p-1 ring-1 ring-transparent transition-all focus-within:bg-white focus-within:ring-primary/35 md:h-12"
      >
        <div className="relative h-full min-w-0 flex-1">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground/80"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (items.length > 0 || showDiscovery) setOpen(true);
            }}
            placeholder={placeholder}
            autoComplete="off"
            className="h-full w-full border-0 bg-transparent pl-12 pr-4 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none md:text-base"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-full shrink-0 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:px-6 md:text-base"
          aria-label="Rechercher"
        >
          <span className="hidden md:inline">Rechercher</span>
          <svg className="h-5 w-5 md:hidden" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m1.7-5.3a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </form>

      {/* Discovery dropdown (empty box): recent + popular searches. */}
      {open && showDiscovery && items.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-lg shadow-lg overflow-hidden py-1">
          {recent.length > 0 && (
            <div className="px-3 pt-1.5 pb-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Recherches récentes</span>
                <button
                  type="button"
                  onClick={() => {
                    try { window.localStorage.removeItem(RECENT_KEY); } catch {}
                    setRecent([]);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-primary"
                >
                  Effacer
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((t) => (
                  <button
                    key={`r-${t}`}
                    type="button"
                    onClick={() => runTerm(t)}
                    className="px-2.5 py-1 text-xs rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          {popular.length > 0 && (
            <div className="px-3 pt-1.5 pb-2 border-t border-border mt-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Recherches populaires</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {popular.map((t) => (
                  <button
                    key={`p-${t}`}
                    type="button"
                    onClick={() => runTerm(t)}
                    className="px-2.5 py-1 text-xs rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {open && items.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-lg shadow-lg overflow-hidden">
          {sug.products.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => goProduct(p)}
              className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                active === i ? 'bg-muted' : 'hover:bg-muted'
              }`}
            >
              {p.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.thumbnailUrl}
                  alt=""
                  className="w-8 h-8 rounded object-cover bg-muted flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-muted flex-shrink-0" />
              )}
              <span className="text-sm text-foreground truncate">{p.title}</span>
            </button>
          ))}

          {sug.categories.length > 0 && (
            <div className="border-t border-border">
              {sug.categories.map((c, j) => {
                const idx = sug.products.length + j;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => goCategory(c)}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${
                      active === idx ? 'bg-muted' : 'hover:bg-muted'
                    }`}
                  >
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex-shrink-0">
                      {categoryLabel}
                    </span>
                    <span className="text-sm text-foreground truncate">
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {sug.brands.length > 0 && (
            <div className="border-t border-border">
              {sug.brands.map((b, k) => {
                const idx = sug.products.length + sug.categories.length + k;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => goBrand(b)}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${
                      active === idx ? 'bg-muted' : 'hover:bg-muted'
                    }`}
                  >
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex-shrink-0">
                      Marque
                    </span>
                    <span className="text-sm text-foreground truncate">
                      {b.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
