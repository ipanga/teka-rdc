/**
 * Structural safety for admin category-tree edits — pure functions over plain
 * data, no Prisma, no I/O.
 *
 * WHY THIS EXISTS
 *   Whether a category's characteristics are served to sellers is NOT a stored
 *   flag. `BrowseService.getCategoryAttributes` decides it at read time:
 *
 *       childCount(category) === 0  →  serve this category's attribute rows
 *       childCount(category) >  0  →  serve nothing
 *
 *   So "leaf" is a DERIVED property, and any admin edit that changes a node's
 *   child count silently changes which characteristics exist for sellers. A
 *   2026-09-11 runtime probe against the development database proved all four
 *   of the following are accepted today, with no warning and no way back:
 *
 *     1. RESURRECTION — soft-deleting (or re-parenting away) the LAST child of
 *        a node that still carries historical attribute rows turns it into a
 *        leaf, and those rows go straight into seller forms. This is the exact
 *        defect class P2/P3-1 spent two releases cleaning up: « Type = Bière »
 *        on a whisky. Production currently holds 4 such armed nodes carrying 6
 *        hidden attributes (« Cuisine » 3, « Boissons », « Smartphones »,
 *        « Réseau & Internet » 1 each).
 *
 *     2. BLINDING — giving a first child to a leaf that serves characteristics
 *        hides them. Products already on that node keep their stored
 *        specifications, but no seller form renders them any more and
 *        `assertLeafCategory` refuses to re-select the category, so the product
 *        can never be repaired. It also creates a taxonomy invariant-1
 *        violation on the spot.
 *
 *     3. DEPTH OVERFLOW — `update` validated the depth of the TARGET PARENT but
 *        never the height of the subtree being moved. Moving a level-2 node
 *        that has children under another level-2 node put its children at level
 *        4, where `findTree` (three `include` levels) stops looking: the probe
 *        confirmed the node VANISHES from the admin tree and the parent picker.
 *
 *     4. CYCLE — nothing stopped a category becoming its own parent, or being
 *        moved under its own descendant. The probe stored both. `findTree`
 *        starts from `parentCategoryId: null`, so the entire branch disappears.
 *
 * THE RULE THESE FUNCTIONS ENFORCE
 *   An admin structural edit may not change WHICH categories serve
 *   characteristics, and must leave the tree an acyclic forest of depth ≤ 3.
 *
 * DELIBERATELY STRUCTURAL. Every decision below reads child counts, attribute
 * counts, product counts and parent links. No category name, slug or id range
 * is consulted, so renaming and re-parenting cannot defeat a guard and
 * admin-created UUID categories are covered exactly like seeded ones.
 *
 * WHAT IS NOT GUARDED, ON PURPOSE
 *   Activating/deactivating a category does not move it: `getCategoryAttributes`
 *   counts children by `deletedAt` alone, so `isActive` never changes leaf-ness
 *   at runtime. Renames, descriptions, emoji, sortOrder, reordering, attribute
 *   CRUD and brand links touch no structure. All of it stays unguarded.
 */

/** Catégorie › Sous-catégorie › Type de produit. */
export const MAX_CATEGORY_DEPTH = 3;

export interface StructureNode {
  id: string;
  name: string;
  parentCategoryId: string | null;
}

/** A refused transition. `code` is for tests and logs, `message` for the admin. */
export interface TransitionRefusal {
  code:
    | 'LEAF_WITH_ATTRIBUTES'
    | 'LEAF_WITH_PRODUCTS'
    | 'INTERMEDIATE_WITH_HIDDEN_ATTRIBUTES'
    | 'CYCLE'
    | 'DEPTH_EXCEEDED';
  message: string;
}

export interface CategoryStructure {
  byId: Map<string, StructureNode>;
  childIds: Map<string, string[]>;
}

/**
 * Indexes the non-deleted category rows. Callers pass EXACTLY the rows the
 * runtime treats as present — `deletedAt: null`, regardless of `isActive` —
 * because that is what `getCategoryAttributes` counts.
 */
export function buildCategoryStructure(nodes: StructureNode[]): CategoryStructure {
  const byId = new Map<string, StructureNode>();
  const childIds = new Map<string, string[]>();
  for (const n of nodes) byId.set(n.id, n);
  for (const n of nodes) {
    if (!n.parentCategoryId) continue;
    childIds.set(n.parentCategoryId, [...(childIds.get(n.parentCategoryId) ?? []), n.id]);
  }
  return { byId, childIds };
}

export function childCountOf(structure: CategoryStructure, id: string): number {
  return (structure.childIds.get(id) ?? []).length;
}

/**
 * 1-based depth: a root is 1. Cycle-safe — a corrupted parent chain stops at
 * the first repeat instead of looping forever, so a guard can still run on a
 * tree that already contains a cycle.
 */
export function depthOf(structure: CategoryStructure, id: string): number {
  let depth = 1;
  let current = structure.byId.get(id);
  const seen = new Set<string>();
  while (current?.parentCategoryId && !seen.has(current.id)) {
    seen.add(current.id);
    current = structure.byId.get(current.parentCategoryId);
    if (!current) break;
    depth += 1;
  }
  return depth;
}

/** Levels occupied by a node and its descendants: 1 for a childless node. */
export function subtreeHeightOf(structure: CategoryStructure, id: string): number {
  // `path` (not a global visited set) so a node reached twice on DIFFERENT
  // branches is still measured properly; it exists only to break cycles.
  const walk = (nodeId: string, path: Set<string>): number => {
    if (path.has(nodeId)) return 1;
    const children = structure.childIds.get(nodeId) ?? [];
    if (children.length === 0) return 1;
    const deeper = new Set(path).add(nodeId);
    return 1 + Math.max(...children.map((c) => walk(c, deeper)));
  };
  return walk(id, new Set());
}

/** True when `candidateId` is `ancestorId` itself or sits anywhere beneath it. */
export function isSelfOrDescendant(
  structure: CategoryStructure,
  candidateId: string,
  ancestorId: string,
): boolean {
  let current = structure.byId.get(candidateId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.id === ancestorId) return true;
    seen.add(current.id);
    if (!current.parentCategoryId) return false;
    current = structure.byId.get(current.parentCategoryId);
  }
  return false;
}

const quoted = (name: string) => `« ${name} »`;

/**
 * GUARD A — a node that serves characteristics, or directly holds products,
 * must not gain its FIRST child.
 *
 * Narrow by construction: a node that already has a child changes nothing by
 * gaining another, and a childless node with neither characteristics nor
 * products loses nothing by being subdivided. Both pass.
 */
export function refuseGainingFirstChild(
  parent: StructureNode,
  currentChildCount: number,
  attributeCount: number,
  productCount: number,
): TransitionRefusal | null {
  if (currentChildCount > 0) return null;

  if (attributeCount > 0) {
    return {
      code: 'LEAF_WITH_ATTRIBUTES',
      message:
        `${quoted(parent.name)} possède ${attributeCount} caractéristique(s) et deviendrait une ` +
        'catégorie intermédiaire. Les caractéristiques ne sont proposées que sur un type de produit ' +
        '(niveau le plus bas) : elles disparaîtraient des formulaires vendeur. Déplacez ces ' +
        "caractéristiques vers un type de produit avant d'y ajouter une sous-catégorie.",
    };
  }

  if (productCount > 0) {
    return {
      code: 'LEAF_WITH_PRODUCTS',
      message:
        `${quoted(parent.name)} contient ${productCount} produit(s) et deviendrait une catégorie ` +
        'intermédiaire. Un produit ne peut pas rester sur une catégorie intermédiaire : le vendeur ' +
        'ne pourrait plus la sélectionner. Déplacez ces produits vers un type de produit avant ' +
        "d'y ajouter une sous-catégorie.",
    };
  }

  return null;
}

/**
 * GUARD B — a node still carrying characteristics must not lose its LAST child.
 *
 * This is the resurrection guard. The rows are hidden only because the node has
 * children; removing the last one publishes them. A node with no characteristics
 * may freely become a product type — that is a normal taxonomy simplification.
 */
export function refuseLosingLastChild(
  parent: StructureNode,
  remainingChildCount: number,
  attributeCount: number,
): TransitionRefusal | null {
  if (remainingChildCount > 0) return null;
  if (attributeCount === 0) return null;

  return {
    code: 'INTERMEDIATE_WITH_HIDDEN_ATTRIBUTES',
    message:
      `${quoted(parent.name)} conserve ${attributeCount} caractéristique(s) historique(s), ` +
      "masquée(s) tant qu'elle possède des sous-catégories. Cette modification la transformerait " +
      'en type de produit et rendrait ces caractéristiques de nouveau actives dans les formulaires ' +
      'vendeur. Déplacez ou supprimez ces caractéristiques avant de retirer sa dernière sous-catégorie.',
  };
}

/** GUARD C — a category may not be moved under itself or under its own subtree. */
export function refuseCyclicReparent(
  structure: CategoryStructure,
  nodeId: string,
  newParentId: string,
): TransitionRefusal | null {
  if (!isSelfOrDescendant(structure, newParentId, nodeId)) return null;
  return {
    code: 'CYCLE',
    message:
      "Une catégorie ne peut pas être déplacée sous elle-même ni sous l'une de ses propres " +
      'sous-catégories. Choisissez une autre catégorie parente.',
  };
}

/**
 * GUARD D — the moved node AND everything beneath it must still fit in 3 levels.
 *
 * The replaced check looked only at the target parent, so a subtree could be
 * pushed to level 4 and out of the admin tree entirely.
 */
export function refuseDepthOverflow(
  structure: CategoryStructure,
  nodeId: string,
  newParentId: string | null,
): TransitionRefusal | null {
  const node = structure.byId.get(nodeId);
  const newDepth = newParentId ? depthOf(structure, newParentId) + 1 : 1;
  const height = subtreeHeightOf(structure, nodeId);
  const deepest = newDepth + height - 1;
  if (deepest <= MAX_CATEGORY_DEPTH) return null;

  const name = node ? quoted(node.name) : 'Cette catégorie';
  return {
    code: 'DEPTH_EXCEEDED',
    message:
      `${name} contient ${height - 1} niveau(x) de sous-catégories : la déplacer ici créerait une ` +
      `profondeur de ${deepest} niveaux, alors que la taxonomie en autorise ${MAX_CATEGORY_DEPTH} ` +
      '(Catégorie › Sous-catégorie › Type de produit). Déplacez ou supprimez d’abord ses ' +
      'sous-catégories.',
  };
}
