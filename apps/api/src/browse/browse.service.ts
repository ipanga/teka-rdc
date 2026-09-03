import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProductStatus,
  Prisma,
  SearchQuerySource,
  SearchQueryIntent,
} from '@prisma/client';
import { BrowseProductsQueryDto } from './dto/browse-products-query.dto';
import { isShortCode } from '../common/utils/slugify';
import { dedupeSpecificationsByName } from '../common/utils/product-specifications';

// Lowercase + strip French accents (JS-side), mirroring the DB's f_unaccent so
// synonym matching ("téléphone" ⇄ "telephone") is consistent on both sides.
function stripAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Aggregation key for a logged search term.
 *
 * `stripAccents` folds accents and case but only TRIMS — it leaves internal
 * whitespace runs alone, so "robe  wax" and "robe wax" would be two different
 * keys for one piece of demand. This collapses every whitespace run (spaces,
 * tabs, newlines) to a single space on top of that.
 *
 * Deliberately a SEPARATE function rather than a change to `stripAccents`:
 * that helper also feeds `expandSynonyms` and the PDP specification de-dupe,
 * and altering it would change search MATCHING. This only ever affects what is
 * written to the analytics log.
 */
export function normalizeSearchTerm(term: string): string {
  return stripAccents(term).replace(/\s+/g, ' ');
}

/** Shortest term worth recording as demand — matches buyer-web's autocomplete floor. */
const MIN_LOGGED_TERM_LENGTH = 2;

/**
 * Maps the client-supplied `searchSource` to the stored enum.
 *
 * Anything unrecognised — including absent — becomes UNKNOWN rather than a
 * guess. UNKNOWN means precisely "a client that predates this parameter"; it is
 * NOT a synonym for web.
 */
function resolveSearchSource(raw?: string): SearchQuerySource {
  switch (raw) {
    case 'BUYER_WEB':
      return SearchQuerySource.BUYER_WEB;
    case 'BUYER_MOBILE':
      return SearchQuerySource.BUYER_MOBILE;
    default:
      return SearchQuerySource.UNKNOWN;
  }
}

/**
 * Maps the client-supplied `searchIntent` to a stored intent, or `null` when
 * the request must NOT be recorded.
 *
 * - absent          -> SUBMIT. Currently-deployed clients send nothing, and
 *                      dropping them would blank search demand for months until
 *                      the next store release. Their rows are still identifiable
 *                      because their `source` is UNKNOWN.
 * - 'SUBMIT'        -> SUBMIT
 * - 'SUGGESTION'    -> SUGGESTION
 * - 'REFINE'        -> null. A filter, sort, page or refresh re-fetch of a search
 *                      the buyer already ran is not new demand.
 * - anything else   -> null. We refuse to classify a value we do not recognise,
 *                      rather than silently filing it as a search.
 */
function resolveSearchIntent(raw?: string): SearchQueryIntent | null {
  if (raw === undefined || raw === null || raw === '') {
    return SearchQueryIntent.SUBMIT;
  }
  switch (raw) {
    case 'SUBMIT':
      return SearchQueryIntent.SUBMIT;
    case 'SUGGESTION':
      return SearchQueryIntent.SUGGESTION;
    default:
      return null;
  }
}

@Injectable()
export class BrowseService {
  private readonly logger = new Logger(BrowseService.name);

  // Short-lived cache of active synonym groups (admin-editable; reloaded every
  // 60s) so we don't hit the table on every search.
  private synonymCache: { at: number; groups: string[][] } | null = null;

  constructor(private prisma: PrismaService) {}

  /** Active synonym groups (unaccented/lowercase), cached for 60s. */
  private async getSynonymGroups(): Promise<string[][]> {
    if (this.synonymCache && Date.now() - this.synonymCache.at < 60_000) {
      return this.synonymCache.groups;
    }
    let groups: string[][] = [];
    try {
      const rows = await this.prisma.searchSynonym.findMany({
        where: { isActive: true },
        select: { terms: true },
      });
      groups = rows.map((r) => r.terms.map(stripAccents).filter(Boolean));
    } catch {
      groups = this.synonymCache?.groups ?? [];
    }
    this.synonymCache = { at: Date.now(), groups };
    return groups;
  }

  /**
   * Extra OR-terms for a query from any synonym group it hits. E.g. "gsm" →
   * ["portable","smartphone","telephone","mobile"]. Returns [] when no group
   * matches. Terms already present in the query are dropped.
   */
  private expandSynonyms(q: string, groups: string[][]): string[] {
    const tokens = stripAccents(q).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const tokenSet = new Set(tokens);
    const extra = new Set<string>();
    for (const group of groups) {
      const hit = group.some((term) => {
        const words = term.split(/\s+/).filter(Boolean);
        return words.length === 1
          ? tokenSet.has(term)
          : words.every((w) => tokenSet.has(w));
      });
      if (hit) for (const term of group) extra.add(term);
    }
    for (const t of tokens) extra.delete(t);
    return [...extra];
  }

  /**
   * Builds the FTS/trigram match condition + an optional synonym OR-clause.
   * `synTerms` are admin-controlled + sanitized to tsquery lexemes here, so the
   * to_tsquery interpolation is injection-safe (and still a bound parameter).
   */
  private buildSearchMatch(q: string, synTerms: string[]): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      Prisma.sql`p."search_vector" @@ websearch_to_tsquery('french', public.f_unaccent(${q}))`,
      Prisma.sql`public.f_unaccent(${q}) <% public.f_unaccent(p."title")`,
    ];
    const sanitized = synTerms
      .map((t) =>
        stripAccents(t)
          .replace(/[^a-z0-9\s]+/g, ' ')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .join(' & '),
      )
      .filter(Boolean)
      .map((s) => `(${s})`);
    if (sanitized.length > 0) {
      const orStr = sanitized.join(' | ');
      parts.push(
        Prisma.sql`p."search_vector" @@ to_tsquery('french', public.f_unaccent(${orStr}))`,
      );
    }
    return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
  }

  /**
   * Fire-and-forget search log (first page only) for popular/zero-result
   * analytics.
   *
   * Non-critical telemetry: this must NEVER be able to break, slow or fail a
   * buyer's search. It is not awaited, every rejection is swallowed, and the
   * whole thing sits inside a try/catch so even a missing delegate (tests) or a
   * synchronous client error cannot escape. That property is load-bearing and
   * is covered by its own test.
   */
  private logSearch(
    term: string,
    resultCount: number,
    cityId: string | undefined,
    source: SearchQuerySource,
    intent: SearchQueryIntent,
  ): void {
    const termNormalized = normalizeSearchTerm(term);
    // Single-character noise was previously written and only filtered when
    // read (getPopularSearches drops < 2 chars). Filtering at write time keeps
    // the table honest instead of paying to store rows nothing will ever show.
    if (termNormalized.length < MIN_LOGGED_TERM_LENGTH) return;

    try {
      void this.prisma.searchQuery
        ?.create({
          data: {
            term: term.trim().slice(0, 200),
            termNormalized: termNormalized.slice(0, 200),
            resultCount,
            cityId: cityId ?? null,
            source,
            intent,
          },
        })
        ?.catch(() => {});
    } catch {
      /* no-op */
    }
  }

  /**
   * Returns active categories as a tree with ACTIVE product counts.
   */
  async getCategories() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: {
            products: {
              where: { status: ProductStatus.ACTIVE, deletedAt: null },
            },
          },
        },
      },
    });

    // Build tree from flat list
    const map = new Map<
      string,
      (typeof categories)[0] & {
        subcategories: typeof categories;
        productCount: number;
      }
    >();
    const roots: ((typeof categories)[0] & {
      subcategories: typeof categories;
      productCount: number;
    })[] = [];

    for (const cat of categories) {
      const node = {
        ...cat,
        productCount: cat._count.products,
        subcategories: [] as typeof categories,
      };
      delete (node as Record<string, unknown>)['_count'];
      map.set(cat.id, node);
    }

    for (const cat of categories) {
      const node = map.get(cat.id)!;
      if (cat.parentCategoryId && map.has(cat.parentCategoryId)) {
        map
          .get(cat.parentCategoryId)!
          .subcategories.push(node as (typeof categories)[0]);
      } else {
        roots.push(node);
      }
    }

    // Roll product counts up the tree. Products are assigned to LEAF nodes
    // (product types — the 3rd level), never to a subcategory or top category,
    // so each node's count = its own products + the sum of all its descendants'.
    // Recursive (depth-agnostic) so it works for the 3-level tree; without it
    // every subcategory + top category card shows "0 produits".
    const rollUp = (node: { productCount: number; subcategories: unknown[] }): number => {
      let total = node.productCount;
      for (const child of node.subcategories) {
        total += rollUp(child as typeof node);
      }
      node.productCount = total;
      return total;
    };
    for (const root of roots) rollUp(root);

    return roots;
  }

  /**
   * Returns cursor-paginated ACTIVE products with filters.
   */
  async browseProducts(query: BrowseProductsQueryDto) {
    const limit = query.limit ?? 20;

    // Build where clause
    const where: Record<string, unknown> = {
      status: ProductStatus.ACTIVE,
      deletedAt: null,
    };

    if (query.cityId) {
      where.cityId = query.cityId;
    }

    // The expanded category-id set (self + sub + sub-sub), shared by the Prisma
    // path and the raw FTS search path so both filter identically.
    let categoryIds: string[] | null = null;
    if (query.categoryId) {
      // Include subcategories: find all child category IDs
      const childCategories = await this.prisma.category.findMany({
        where: {
          OR: [
            { id: query.categoryId },
            { parentCategoryId: query.categoryId },
            {
              parentCategory: {
                parentCategoryId: query.categoryId,
              },
            },
          ],
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      categoryIds = childCategories.map((c) => c.id);
      where.categoryId = { in: categoryIds };
    }

    if (query.condition) {
      where.condition = query.condition;
    }

    if (query.minPrice || query.maxPrice) {
      where.priceCDF = {};
      if (query.minPrice) {
        (where.priceCDF as Record<string, unknown>).gte = BigInt(
          query.minPrice,
        );
      }
      if (query.maxPrice) {
        (where.priceCDF as Record<string, unknown>).lte = BigInt(
          query.maxPrice,
        );
      }
    }

    if (query.minRating) {
      where.avgRating = { gte: query.minRating };
    }

    // Promotion facet: only products with an active seller-set discount. The
    // validateDiscount invariant guarantees a stored discount is always
    // < priceCDF, so "not null" is exactly "on promotion".
    const onPromotion = query.onPromotion === 'true';
    if (onPromotion) {
      where.discountPriceCDF = { not: null };
    }

    // Brand facet filter (OR within the selected brand ids). Options come from
    // GET /v1/brands?categoryId=; here we just narrow the result set.
    const brandIds = this.parseBrandIds(query.brandIds);
    if (brandIds) {
      where.brandId = { in: brandIds };
    }

    // Attribute (facet) filter for SELECT / MULTISELECT attributes. Resolved
    // to a product-id set via one raw pass (AND across attributes, OR within),
    // then injected into BOTH the Prisma and FTS paths so they filter
    // identically. MULTISELECT values are stored comma-joined, so matching uses
    // Postgres array overlap (string_to_array(value, ',') && ARRAY[...]) —
    // token-exact, avoiding the substring trap where "8Go" ⊂ "128Go".
    const attrFilters = this.parseAttributeFilters(query.attributes);
    let attributeProductIds: string[] | null = null;
    if (attrFilters) {
      attributeProductIds = await this.resolveAttributeFilterIds(attrFilters);
      if (attributeProductIds.length === 0) {
        // No product satisfies the selected facets — short-circuit with an
        // empty page (same response shape as a normal empty result).
        return {
          data: [],
          pagination: { nextCursor: null, hasMore: false, total: 0 },
        };
      }
      where.id = { in: attributeProductIds };
    }

    // Demo retirement (P3c): hide demo products in categories that have enough
    // real ones. Dormant unless the master switch is on — `retired` is then
    // empty and this is a no-op. Applied to both query branches below.
    const retired = await this.getRetiredCategoryIds();
    if (retired.size > 0) {
      where.OR = [
        { isDemo: false },
        { categoryId: { notIn: Array.from(retired) } },
      ];
    }

    // Product fields returned to clients — shared by the default Prisma path
    // and the full-text search path (which hydrates by id with the same shape).
    const productSelect = {
      id: true,
      slug: true,
      shortCode: true,
      title: true,
      priceCDF: true,
      priceUSD: true,
      discountPriceCDF: true,
      discountPriceUSD: true,
      condition: true,
      quantity: true,
      categoryId: true,
      cityId: true,
      avgRating: true,
      totalReviews: true,
      unitsSold: true,
      createdAt: true,
      // City slug/name lets clients build `/{ville}/{slug}-{shortCode}` URLs
      // on mixed-city listings (e.g. the global homepage).
      city: { select: { slug: true, name: true } },
      images: {
        orderBy: { displayOrder: 'asc' as const },
        take: 1,
        select: { id: true, url: true, thumbnailUrl: true, displayOrder: true },
      },
      seller: {
        select: { sellerProfile: { select: { businessName: true } } },
      },
      // Brand label for the product card (shown above the title when present).
      brand: { select: { name: true } },
    } satisfies Prisma.ProductSelect;
    type ProductRow = Prisma.ProductGetPayload<{
      select: typeof productSelect;
    }>;

    let data: ProductRow[];
    let total: number;
    let hasMore: boolean;
    let nextCursor: string | null;

    if (query.search) {
      // Full-text search (Postgres FTS + pg_trgm). Prisma can't ORDER BY
      // ts_rank, so ranking is raw SQL: a relevance-ordered id list (real
      // above demo → ts_rank → trigram similarity → recency), then hydrated by
      // id with the shared select. The cursor encodes a simple offset over the
      // rank-ordered result set. Same filters as the default path.
      const q = query.search;
      // Accent-insensitive (f_unaccent) so "telephone" matches "Téléphones";
      // word_similarity (<%) gives one-word typo tolerance against long titles;
      // synonym groups OR in related terms (gsm → portable/smartphone/…).
      const synTerms = this.expandSynonyms(q, await this.getSynonymGroups());
      const conds: Prisma.Sql[] = [
        Prisma.sql`p."status" = 'ACTIVE'`,
        Prisma.sql`p."deletedAt" IS NULL`,
        this.buildSearchMatch(q, synTerms),
      ];
      if (query.cityId) {
        conds.push(Prisma.sql`p."cityId"::text = ${query.cityId}`);
      }
      if (categoryIds && categoryIds.length > 0) {
        conds.push(
          Prisma.sql`p."categoryId"::text IN (${Prisma.join(categoryIds)})`,
        );
      }
      if (query.condition) {
        conds.push(Prisma.sql`p."condition"::text = ${query.condition}`);
      }
      if (query.minPrice) {
        conds.push(Prisma.sql`p."priceCDF" >= ${BigInt(query.minPrice)}`);
      }
      if (query.maxPrice) {
        conds.push(Prisma.sql`p."priceCDF" <= ${BigInt(query.maxPrice)}`);
      }
      if (query.minRating) {
        conds.push(Prisma.sql`p."avgRating" >= ${query.minRating}`);
      }
      if (onPromotion) {
        conds.push(Prisma.sql`p."discountPriceCDF" IS NOT NULL`);
      }
      if (brandIds && brandIds.length > 0) {
        conds.push(Prisma.sql`p."brandId"::text IN (${Prisma.join(brandIds)})`);
      }
      if (attributeProductIds && attributeProductIds.length > 0) {
        conds.push(
          Prisma.sql`p."id"::text IN (${Prisma.join(attributeProductIds)})`,
        );
      }
      if (retired.size > 0) {
        conds.push(
          Prisma.sql`(p."isDemo" = false OR p."categoryId"::text NOT IN (${Prisma.join(
            Array.from(retired),
          )}))`,
        );
      }
      const whereSql = Prisma.join(conds, ' AND ');

      const offset = query.cursor
        ? Math.max(0, parseInt(query.cursor, 10) || 0)
        : 0;
      const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p."id"
        FROM "products" p
        WHERE ${whereSql}
        ORDER BY p."isDemo" ASC,
                 ts_rank(p."search_vector", websearch_to_tsquery('french', public.f_unaccent(${q}))) DESC,
                 word_similarity(public.f_unaccent(${q}), public.f_unaccent(p."title")) DESC,
                 (p."quantity" > 0) DESC,
                 p."unitsSold" DESC,
                 p."avgRating" DESC,
                 p."createdAt" DESC
        LIMIT ${limit + 1} OFFSET ${offset}
      `);
      hasMore = idRows.length > limit;
      const pageIds = (hasMore ? idRows.slice(0, limit) : idRows).map(
        (r) => r.id,
      );

      const countRows = await this.prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "products" p WHERE ${whereSql}`,
      );
      total = Number(countRows[0]?.count ?? 0);

      // Record a search only when it is a real demand signal: the first page
      // (never a pagination fetch) AND an intent that resolves to something
      // storable — a REFINE (filter / sort / page / refresh re-fetch) or an
      // unrecognised value yields null and is skipped.
      const intent = resolveSearchIntent(query.searchIntent);
      if (!query.cursor && intent !== null) {
        this.logSearch(
          q,
          total,
          query.cityId,
          resolveSearchSource(query.searchSource),
          intent,
        );
      }

      const fetched = await this.prisma.product.findMany({
        where: { id: { in: pageIds } },
        select: productSelect,
      });
      const byId = new Map(fetched.map((p) => [p.id, p]));
      // Preserve the relevance order from the raw query.
      data = pageIds
        .map((id) => byId.get(id))
        .filter((p): p is ProductRow => p != null);
      nextCursor = hasMore ? String(offset + limit) : null;
    } else {
      // Build orderBy. Real merchant products always rank above the seeded
      // "Teka RDC Officiel" demo catalog (isDemo asc → false/real first), then
      // the buyer's chosen sort within each group. Once a category's demo
      // products are retired (Phase 3 P3c) this tiebreaker becomes moot.
      let primarySort: Record<string, string>;
      switch (query.sortBy) {
        case 'price_low':
          primarySort = { priceCDF: 'asc' };
          break;
        case 'price_high':
          primarySort = { priceCDF: 'desc' };
          break;
        case 'newest':
          primarySort = { createdAt: 'desc' };
          break;
        case 'rating':
          primarySort = { avgRating: 'desc' };
          break;
        case 'popularity':
        default:
          // Real best-seller ranking: most delivered units first, recency as
          // the tiebreaker so new products aren't permanently buried.
          primarySort = { unitsSold: 'desc' };
          break;
      }
      const orderBy: Record<string, string>[] =
        query.sortBy === 'popularity' || !query.sortBy
          ? [{ isDemo: 'asc' }, primarySort, { createdAt: 'desc' }]
          : [{ isDemo: 'asc' }, primarySort];

      // Cursor-based pagination: fetch limit+1 to check hasMore
      const products = await this.prisma.product.findMany({
        where,
        orderBy,
        take: limit + 1,
        ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
        select: productSelect,
      });
      hasMore = products.length > limit;
      data = hasMore ? products.slice(0, limit) : products;
      nextCursor = hasMore ? data[data.length - 1].id : null;
      total = await this.prisma.product.count({ where });
    }

    // Transform to BrowseProduct shape
    const items = data.map((p) => ({
      id: p.id,
      slug: p.slug,
      shortCode: p.shortCode,
      title: p.title,
      priceCDF: p.priceCDF,
      priceUSD: p.priceUSD,
      discountPriceCDF: p.discountPriceCDF,
      discountPriceUSD: p.discountPriceUSD,
      condition: p.condition,
      quantity: p.quantity,
      categoryId: p.categoryId,
      cityId: p.cityId,
      citySlug: p.city?.slug ?? null,
      cityName: p.city?.name ?? null,
      avgRating: p.avgRating,
      totalReviews: p.totalReviews,
      unitsSold: p.unitsSold,
      image: p.images[0] ?? null,
      seller: {
        businessName: p.seller?.sellerProfile?.businessName ?? 'Vendeur',
      },
    }));

    return {
      data: items,
      pagination: {
        nextCursor,
        hasMore,
        total,
      },
    };
  }

  /**
   * Parse the comma-separated `brandIds` facet param into a bounded, de-duped
   * list of hex ids. Returns null when absent or empty after cleaning. Non-hex
   * tokens are dropped; capped at 50 ids so a hostile client can't blow up the
   * IN-list.
   */
  private parseBrandIds(raw?: string): string[] | null {
    if (!raw) return null;
    const hex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = Array.from(
      new Set(
        raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => hex.test(s)),
      ),
    ).slice(0, 50);
    return ids.length ? ids : null;
  }

  /**
   * Parse + leniently validate the `attributes` facet-filter query param.
   * Shape: `{"<attributeId>":["val1","val2"],...}`. Returns null when absent,
   * malformed, or empty after cleaning (the caller then applies no facet
   * filter). Bounded so a hostile client can't blow up the resolution query:
   * ≤10 attributes, ≤30 values each, values trimmed + ≤100 chars.
   */
  private parseAttributeFilters(raw?: string): Record<string, string[]> | null {
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const out: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!uuidRe.test(key) || !Array.isArray(val)) continue;
      const values = val
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v.length > 0 && v.length <= 100)
        .slice(0, 30);
      if (values.length > 0) out[key] = values;
    }
    const keys = Object.keys(out);
    if (keys.length === 0) return null;
    if (keys.length > 10) {
      for (const k of keys.slice(10)) delete out[k];
    }
    return out;
  }

  /**
   * Resolve a facet filter to the set of product ids that satisfy it: a product
   * must match EVERY selected attribute (AND across), where matching an
   * attribute means its stored value overlaps ANY selected value (OR within).
   * MULTISELECT values are comma-joined in storage, so a single array-overlap
   * predicate (string_to_array(value, ',') && ARRAY[...]) handles both SELECT
   * (single token) and MULTISELECT (multi token) correctly. The HAVING clause
   * enforces the AND: a product is kept only when it matched all N attributes
   * (one spec row per (product, attribute) thanks to the unique constraint).
   */
  private async resolveAttributeFilterIds(
    attrFilters: Record<string, string[]>,
  ): Promise<string[]> {
    const groups = Object.entries(attrFilters);
    if (groups.length === 0) return [];
    const groupConds = groups.map(
      ([attrId, values]) =>
        Prisma.sql`(ps."attributeId" = ${attrId}::uuid AND string_to_array(ps."value", ',') && ARRAY[${Prisma.join(
          values,
        )}]::text[])`,
    );
    const rows = await this.prisma.$queryRaw<{ productId: string }[]>(
      Prisma.sql`
        SELECT ps."productId"
        FROM "product_specifications" ps
        WHERE ${Prisma.join(groupConds, ' OR ')}
        GROUP BY ps."productId"
        HAVING COUNT(DISTINCT ps."attributeId") = ${groups.length}
      `,
    );
    return rows.map((r) => r.productId);
  }

  /**
   * Demo-catalog retirement (Initiative #1 / P3c). Returns the set of category
   * ids whose demo products should be HIDDEN — categories that have enough REAL
   * (non-demo) active products to stand on their own. Empty unless the
   * `RETIRE_DEMO_CATALOG` master switch is on, so the feature ships DORMANT (no
   * change to a demo-only catalog). A category retires automatically once its
   * real count reaches `DEMO_RETIRE_THRESHOLD`, so the transition is gradual as
   * merchants onboard and the storefront is never emptied. Callers OR this in as
   * `(isDemo = false OR categoryId NOT IN retired)`.
   */
  private async getRetiredCategoryIds(): Promise<Set<string>> {
    const enabled = await this.readBoolSetting('RETIRE_DEMO_CATALOG', false);
    if (!enabled) return new Set();
    const threshold = await this.readIntSetting('DEMO_RETIRE_THRESHOLD', 3);
    const grouped = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: {
        isDemo: false,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
      _count: { _all: true },
    });
    return new Set(
      grouped
        .filter((g) => g._count._all >= threshold)
        .map((g) => g.categoryId),
    );
  }

  private async readBoolSetting(
    key: string,
    fallback: boolean,
  ): Promise<boolean> {
    try {
      const s = await this.prisma.systemSetting.findUnique({
        where: { key },
        select: { value: true },
      });
      return s == null ? fallback : s.value === 'true';
    } catch {
      return fallback;
    }
  }

  private async readIntSetting(key: string, fallback: number): Promise<number> {
    try {
      const s = await this.prisma.systemSetting.findUnique({
        where: { key },
        select: { value: true },
      });
      const n = parseInt(s?.value ?? '', 10);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Search autocomplete: the top few relevant products (FTS + trigram, same
   * ranking as browse search) + categories whose name matches the partial
   * query. Empty for very short queries.
   */
  async searchSuggestions(q: string, cityId?: string) {
    const term = q.trim();
    if (term.length < 2) {
      return { products: [], categories: [], brands: [] };
    }

    const synTerms = this.expandSynonyms(term, await this.getSynonymGroups());
    const conds: Prisma.Sql[] = [
      Prisma.sql`p."status" = 'ACTIVE'`,
      Prisma.sql`p."deletedAt" IS NULL`,
      this.buildSearchMatch(term, synTerms),
    ];
    if (cityId) {
      conds.push(Prisma.sql`p."cityId"::text = ${cityId}`);
    }
    const retired = await this.getRetiredCategoryIds();
    if (retired.size > 0) {
      conds.push(
        Prisma.sql`(p."isDemo" = false OR p."categoryId"::text NOT IN (${Prisma.join(
          Array.from(retired),
        )}))`,
      );
    }
    const whereSql = Prisma.join(conds, ' AND ');

    const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p."id"
      FROM "products" p
      WHERE ${whereSql}
      ORDER BY p."isDemo" ASC,
               ts_rank(p."search_vector", websearch_to_tsquery('french', public.f_unaccent(${term}))) DESC,
               word_similarity(public.f_unaccent(${term}), public.f_unaccent(p."title")) DESC
      LIMIT 5
    `);
    const ids = idRows.map((r) => r.id);

    const fetched = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        slug: true,
        shortCode: true,
        cityId: true,
        city: { select: { slug: true, name: true } },
        images: {
          orderBy: { displayOrder: 'asc' },
          take: 1,
          select: { thumbnailUrl: true },
        },
      },
    });
    const byId = new Map(fetched.map((p) => [p.id, p]));
    const products = ids
      .map((id) => byId.get(id))
      .filter((p): p is (typeof fetched)[number] => p != null)
      .map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        shortCode: p.shortCode,
        cityId: p.cityId,
        citySlug: p.city?.slug ?? null,
        cityName: p.city?.name ?? null,
        thumbnailUrl: p.images[0]?.thumbnailUrl ?? null,
      }));

    // Accent-insensitive category match ("telephone" → "Téléphones"). Covers all
    // 3 levels incl. product types (they are category nodes).
    const categories = await this.prisma.$queryRaw<
      { id: string; name: string; slug: string | null }[]
    >(Prisma.sql`
      SELECT c."id", c."name", c."slug"
      FROM "categories" c
      WHERE c."isActive" = true
        AND c."deletedAt" IS NULL
        AND public.f_unaccent(c."name") ILIKE '%' || public.f_unaccent(${term}) || '%'
      ORDER BY c."sortOrder" ASC
      LIMIT 5
    `);

    // Accent-insensitive brand match ("samsng" → Samsung via trigram, "lux" → substring).
    const brands = await this.prisma.$queryRaw<
      { id: string; name: string; slug: string | null }[]
    >(Prisma.sql`
      SELECT b."id", b."name", b."slug"
      FROM "brands" b
      WHERE b."isActive" = true
        AND b."deletedAt" IS NULL
        AND (public.f_unaccent(b."name") ILIKE '%' || public.f_unaccent(${term}) || '%'
             OR public.f_unaccent(${term}) <% public.f_unaccent(b."name"))
      ORDER BY public.f_unaccent(b."name") ILIKE public.f_unaccent(${term}) || '%' DESC,
               b."name" ASC
      LIMIT 5
    `);

    return { products, categories, brands };
  }

  /**
   * Popular searches (for the empty/focused autocomplete state): the most
   * frequent non-zero-result terms over the last 7 days, optionally city-scoped.
   * Reads from the SearchQuery log (Phase 2).
   */
  async getPopularSearches(cityId?: string, limit = 8) {
    const take = Math.min(Math.max(limit, 1), 20);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    try {
      const rows = await this.prisma.searchQuery.groupBy({
        by: ['termNormalized'],
        where: {
          createdAt: { gte: since },
          resultCount: { gt: 0 },
          ...(cityId ? { cityId } : {}),
          // Skip 1-char noise.
          termNormalized: { not: '' },
        },
        _count: { termNormalized: true },
        _max: { term: true },
        orderBy: { _count: { termNormalized: 'desc' } },
        take,
      });
      return rows
        .filter((r) => r.termNormalized.length >= 2)
        .map((r) => ({
          term: r._max.term ?? r.termNormalized,
          count: r._count.termNormalized,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Related products for the PDP: same category, price within ±40%, excluding
   * the current product, real-above-demo then best-seller/recency. Tops up with
   * same-category (any price) when the price band is sparse so the carousel is
   * never near-empty.
   */
  async getRelatedProducts(productId: string, limit = 8) {
    const take = Math.min(Math.max(limit, 1), 12);
    const source = await this.prisma.product.findFirst({
      where: { id: productId, status: ProductStatus.ACTIVE, deletedAt: null },
      select: { id: true, categoryId: true, priceCDF: true },
    });
    if (!source) return { data: [] };

    const lo = (source.priceCDF * 60n) / 100n;
    const hi = (source.priceCDF * 140n) / 100n;

    const select = {
      id: true,
      slug: true,
      shortCode: true,
      title: true,
      priceCDF: true,
      priceUSD: true,
      discountPriceCDF: true,
      discountPriceUSD: true,
      condition: true,
      quantity: true,
      categoryId: true,
      cityId: true,
      avgRating: true,
      totalReviews: true,
      unitsSold: true,
      city: { select: { slug: true, name: true } },
      images: {
        orderBy: { displayOrder: 'asc' as const },
        take: 1,
        select: { id: true, url: true, thumbnailUrl: true, displayOrder: true },
      },
      seller: {
        select: { sellerProfile: { select: { businessName: true } } },
      },
      // Brand label for the product card (shown above the title when present).
      brand: { select: { name: true } },
    } satisfies Prisma.ProductSelect;
    type Row = Prisma.ProductGetPayload<{ select: typeof select }>;

    // Demo retirement (P3c): drop demo from a retired source category.
    const retired = await this.getRetiredCategoryIds();
    const baseWhere = {
      status: ProductStatus.ACTIVE,
      deletedAt: null,
      categoryId: source.categoryId,
      id: { not: source.id },
      ...(retired.has(source.categoryId) ? { isDemo: false } : {}),
    };
    const orderBy = [
      { isDemo: 'asc' as const },
      { unitsSold: 'desc' as const },
      { createdAt: 'desc' as const },
    ];

    const near = await this.prisma.product.findMany({
      where: { ...baseWhere, priceCDF: { gte: lo, lte: hi } },
      orderBy,
      take,
      select,
    });

    let rows: Row[] = near;
    if (rows.length < take) {
      const excludeIds = [source.id, ...rows.map((r) => r.id)];
      const fill = await this.prisma.product.findMany({
        where: { ...baseWhere, id: { notIn: excludeIds } },
        orderBy,
        take: take - rows.length,
        select,
      });
      rows = [...rows, ...fill];
    }

    const data = rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      shortCode: p.shortCode,
      title: p.title,
      priceCDF: p.priceCDF,
      priceUSD: p.priceUSD,
      discountPriceCDF: p.discountPriceCDF,
      discountPriceUSD: p.discountPriceUSD,
      condition: p.condition,
      quantity: p.quantity,
      categoryId: p.categoryId,
      cityId: p.cityId,
      citySlug: p.city?.slug ?? null,
      cityName: p.city?.name ?? null,
      avgRating: p.avgRating,
      totalReviews: p.totalReviews,
      unitsSold: p.unitsSold,
      image: p.images[0] ?? null,
      seller: {
        businessName: p.seller?.sellerProfile?.businessName ?? 'Vendeur',
      },
    }));
    return { data };
  }

  /**
   * Returns full product detail for public viewing.
   */
  async getProductDetail(identifier: string) {
    // Resolution order (city-first URL refactor, 2026-06-06):
    //   UUID            -> by id
    //   6-char base36   -> by shortCode (the canonical URL tail)
    //   anything else   -> by slug (cosmetic; also the legacy resolver)
    // A 6-char token could legitimately be an old slug rather than a
    // shortCode, so fall back to slug on a shortCode miss.
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identifier,
      );

    const include = {
      images: { orderBy: { displayOrder: 'asc' as const } },
      specifications: {
        include: { attribute: true },
        // Preserve the order the admin configured on the attribute.
        orderBy: { attribute: { sortOrder: 'asc' as const } },
      },
      category: {
        include: {
          parentCategory: {
            include: {
              parentCategory: true,
            },
          },
        },
      },
      city: {
        select: { id: true, slug: true, name: true, province: true },
      },
      brand: {
        select: { id: true, name: true, slug: true },
      },
      seller: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          sellerProfile: {
            select: { businessName: true },
          },
        },
      },
    };

    const primaryWhere = isUuid
      ? { id: identifier }
      : isShortCode(identifier)
        ? { shortCode: identifier }
        : { slug: identifier };

    let product = await this.prisma.product.findFirst({
      where: {
        ...primaryWhere,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
      include,
    });

    // Legacy fallback: the 6-char token was an old slug, not a shortCode.
    if (!product && !isUuid && isShortCode(identifier)) {
      product = await this.prisma.product.findFirst({
        where: {
          slug: identifier,
          status: ProductStatus.ACTIVE,
          deletedAt: null,
        },
        include,
      });
    }

    if (!product) {
      throw new NotFoundException('Produit non trouvé');
    }

    // Build category breadcrumb. `slug` is the canonical identifier used by
    // buyer-web URLs (/categorie/<slug>); `id` is kept for backward
    // compatibility with older clients.
    const breadcrumb: {
      id: string;
      slug: string | null;
      name: unknown;
    }[] = [];
    if (product.category) {
      if (product.category.parentCategory?.parentCategory) {
        breadcrumb.push({
          id: product.category.parentCategory.parentCategory.id,
          slug: product.category.parentCategory.parentCategory.slug,
          name: product.category.parentCategory.parentCategory.name,
        });
      }
      if (product.category.parentCategory) {
        breadcrumb.push({
          id: product.category.parentCategory.id,
          slug: product.category.parentCategory.slug,
          name: product.category.parentCategory.name,
        });
      }
      breadcrumb.push({
        id: product.category.id,
        slug: product.category.slug,
        name: product.category.name,
      });
    }

    // Flatten the seller shape to match the list endpoint and the
    // BrowseSeller type used by buyer-web. Prior to this fix the detail
    // endpoint returned the raw Prisma include
    // (`seller: { id, firstName, lastName, sellerProfile: { businessName } }`),
    // while the list endpoint returned `{ id, businessName }`. The buyer-web
    // cart hydration assumed list-shape; reading `seller.businessName` was
    // undefined, which crashed the cart page (`undefined.trim()`). The PDP
    // also rendered an empty "VENDEUR" label for the same reason.
    const { seller, specifications, ...rest } = product;
    const sellerFullName = [seller.firstName, seller.lastName]
      .filter(Boolean)
      .join(' ');
    const sellerFlat = {
      id: seller.id,
      businessName:
        seller.sellerProfile?.businessName || sellerFullName || 'Vendeur',
    };

    // Flatten specifications for the same reason the seller shape above is
    // flattened: the raw Prisma include nests the human label under
    // `attribute.name`, but every client (buyer-mobile, buyer-web, admin-web)
    // reads a flat `spec.name`. That key did not exist, so the
    // "Caractéristiques" table rendered values with blank labels ("M" instead
    // of "Taille : M"). Rows with no label or no value are dropped rather than
    // rendered half-empty.
    // Canonical characteristics: foreign rows are preserved, duplicates by name
    // collapse to one, and the product's own category wins. Shared with the
    // seller and admin detail endpoints — see common/utils/product-specifications.
    const deduped = dedupeSpecificationsByName(
      specifications,
      product.categoryId,
    )
      .filter((s) => s.value?.trim())
      .map((s) => ({
        id: s.id,
        attributeId: s.attributeId,
        name: s.attribute.name,
        value: s.value,
        sortOrder: s.attribute.sortOrder,
      }));

    // Demo retirement (P3c): a demo product in a retired category should 301 to
    // its category page. The buyer-web PDP reads this flag and redirects.
    const retired = await this.getRetiredCategoryIds();
    const isRetired =
      product.isDemo === true && retired.has(product.categoryId);

    return {
      ...rest,
      seller: sellerFlat,
      specifications: deduped,
      breadcrumb,
      isRetired,
    };
  }

  /**
   * Returns a single active category by id OR slug, with its direct
   * subcategories and active product count. Used by buyer-web's category
   * detail page (/categorie/<slug>). Mirrors the UUID-or-slug pattern of
   * getProductDetail above.
   */
  async getCategoryDetail(identifier: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identifier,
      );

    const category = await this.prisma.category.findFirst({
      where: {
        ...(isUuid ? { id: identifier } : { slug: identifier }),
        isActive: true,
        deletedAt: null,
      },
      include: {
        parentCategory: {
          select: {
            id: true,
            slug: true,
            name: true,
            // Grandparent too, so the breadcrumb is complete for a 3rd-level
            // (product-type) page: top category → subcategory → type.
            parentCategory: { select: { id: true, slug: true, name: true } },
          },
        },
        subcategories: {
          where: { isActive: true, deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            slug: true,
            name: true,
            emoji: true,
            sortOrder: true,
          },
        },
        _count: {
          select: {
            products: {
              where: { status: ProductStatus.ACTIVE, deletedAt: null },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    // Ancestor path root→self (inclusive), for the breadcrumb + SEO JSON-LD.
    const breadcrumb: { id: string; slug: string | null; name: string }[] = [];
    const gp = category.parentCategory?.parentCategory;
    if (gp) breadcrumb.push({ id: gp.id, slug: gp.slug, name: gp.name });
    if (category.parentCategory) {
      breadcrumb.push({
        id: category.parentCategory.id,
        slug: category.parentCategory.slug,
        name: category.parentCategory.name,
      });
    }
    breadcrumb.push({
      id: category.id,
      slug: category.slug,
      name: category.name,
    });

    const { _count, ...rest } = category;
    return { ...rest, productCount: _count.products, breadcrumb };
  }

  /**
   * Returns the product attributes for a single category.
   *
   * Attributes attach PER PRODUCT TYPE (the leaf of the Category tree — see the
   * marketplace-taxonomy model). Products link to the leaf, and the seller form
   * only ever selects a leaf, so we return that node's attributes ONLY. The old
   * implementation walked self + parent + grandparent and merged their rows,
   * which leaked unrelated attributes (e.g. cooker "Type"/"Nombre de feux"
   * created on a parent category bleeding into every monitor form) into every
   * descendant. Leaf-only makes the set deterministic and correct.
   */
  async getCategoryAttributes(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    // Leaf-only, ENFORCED (not merely assumed). Intermediate nodes still carry
    // legacy pre-refactor attribute rows — « Mode > Homme » holds "Type de peau",
    // « Mode > Enfants » holds "Type de cheveux" — so serving a non-leaf node's
    // own rows is what put cosmetics attributes on a men's shirt. A non-leaf has
    // no legitimate attribute set of its own: return nothing rather than junk.
    //
    // This does NOT delete or hide stored values: a legacy product's existing
    // ProductSpecification rows are untouched, and update() no longer clears
    // specifications it did not serve. See assertLeafCategory in ProductsService.
    const childCount = await this.prisma.category.count({
      where: { parentCategoryId: categoryId, deletedAt: null },
    });

    if (childCount > 0) {
      return [];
    }

    const attributes = await this.prisma.productAttribute.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return attributes;
  }
}
