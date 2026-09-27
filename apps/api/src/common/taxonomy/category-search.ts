/**
 * Seller category search (Seller Catalogue Speed-up, 2026-09-27).
 *
 * A seller types what is on the shelf — « omo », « savon poudre », « bebe »,
 * « cereales » — and must land on the right PRODUCT TYPE (a leaf category;
 * products may only attach to a leaf). Pure and deterministic so it is unit
 * tested without a database; `BrowseService.searchCategories` feeds it an
 * in-memory index of live leaves.
 *
 * Three independent sources, one source of truth each:
 *   - the category's own name and its full path (Supermarché › … › Lessive);
 *   - `Category.searchKeywords` — invisible aliases (admin-edited);
 *   - the names of brands linked to the leaf (`BrandCategory`), so « omo »
 *     finds Lessive through the Omo brand without any brand being hard-coded.
 * `SearchSynonym` is deliberately NOT used: it expands PRODUCT text search and
 * has no category relation.
 *
 * Matching: every query token must match (as a word prefix) some word of the
 * leaf's name, path, aliases or brands. Accents, case, punctuation and extra
 * whitespace are ignored, and a trailing plural « s »/« x » is folded.
 *
 * Ranking (lower tier first), adapted from the requested priority:
 *   0 exact name · 1 name covers the query · 2 exact alias · 3 one alias covers
 *   the query · 4 one brand covers the query · 5 the path covers the query ·
 *   6 the tokens are spread across several sources.
 * Ties break on tree order (the taxonomy's own sortOrder walk), then name.
 */

export interface CategorySearchLeaf {
  id: string;
  name: string;
  /** Names from the root to the leaf, leaf included. */
  path: string[];
  keywords: string[];
  brands: string[];
  /** Position in a depth-first, sortOrder-ordered walk of the tree. */
  treeOrder: number;
}

export type CategoryMatchSource = 'name' | 'keyword' | 'brand' | 'path' | 'mixed';

export interface CategorySearchHit {
  id: string;
  name: string;
  path: string[];
  matchedBy: CategoryMatchSource;
}

export const CATEGORY_SEARCH_MIN_LENGTH = 2;

/** Lower-case, accent-free, punctuation-free, single-spaced. */
export function normalizeCategoryText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Folds a trailing plural so « savons » ≡ « savon », « céréales » ≡ « cereale ». */
function stem(token: string): string {
  if (token.length > 3 && (token.endsWith('s') || token.endsWith('x'))) {
    return token.slice(0, -1);
  }
  return token;
}

export function categorySearchTokens(input: string): string[] {
  return normalizeCategoryText(input).split(' ').filter(Boolean).map(stem);
}

/** Every query token prefixes some word of the phrase. */
function covers(queryTokens: string[], phraseTokens: string[]): boolean {
  return queryTokens.every((q) => phraseTokens.some((w) => w.startsWith(q)));
}

function sameTokens(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

interface Scored {
  leaf: CategorySearchLeaf;
  tier: number;
  matchedBy: CategoryMatchSource;
}

function score(q: string[], leaf: CategorySearchLeaf): Scored | null {
  const name = categorySearchTokens(leaf.name);
  const keywords = leaf.keywords.map(categorySearchTokens).filter((k) => k.length);
  const brands = leaf.brands.map(categorySearchTokens).filter((b) => b.length);
  const path = leaf.path.flatMap(categorySearchTokens);

  if (sameTokens(q, name)) return { leaf, tier: 0, matchedBy: 'name' };
  if (covers(q, name)) return { leaf, tier: 1, matchedBy: 'name' };
  if (keywords.some((k) => sameTokens(q, k))) {
    return { leaf, tier: 2, matchedBy: 'keyword' };
  }
  if (keywords.some((k) => covers(q, k))) {
    return { leaf, tier: 3, matchedBy: 'keyword' };
  }
  if (brands.some((b) => covers(q, b))) return { leaf, tier: 4, matchedBy: 'brand' };
  if (covers(q, path)) return { leaf, tier: 5, matchedBy: 'path' };
  if (covers(q, [...path, ...keywords.flat(), ...brands.flat()])) {
    return { leaf, tier: 6, matchedBy: 'mixed' };
  }
  return null;
}

export function searchCategoryLeaves(
  query: string,
  leaves: CategorySearchLeaf[],
  limit = 20,
): CategorySearchHit[] {
  const q = categorySearchTokens(query);
  if (q.join('').length < CATEGORY_SEARCH_MIN_LENGTH) return [];

  return leaves
    .map((leaf) => score(q, leaf))
    .filter((s): s is Scored => s !== null)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.leaf.treeOrder - b.leaf.treeOrder ||
        a.leaf.name.localeCompare(b.leaf.name, 'fr'),
    )
    .slice(0, limit)
    .map(({ leaf, matchedBy }) => ({
      id: leaf.id,
      name: leaf.name,
      path: leaf.path,
      matchedBy,
    }));
}

/**
 * Canonical storage form for admin-entered aliases: trimmed, single-spaced,
 * case kept as typed (for display in the editor), de-duplicated on the
 * normalized form, empties dropped.
 */
export function cleanCategoryKeywords(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const display = k.trim().replace(/\s+/g, ' ');
    const key = normalizeCategoryText(display);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out;
}
