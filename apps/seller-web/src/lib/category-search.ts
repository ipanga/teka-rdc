/**
 * Seller category picker search (Seller Catalogue Speed-up).
 *
 * The API ranks LEAF categories by name, full path, invisible aliases and
 * linked brands (`GET /v1/browse/categories/search`). While that request is
 * in flight — or if it fails — a local match on the leaf's name + path keeps
 * the list useful. Pure so it is unit tested without a DOM.
 */

export interface SearchableLeaf {
  id: string;
  label: string;
  parentLabel: string | null;
}

export interface CategorySearchHit {
  id: string;
  name: string;
  path: string[];
}

export function normalizeCategoryQuery(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Worth asking the server: at least two meaningful characters. */
export function isSearchableQuery(query: string): boolean {
  return normalizeCategoryQuery(query).replace(/ /g, '').length >= 2;
}

/** Every typed word must appear in the leaf's name or path. */
export function localCategoryMatches<T extends SearchableLeaf>(
  leaves: T[],
  query: string,
): T[] {
  const tokens = normalizeCategoryQuery(query).split(' ').filter(Boolean);
  if (!tokens.length) return leaves;
  return leaves.filter((n) => {
    const haystack = normalizeCategoryQuery(
      `${n.parentLabel ?? ''} ${n.label}`,
    );
    return tokens.every((t) => haystack.includes(t));
  });
}

/**
 * The server's ranked hits, resolved onto the picker's own leaves (so a hit
 * for a node the picker does not know — e.g. a category deactivated since
 * the page loaded — is dropped rather than offered).
 */
export function resolveServerHits<T extends SearchableLeaf>(
  leaves: T[],
  hits: CategorySearchHit[],
): T[] {
  const byId = new Map(leaves.map((n) => [n.id, n]));
  const out: T[] = [];
  for (const h of hits) {
    const n = byId.get(h.id);
    if (n) out.push(n);
  }
  return out;
}
