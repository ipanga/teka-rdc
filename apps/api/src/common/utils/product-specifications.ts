/**
 * Canonical product-characteristics representation, shared by every surface
 * that renders `ProductSpecification` rows: the buyer PDP, the seller product
 * detail, and the admin review page.
 *
 * WHY THIS EXISTS
 *   Products legitimately carry specifications whose attribute lives on a
 *   DIFFERENT category from the product's own — that is how the pre-3-level
 *   taxonomy modelled them. A 10 kg bag of rice holds « Poids » from its parent
 *   « Supermarché > Alimentation »; an Android phone holds RAM / Mémoire
 *   interne from « … > Smartphones ». A production audit counted 18 such rows
 *   across 9 live products, 7 of which would have NO characteristics at all if
 *   foreign rows were simply dropped. So they are kept.
 *
 *   What must not happen is the same label twice. Category remediation adds the
 *   correct leaf's Taille/Couleur/Matière beside identically named rows owned by
 *   the product's previous category, which printed every characteristic twice.
 *
 * THE RULE
 *   Keep every characteristic, but collapse duplicates by NAME, preferring the
 *   row whose attribute belongs to the product's current category. Names are
 *   compared with `normalizeCharacteristicName` so case, whitespace and accents
 *   ("Matière" / "  matiere ") cannot produce two characteristics. Exact
 *   normalised names only — no fuzzy or synonym matching, which belongs in the
 *   taxonomy audit rather than in a rendering path.
 *
 *   Precedence is deterministic and never depends on database row order:
 *   own-category first, then `sortOrder`, then `attributeId` as a stable unique
 *   tiebreaker. Historical foreign rows remain STORED either way; this only
 *   decides what is rendered.
 */

/**
 * Lowercase + strip French accents + trim — the same normalisation the browse
 * service applies to search terms, mirroring the database's `f_unaccent`.
 */
export function normalizeCharacteristicName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** The minimum a specification row must expose to be de-duplicated. */
export interface DedupableSpecification {
  attributeId: string;
  attribute: {
    name: string;
    categoryId: string;
    sortOrder: number;
  } | null;
}

/**
 * Returns the subset of `specifications` that should be rendered, in a stable
 * order. The rows themselves are returned untouched, so each caller keeps its
 * own response shape.
 */
export function dedupeSpecificationsByName<T extends DedupableSpecification>(
  specifications: T[],
  productCategoryId: string,
): T[] {
  const ownsCategory = (s: T) => s.attribute?.categoryId === productCategoryId;
  const order = (s: T) => s.attribute?.sortOrder ?? 0;

  const byPrecedence = (a: T, b: T) =>
    Number(ownsCategory(b)) - Number(ownsCategory(a)) ||
    order(a) - order(b) ||
    a.attributeId.localeCompare(b.attributeId);

  const seen = new Set<string>();

  return [...specifications]
    .filter((s) => s.attribute?.name)
    .sort(byPrecedence)
    .filter((s) => {
      const key = normalizeCharacteristicName(s.attribute!.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => order(a) - order(b) || a.attributeId.localeCompare(b.attributeId));
}
