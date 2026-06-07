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
interface Suggestions {
  products: SuggestProduct[];
  categories: SuggestCategory[];
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
  const [sug, setSug] = useState<Suggestions>({ products: [], categories: [] });
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSug({ products: [], categories: [] });
      setOpen(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: term });
      if (cityId) params.set('cityId', cityId);
      apiFetch<Suggestions>(`/v1/browse/search/suggestions?${params.toString()}`)
        .then((res) => {
          if (cancelled) return;
          setSug(res.data);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) setSug({ products: [], categories: [] });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, cityId]);

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
  ];

  function goToSearch(e?: FormEvent) {
    e?.preventDefault();
    const term = q.trim();
    if (!term) return;
    setOpen(false);
    onNavigate?.();
    router.push(`/recherche?q=${encodeURIComponent(term)}`);
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
        else goCategory(it.category);
      } else {
        goToSearch();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={goToSearch}>
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
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
              if (items.length > 0) setOpen(true);
            }}
            placeholder={placeholder}
            autoComplete="off"
            className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>
      </form>

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
        </div>
      )}
    </div>
  );
}
