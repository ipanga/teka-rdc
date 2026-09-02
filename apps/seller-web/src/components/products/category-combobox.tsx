'use client';

import { useMemo, useRef, useState, useEffect } from 'react';

export interface ComboCategory {
  id: string;
  name: string;
  children?: ComboCategory[];
  subcategories?: ComboCategory[];
}

interface FlatNode {
  id: string;
  label: string;
  parentLabel: string | null;
  depth: number;
  /** Product type. Only leaves are selectable; branches exist for labelling. */
  isLeaf: boolean;
}

// Accent + case insensitive so "tele" matches "Téléphones", "chauss" matches
// "Chaussures", etc. — essential for the French taxonomy.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function flatten(
  cats: ComboCategory[],
  depth = 0,
  parentLabel: string | null = null,
): FlatNode[] {
  const out: FlatNode[] = [];
  for (const c of cats) {
    const label = c.name || '---';
    const kids = c.children || c.subcategories || [];
    // Every node is flattened, but only leaves are SELECTABLE (see `options`).
    // Branches must stay in the list so a legacy product already sitting on an
    // intermediate node can still show its category name instead of falling
    // back to the "Sélectionner une catégorie" placeholder.
    out.push({ id: c.id, label, parentLabel, depth, isLeaf: !kids.length });
    // Pass the FULL path down so a product type reads e.g.
    // "Téléphones & Accessoires › Smartphones › Android" (not just its parent).
    const path = parentLabel ? `${parentLabel} › ${label}` : label;
    if (kids.length) out.push(...flatten(kids, depth + 1, path));
  }
  return out;
}

interface Props {
  categories: ComboCategory[];
  value: string;
  onChange: (id: string) => void;
  hasError?: boolean;
  disabled?: boolean;
}

/**
 * Searchable category/subcategory picker. The full taxonomy (7 categories →
 * 80+ subcategories) is already loaded client-side, so filtering is purely
 * local — no API traffic. Replaces a long native <select>.
 *
 * - Empty query → the full tree, indented by depth (parents + children).
 * - Non-empty   → flat matches across category AND subcategory names, each
 *                 subcategory shown with its parent for context.
 * - Keyboard: ↑/↓ move, Enter select, Esc close. Click/tap also works.
 */
export default function CategoryCombobox({
  categories,
  value,
  onChange,
  hasError,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const flat = useMemo(() => flatten(categories), [categories]);
  const selected = useMemo(
    () => flat.find((n) => n.id === value) ?? null,
    [flat, value],
  );

  // LEAF-ONLY selection: attributes attach to the product type, so a product on
  // an intermediate node inherits that node's legacy rows instead (« Mode >
  // Homme » still carries "Type de peau"). seller-mobile already restricted to
  // leaves; this closes the divergence. The API rejects a non-leaf either way.
  const options = useMemo(() => flat.filter((n) => n.isLeaf), [flat]);

  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter(
      (n) =>
        normalize(n.label).includes(q) ||
        (n.parentLabel ? normalize(n.parentLabel).includes(q) : false),
    );
  }, [options, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Focus the search field + reset highlight when opening.
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Keep the highlight in range as results shrink.
  useEffect(() => {
    setActiveIdx((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  // Scroll the highlighted option into view on keyboard nav.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[activeIdx];
      if (r) choose(r.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg bg-background text-left focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${
          hasError ? 'border-destructive' : 'border-input'
        }`}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected
            ? selected.parentLabel
              ? `${selected.parentLabel} › ${selected.label}`
              : selected.label
            : 'Sélectionner une catégorie'}
        </span>
        <span className="text-muted-foreground ml-2" aria-hidden>
          ▾
        </span>
      </button>

      {/* Legacy products still sit on an intermediate node. Their category is
          shown (so the field is never mysteriously blank) but it is no longer a
          valid choice, and the API serves no attributes for it — so the
          « Caractéristiques » block reads "Aucune caractéristique" with no
          explanation unless we say why here. */}
      {selected && !selected.isLeaf && (
        <p className="mt-1 text-xs text-amber-700" role="status">
          Ce produit utilise une ancienne catégorie. Sélectionnez une catégorie
          plus précise pour modifier ses caractéristiques.
        </p>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-lg shadow-lg">
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Rechercher une catégorie..."
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-64 overflow-y-auto py-1"
          >
            {results.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground text-center">
                Aucune catégorie trouvée
              </li>
            ) : (
              results.map((n, i) => (
                <li key={n.id} role="option" aria-selected={n.id === value}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => choose(n.id)}
                    style={
                      query
                        ? undefined
                        : { paddingLeft: `${12 + n.depth * 16}px` }
                    }
                    className={`w-full text-left px-3 py-2 text-sm ${
                      i === activeIdx ? 'bg-primary/10' : ''
                    } ${
                      n.id === value
                        ? 'font-medium text-primary'
                        : 'text-foreground'
                    } ${!query && n.depth === 0 ? 'font-medium' : ''}`}
                  >
                    {query && n.parentLabel ? (
                      <span>
                        <span className="text-muted-foreground">
                          {n.parentLabel} ›{' '}
                        </span>
                        {n.label}
                      </span>
                    ) : (
                      <span>{n.label}</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
