'use client';

import { useState, useEffect, useRef } from 'react';

export interface SearchOption {
  id: string;
  label: string;
  sublabel?: string;
}

/**
 * Debounced typeahead used by the notification center to pick a linked product
 * or specific buyers — no manual id entry. The caller supplies the async
 * `search` fn (which hits the relevant admin/browse endpoint) and handles the
 * selection. Renders an input + a results dropdown; closes on outside click.
 */
export function SearchSelect({
  placeholder,
  search,
  onSelect,
}: {
  placeholder: string;
  search: (query: string) => Promise<SearchOption[]>;
  onSelect: (option: SearchOption) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await search(q);
        if (!cancelled) {
          setResults(r);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, search]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      {open && (loading || results.length > 0) && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-border rounded-lg shadow-lg max-h-56 overflow-auto">
          {loading && results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Recherche...
            </div>
          ) : (
            results.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onSelect(o);
                  setQuery('');
                  setResults([]);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex flex-col"
              >
                <span className="text-foreground">{o.label}</span>
                {o.sublabel && (
                  <span className="text-xs text-muted-foreground">
                    {o.sublabel}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
