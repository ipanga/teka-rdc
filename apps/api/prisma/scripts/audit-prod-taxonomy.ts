/**
 * READ-ONLY taxonomy / brand / search-capacity audit.
 *
 * STRICTLY NON-MUTATING. Uses only findMany / findUnique / count / groupBy.
 * Contains no create, createMany, update, updateMany, delete, deleteMany,
 * upsert, $executeRaw, $queryRaw, DDL, migration, seed or transaction.
 *
 * Purpose: quantify the legacy-category drift that Phase 1 fixed forward
 * (docs/seller-catalog-taxonomy.md) so remediation can be planned safely.
 * Public endpoints cannot answer this — browse only exposes ACTIVE products
 * (browse.service.ts:130) and getCategoryAttributes now returns [] for an
 * intermediate node, so non-ACTIVE products and legacy attribute rows are
 * invisible from outside.
 *
 * Deliberately does NOT print sellerId or any user PII: seller identity is not
 * needed to decide a category remediation. Search TERMS are not printed either
 * — only row counts and timestamps.
 *
 * Run (read-only):
 *   cd apps/api && npx tsx --env-file=../../.env.production \
 *     prisma/scripts/audit-prod-taxonomy.ts > /tmp/prod-taxonomy-audit.json
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Cat = { id: string; name: string; parentCategoryId: string | null; deletedAt: Date | null };

async function main() {
  // ── category topology ────────────────────────────────────────────────────
  // ALL categories, including soft-deleted, so "soft-deleted" and "missing"
  // can be told apart.
  const cats: Cat[] = await prisma.category.findMany({
    select: { id: true, name: true, parentCategoryId: true, deletedAt: true },
  });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const liveIds = new Set(cats.filter((c) => !c.deletedAt).map((c) => c.id));

  // A node is intermediate only if it has LIVE children. A node whose children
  // are all soft-deleted is effectively a leaf and must not be treated as one.
  const liveChildCount = new Map<string, number>();
  for (const c of cats) {
    if (c.deletedAt || !c.parentCategoryId) continue;
    liveChildCount.set(c.parentCategoryId, (liveChildCount.get(c.parentCategoryId) ?? 0) + 1);
  }
  const isIntermediate = (id: string) => (liveChildCount.get(id) ?? 0) > 0;
  const intermediateIds = cats.filter((c) => !c.deletedAt && isIntermediate(c.id)).map((c) => c.id);

  const pathOf = (id: string): string => {
    const parts: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 10) {
      parts.unshift(cur.name);
      cur = cur.parentCategoryId ? byId.get(cur.parentCategoryId) : undefined;
    }
    return parts.join(' > ') || '(unknown)';
  };
  const rootOf = (id: string): string => {
    let cur = byId.get(id);
    let guard = 0;
    while (cur?.parentCategoryId && guard++ < 10) cur = byId.get(cur.parentCategoryId);
    return cur?.name ?? '(unknown)';
  };

  // ── Q1 / Q2 — products sitting on an intermediate node ───────────────────
  const productsRaw = await prisma.product.findMany({
    where: { categoryId: { in: intermediateIds } },
    select: {
      id: true, shortCode: true, title: true, status: true, categoryId: true,
      deletedAt: true, brandId: true,
      brand: { select: { name: true } },
      _count: { select: { specifications: true } },
      // NOTE: sellerId deliberately not selected — not needed for taxonomy
      // remediation, and keeps user identifiers out of the report.
    },
    orderBy: { createdAt: 'asc' },
  });

  const products = productsRaw.map((p) => ({
    productId: p.id,
    shortCode: p.shortCode,
    title: p.title,
    status: p.status,
    softDeleted: p.deletedAt !== null,
    categoryId: p.categoryId,
    categoryName: byId.get(p.categoryId)?.name ?? '(missing)',
    categoryPath: pathOf(p.categoryId),
    liveLeafChildren: liveChildCount.get(p.categoryId) ?? 0,
    brandId: p.brandId,
    brandName: p.brand?.name ?? null,
    specificationCount: p._count.specifications,
  }));

  const byStatus: Record<string, number> = {};
  for (const p of products.filter((x) => !x.softDeleted)) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;

  // ── Q3 — their specifications, each classified by its attribute's owner ──
  const specsRaw = await prisma.productSpecification.findMany({
    where: { productId: { in: products.map((p) => p.productId) } },
    select: {
      productId: true, attributeId: true, value: true,
      attribute: { select: { name: true, type: true, categoryId: true } },
    },
  });

  const classifyOwner = (ownerCategoryId: string, productCategoryId: string) => {
    if (!byId.has(ownerCategoryId)) return 'MISSING_CATEGORY';
    if (byId.get(ownerCategoryId)!.deletedAt) return 'SOFT_DELETED_CATEGORY';
    if (ownerCategoryId === productCategoryId) return 'PRODUCTS_OWN_CATEGORY';
    if (isIntermediate(ownerCategoryId)) return 'OTHER_INTERMEDIATE_CATEGORY';
    return 'OTHER_LIVE_CATEGORY';
  };

  const specs = specsRaw.map((s) => {
    const owner = s.attribute.categoryId;
    const prod = products.find((p) => p.productId === s.productId)!;
    return {
      productId: s.productId,
      productShortCode: prod.shortCode,
      attributeId: s.attributeId,
      attributeName: s.attribute.name,
      attributeType: s.attribute.type,
      value: s.value,
      owningCategoryId: owner,
      owningCategoryName: byId.get(owner)?.name ?? '(missing)',
      owningCategoryPath: byId.has(owner) ? pathOf(owner) : '(missing)',
      classification: classifyOwner(owner, prod.categoryId),
    };
  });
  const specsByClass: Record<string, number> = {};
  for (const s of specs) specsByClass[s.classification] = (specsByClass[s.classification] ?? 0) + 1;

  // ── Q4 / Q5a / Q5b — suspect attribute rows, by orphan type ─────────────
  const allAttrs = await prisma.productAttribute.findMany({
    select: { id: true, name: true, type: true, categoryId: true },
  });
  const onIntermediate = allAttrs.filter((a) => liveIds.has(a.categoryId) && isIntermediate(a.categoryId));
  const onSoftDeleted = allAttrs.filter((a) => byId.has(a.categoryId) && byId.get(a.categoryId)!.deletedAt);
  const onMissing = allAttrs.filter((a) => !byId.has(a.categoryId));

  // ── Q6 — referenced vs unreferenced (the safety split) ──────────────────
  const suspectIds = [...new Set([...onIntermediate, ...onSoftDeleted, ...onMissing].map((a) => a.id))];
  const refCounts = suspectIds.length
    ? await prisma.productSpecification.groupBy({
        by: ['attributeId'],
        where: { attributeId: { in: suspectIds } },
        _count: { attributeId: true },
      })
    : [];
  const refMap = new Map(refCounts.map((r) => [r.attributeId, r._count.attributeId]));
  const describe = (a: { id: string; name: string; type: string; categoryId: string }) => ({
    attributeId: a.id, name: a.name, type: a.type,
    categoryId: a.categoryId,
    categoryPath: byId.has(a.categoryId) ? pathOf(a.categoryId) : '(missing)',
    references: refMap.get(a.id) ?? 0,
  });

  // ── BrandCategory audit ─────────────────────────────────────────────────
  const brands = await prisma.brand.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, isActive: true, categories: { select: { categoryId: true } },
              _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
  const linkBuckets = { leaf: 0, intermediate: 0, softDeleted: 0, missing: 0 };
  for (const b of brands) {
    for (const l of b.categories) {
      if (!byId.has(l.categoryId)) linkBuckets.missing++;
      else if (byId.get(l.categoryId)!.deletedAt) linkBuckets.softDeleted++;
      else if (isIntermediate(l.categoryId)) linkBuckets.intermediate++;
      else linkBuckets.leaf++;
    }
  }
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameGroups = new Map<string, string[]>();
  for (const b of brands) nameGroups.set(norm(b.name), [...(nameGroups.get(norm(b.name)) ?? []), b.name]);

  const liveLeaves = cats.filter((c) => !c.deletedAt && !isIntermediate(c.id));
  const realBrands = brands.filter((b) => !/^(autre|other|sans marque)$/i.test(b.name));
  const coverage: Record<string, { leaves: number; leavesWithNoRealBrand: number; realBrandsInTree: number }> = {};
  for (const leaf of liveLeaves) {
    const root = rootOf(leaf.id);
    coverage[root] ??= { leaves: 0, leavesWithNoRealBrand: 0, realBrandsInTree: 0 };
    coverage[root].leaves++;
    if (!realBrands.some((b) => b.categories.some((l) => l.categoryId === leaf.id))) {
      coverage[root].leavesWithNoRealBrand++;
    }
  }
  for (const root of Object.keys(coverage)) {
    coverage[root].realBrandsInTree = realBrands.filter((b) =>
      b.categories.some((l) => liveIds.has(l.categoryId) && rootOf(l.categoryId) === root),
    ).length;
  }

  // ── SearchQuery capacity (counts + timestamps only, never terms) ────────
  const now = Date.now();
  const since = (days: number) => new Date(now - days * 86400000);
  const oldest = await prisma.searchQuery.findMany({
    orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true },
  });
  const newest = await prisma.searchQuery.findMany({
    orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true },
  });
  const searchQuery = {
    totalRows: await prisma.searchQuery.count(),
    oldest: oldest[0]?.createdAt ?? null,
    newest: newest[0]?.createdAt ?? null,
    last24h: await prisma.searchQuery.count({ where: { createdAt: { gte: since(1) } } }),
    last7d: await prisma.searchQuery.count({ where: { createdAt: { gte: since(7) } } }),
    last30d: await prisma.searchQuery.count({ where: { createdAt: { gte: since(30) } } }),
    zeroResultRows: await prisma.searchQuery.count({ where: { resultCount: 0 } }),
  };

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    readOnly: true,
    categories: {
      total: cats.length, live: liveIds.size, softDeleted: cats.length - liveIds.size,
      liveIntermediate: intermediateIds.length, liveLeaves: liveLeaves.length,
    },
    productsOnIntermediateCategories: {
      total: products.length,
      active: products.filter((p) => !p.softDeleted).length,
      softDeleted: products.filter((p) => p.softDeleted).length,
      byStatus,
      items: products,
    },
    specificationsOfThoseProducts: { total: specs.length, byClassification: specsByClass, items: specs },
    suspectAttributes: {
      onLiveIntermediateCategories: { count: onIntermediate.length, items: onIntermediate.map(describe) },
      onSoftDeletedCategories: { count: onSoftDeleted.length, items: onSoftDeleted.map(describe) },
      onMissingCategories: { count: onMissing.length, items: onMissing.map(describe) },
      referenced: suspectIds.filter((id) => (refMap.get(id) ?? 0) > 0).length,
      unreferenced: suspectIds.filter((id) => (refMap.get(id) ?? 0) === 0).length,
    },
    brands: {
      totalBrands: brands.length,
      activeBrands: brands.filter((b) => b.isActive).length,
      totalLinks: brands.reduce((n, b) => n + b.categories.length, 0),
      linksByTarget: linkBuckets,
      brandsWithNoValidLeafLink: brands.filter(
        (b) => !b.categories.some((l) => liveIds.has(l.categoryId) && !isIntermediate(l.categoryId)),
      ).map((b) => b.name),
      nearDuplicateNameGroups: [...nameGroups.values()].filter((v) => v.length > 1),
      brandsWithZeroProducts: brands.filter((b) => b._count.products === 0).length,
      coverageByTopLevelCategory: coverage,
    },
    searchQuery,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('AUDIT FAILED:', e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
