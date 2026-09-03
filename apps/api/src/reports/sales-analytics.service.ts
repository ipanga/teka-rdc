import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  REPORT_DEFAULT_LIMIT,
  REPORT_MAX_LIMIT,
} from './dto/report-query.dto';
import {
  SalesBreakdownQueryDto,
  SalesDimension,
} from './dto/sales-breakdown-query.dto';
import { resolveWindow } from './report-window.util';
import {
  CSV_MAX_ROWS,
  csvMoneyFC,
  csvNumber,
  csvText,
  writeCsvResponse,
} from '../common/utils/csv.util';

/**
 * Sales analytics — what actually SOLD, broken down by product, category,
 * seller, town or day.
 *
 * ─── What counts as a sale ───────────────────────────────────────────────
 *
 * Derived from the code, not from the shape of the enum:
 *
 *   status = 'DELIVERED' AND "deletedAt" IS NULL
 *
 * `AdminOrdersService.markDelivered()` is the single moment a sale completes:
 * it stamps `deliveredAt`, flips a COD order's `paymentStatus` to COMPLETED
 * (the delivery agent collects the cash at the door), increments
 * `Product.unitsSold`, and triggers `EarningsService.createEarning()`. Nothing
 * earlier does any of that — an order that is merely CONFIRMED, PROCESSING,
 * READY_FOR_TEKA_PICKUP, RECEIVED_AT_TEKA or OUT_FOR_DELIVERY has been paid
 * for by nobody.
 *
 * CANCELLED is excluded because it never delivered and its stock was restored.
 * RETURNED needs no special exclusion: `ReturnsService.approveReturn()` moves
 * the order OFF `DELIVERED` (to RETURNED), restocks it and reverses the
 * earning, so `status = 'DELIVERED'` already excludes it. It is reported as a
 * separate counter rather than silently folded in.
 *
 * ─── Why `deliveredAt` is the time axis, and why it is applied CONDITIONALLY ──
 *
 * Revenue is recognised at delivery, so a sales report must bucket on
 * `deliveredAt`, not `createdAt` (an order placed in June and delivered in July
 * is a July sale).
 *
 * BUT `deliveredAt` is not guaranteed to be set on a DELIVERED order:
 *   - `AdminOrdersService.forceStatusChange()` writes only `{ status }` — the
 *     manual escape hatch stamps no timestamp;
 *   - `prisma/seed.ts` sets `status: DELIVERED` and never sets `deliveredAt`
 *     at all (zero occurrences in the file).
 * On the development database this is not hypothetical: BOTH delivered orders
 * have `deliveredAt IS NULL`, so a strictly windowed query returns zero rows.
 *
 * Silently dropping those orders would under-report sales with no signal. So
 * the window is applied ONLY when the caller supplies a date bound; an
 * unfiltered report covers every delivered order, and the summary exposes
 * `deliveredWithoutDate` so the gap is visible instead of invisible.
 *
 * ─── What "revenue" means here ───────────────────────────────────────────
 *
 * Merchandise revenue: SUM(order_items."totalCDF"), which is
 * `unitPriceCDF x quantity` — the price actually charged, discount already
 * applied (`CheckoutService` snapshots `discountPriceCDF ?? priceCDF` into
 * `unitPriceCDF`). It equals `Order.subtotalCDF` and therefore EXCLUDES the
 * delivery fee, deliberately: a delivery fee belongs to an order, not to a
 * product or a category, so including it would make the product and category
 * dimensions incomparable with the others. `discountCDF` reports the buyer's
 * saving, reconstructed from the `listUnitPriceCDF` snapshot the schema keeps
 * for exactly this purpose.
 *
 * ─── Query shape ─────────────────────────────────────────────────────────
 *
 * Every dimension aggregates over `order_items ⋈ orders` in ONE statement, so
 * all five return the identical row shape and the same revenue definition, and
 * none of them can regress into an N+1. Prisma `groupBy` cannot express these:
 * they need a join, `COUNT(DISTINCT o.id)`, a CASE-guarded discount sum, and
 * for town a COALESCE + accent-folded grouping key distinct from its display
 * label. Raw SQL is parameterised via `Prisma.sql` tagged templates, the same
 * approach `AdminStatsService.getDashboardTrends()` already uses.
 */

/** One row of a breakdown — identical for every dimension. */
export interface SalesBreakdownRow {
  key: string | null;
  label: string;
  orders: number;
  units: number;
  revenueCDF: string;
  discountCDF: string;
}

interface RawRow {
  key: string | null;
  label: string | null;
  orders: bigint | number;
  units: bigint | number;
  revenue: string | null;
  discount: string | null;
}

@Injectable()
export class SalesAnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * The sale predicate, shared by every query in this service.
   *
   * The `deliveredAt` bounds are appended only when supplied — see the class
   * docblock for why an unconditional window would silently drop orders.
   */
  private saleWhere(query: SalesBreakdownQueryDto): Prisma.Sql {
    const { gte, lt } = resolveWindow(query.dateFrom, query.dateTo);
    const parts: Prisma.Sql[] = [
      Prisma.sql`o."status" = 'DELIVERED'`,
      Prisma.sql`o."deletedAt" IS NULL`,
    ];
    if (gte) parts.push(Prisma.sql`o."deliveredAt" >= ${gte}`);
    if (lt) parts.push(Prisma.sql`o."deliveredAt" < ${lt}`);
    if (query.sellerId) parts.push(Prisma.sql`o."sellerId"::text = ${query.sellerId}`);
    return Prisma.join(parts, ' AND ');
  }

  private resolvePage(query: SalesBreakdownQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(query.limit ?? REPORT_DEFAULT_LIMIT, 1),
      REPORT_MAX_LIMIT,
    );
    return { page, limit, skip: (page - 1) * limit, take: limit };
  }

  /** Shared numeric projection so every dimension reports the same measures. */
  private measures(): Prisma.Sql {
    return Prisma.sql`
      COUNT(DISTINCT o."id")::int AS orders,
      COALESCE(SUM(oi."quantity"), 0)::int AS units,
      COALESCE(SUM(oi."totalCDF"), 0)::text AS revenue,
      COALESCE(SUM(
        CASE WHEN oi."listUnitPriceCDF" IS NOT NULL
             THEN (oi."listUnitPriceCDF" - oi."unitPriceCDF") * oi."quantity"
             ELSE 0 END
      ), 0)::text AS discount`;
  }

  private toRows(raw: RawRow[]): SalesBreakdownRow[] {
    return raw.map((r) => ({
      key: r.key ?? null,
      label: r.label ?? '(inconnu)',
      orders: Number(r.orders),
      units: Number(r.units),
      revenueCDF: r.revenue ?? '0',
      discountCDF: r.discount ?? '0',
    }));
  }

  /**
   * Headline totals for the same filtered set, plus the two counters that make
   * the numbers interpretable rather than merely present.
   */
  async getSummary(query: SalesBreakdownQueryDto) {
    const where = this.saleWhere(query);
    const { gte, lt } = resolveWindow(query.dateFrom, query.dateTo);

    const [totals] = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT NULL::text AS key, NULL::text AS label, ${this.measures()}
      FROM "orders" o
      JOIN "order_items" oi ON oi."orderId" = o."id"
      WHERE ${where}
    `);

    // Orders excluded from every WINDOWED query because they carry no
    // deliveredAt (forceStatusChange / seeded rows). Reported so the gap is
    // visible; counted against the same seller filter, without the window.
    const sellerScope = query.sellerId
      ? Prisma.sql`AND o."sellerId"::text = ${query.sellerId}`
      : Prisma.empty;
    const [gap] = await this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM "orders" o
      WHERE o."status" = 'DELIVERED' AND o."deletedAt" IS NULL
        AND o."deliveredAt" IS NULL ${sellerScope}
    `);

    const [returned] = await this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM "orders" o
      WHERE o."status" = 'RETURNED' AND o."deletedAt" IS NULL ${sellerScope}
        ${gte ? Prisma.sql`AND o."deliveredAt" >= ${gte}` : Prisma.empty}
        ${lt ? Prisma.sql`AND o."deliveredAt" < ${lt}` : Prisma.empty}
    `);

    const [cancelled] = await this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM "orders" o
      WHERE o."status" = 'CANCELLED' AND o."deletedAt" IS NULL ${sellerScope}
        ${gte ? Prisma.sql`AND o."createdAt" >= ${gte}` : Prisma.empty}
        ${lt ? Prisma.sql`AND o."createdAt" < ${lt}` : Prisma.empty}
    `);

    const row = this.toRows([totals])[0];
    return {
      completedOrders: row.orders,
      unitsSold: row.units,
      revenueCDF: row.revenueCDF,
      discountCDF: row.discountCDF,
      // Not sales — reported alongside so the headline cannot be misread.
      returnedOrders: Number(returned?.n ?? 0),
      cancelledOrders: Number(cancelled?.n ?? 0),
      deliveredWithoutDate: Number(gap?.n ?? 0),
      windowApplied: Boolean(gte || lt),
    };
  }

  /** Breakdown rows for one dimension, paginated. */
  async getBreakdown(query: SalesBreakdownQueryDto) {
    const { page, limit, skip, take } = this.resolvePage(query);
    const by: SalesDimension = query.by ?? 'day';

    // category and day are grouped in application code / bounded by the DTO's
    // 366-day cap, so their group count cannot run away and in-memory paging is
    // safe. product / seller / town are unbounded and page in SQL.
    if (by === 'category' || by === 'day') {
      const all =
        by === 'category'
          ? await this.collectCategoryRows(query)
          : await this.collectDayRows(query);
      return {
        data: all.slice(skip, skip + take),
        pagination: {
          page,
          limit,
          total: all.length,
          totalPages: Math.ceil(all.length / limit),
        },
      };
    }

    const [rows, total] = await Promise.all([
      this.collectSqlRows(query, by, skip, take),
      this.countGroups(query, by),
    ]);
    return {
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** The grouping key + display label for each SQL-paged dimension. */
  private groupExpr(by: SalesDimension): { key: Prisma.Sql; label: Prisma.Sql; join: Prisma.Sql } {
    switch (by) {
      case 'product':
        return {
          // The productTitle SNAPSHOT, not products.title: a renamed or
          // soft-deleted product must still label its own historical sales.
          key: Prisma.sql`oi."productId"::text`,
          label: Prisma.sql`MAX(oi."productTitle")`,
          join: Prisma.empty,
        };
      case 'seller':
        return {
          key: Prisma.sql`o."sellerId"::text`,
          label: Prisma.sql`MAX(COALESCE(NULLIF(TRIM(sp."businessName"), ''), TRIM(CONCAT(u."firstName", ' ', u."lastName"))))`,
          join: Prisma.sql`
            LEFT JOIN "users" u ON u."id" = o."sellerId"
            LEFT JOIN "seller_profiles" sp ON sp."userId" = o."sellerId"`,
        };
      case 'town':
      default:
        return {
          // Town comes from the order's delivery SNAPSHOT, never from a live
          // join to addresses (docs/order-workflow.md — a buyer edits their one
          // address, which would retroactively rewrite past orders). The
          // relation is only the pre-backfill fallback, exactly as
          // resolveDeliveryAddress() does it. Grouped accent- and case-folded
          // so "Lubumbashi" and "lubumbashi" are one town, with a readable
          // label kept separately.
          key: Prisma.sql`public.f_unaccent(LOWER(COALESCE(o."deliveryTown", a."town")))`,
          label: Prisma.sql`MAX(COALESCE(o."deliveryTown", a."town"))`,
          join: Prisma.sql`LEFT JOIN "addresses" a ON a."id" = o."deliveryAddressId"`,
        };
    }
  }

  private async collectSqlRows(
    query: SalesBreakdownQueryDto,
    by: SalesDimension,
    skip: number,
    take: number,
  ): Promise<SalesBreakdownRow[]> {
    const { key, label, join } = this.groupExpr(by);
    const raw = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT ${key} AS key, ${label} AS label, ${this.measures()}
      FROM "orders" o
      JOIN "order_items" oi ON oi."orderId" = o."id"
      ${join}
      WHERE ${this.saleWhere(query)}
      GROUP BY ${key}
      ORDER BY SUM(oi."totalCDF") DESC, ${key} ASC
      LIMIT ${take} OFFSET ${skip}
    `);
    return this.toRows(raw);
  }

  private async countGroups(
    query: SalesBreakdownQueryDto,
    by: SalesDimension,
  ): Promise<number> {
    const { key, join } = this.groupExpr(by);
    const [row] = await this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM (
        SELECT ${key} AS key
        FROM "orders" o
        JOIN "order_items" oi ON oi."orderId" = o."id"
        ${join}
        WHERE ${this.saleWhere(query)}
        GROUP BY ${key}
      ) g
    `);
    return Number(row?.n ?? 0);
  }

  /**
   * Category sales, rolled up to the ROOT category.
   *
   * Grouped at leaf level in SQL (bounded by taxonomy size, ~350 rows) then
   * walked up `parentCategoryId` in application code — the same `rootIdOf`
   * approach `AdminStatsService.getCatalogCoverage()` already uses and which is
   * already covered by its own tests. A recursive CTE would move a solved,
   * tested walk into SQL for no gain in bound.
   */
  private async collectCategoryRows(
    query: SalesBreakdownQueryDto,
  ): Promise<SalesBreakdownRow[]> {
    const raw = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT p."categoryId"::text AS key, NULL::text AS label, ${this.measures()}
      FROM "orders" o
      JOIN "order_items" oi ON oi."orderId" = o."id"
      JOIN "products" p ON p."id" = oi."productId"
      WHERE ${this.saleWhere(query)}
      GROUP BY p."categoryId"
    `);
    if (raw.length === 0) return [];

    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true, parentCategoryId: true },
    });
    const byId = new Map(categories.map((c) => [c.id, c]));
    const rootOf = (categoryId: string): { id: string; name: string } | null => {
      let current = byId.get(categoryId);
      // Bounded by tree depth (3 levels today).
      while (current?.parentCategoryId) {
        const parent = byId.get(current.parentCategoryId);
        if (!parent) break;
        current = parent;
      }
      return current ? { id: current.id, name: current.name } : null;
    };

    const merged = new Map<string, SalesBreakdownRow>();
    for (const row of this.toRows(raw)) {
      const root = row.key ? rootOf(row.key) : null;
      const id = root?.id ?? row.key ?? 'unknown';
      const existing = merged.get(id);
      if (existing) {
        existing.orders += row.orders;
        existing.units += row.units;
        existing.revenueCDF = (
          BigInt(existing.revenueCDF) + BigInt(row.revenueCDF)
        ).toString();
        existing.discountCDF = (
          BigInt(existing.discountCDF) + BigInt(row.discountCDF)
        ).toString();
      } else {
        merged.set(id, {
          key: id,
          label: root?.name ?? '(catégorie inconnue)',
          orders: row.orders,
          units: row.units,
          revenueCDF: row.revenueCDF,
          discountCDF: row.discountCDF,
        });
      }
    }
    return [...merged.values()].sort(
      (a, b) =>
        Number(BigInt(b.revenueCDF) - BigInt(a.revenueCDF)) ||
        a.label.localeCompare(b.label),
    );
  }

  /**
   * Daily buckets in Africa/Lubumbashi (CAT, UTC+2, no DST). Bucketing in UTC
   * would put every 22:00-00:00 local delivery on the previous day.
   *
   * Rows with no `deliveredAt` cannot be bucketed at all and are excluded here;
   * `getSummary().deliveredWithoutDate` is what makes that visible.
   */
  private async collectDayRows(
    query: SalesBreakdownQueryDto,
  ): Promise<SalesBreakdownRow[]> {
    const raw = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT to_char(
               date_trunc('day', o."deliveredAt" AT TIME ZONE 'Africa/Lubumbashi'),
               'YYYY-MM-DD') AS key,
             to_char(
               date_trunc('day', o."deliveredAt" AT TIME ZONE 'Africa/Lubumbashi'),
               'YYYY-MM-DD') AS label,
             ${this.measures()}
      FROM "orders" o
      JOIN "order_items" oi ON oi."orderId" = o."id"
      WHERE ${this.saleWhere(query)} AND o."deliveredAt" IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `);
    return this.toRows(raw);
  }

  /** CSV export — the whole filtered set, never a single page. */
  async generateBreakdownCsv(query: SalesBreakdownQueryDto, res: Response) {
    const by: SalesDimension = query.by ?? 'day';
    const all =
      by === 'category'
        ? await this.collectCategoryRows(query)
        : by === 'day'
          ? await this.collectDayRows(query)
          : await this.collectSqlRows(query, by, 0, CSV_MAX_ROWS + 1);

    const dimensionLabel: Record<SalesDimension, string> = {
      product: 'Produit',
      category: 'Catégorie',
      seller: 'Vendeur',
      town: 'Ville',
      day: 'Jour',
    };

    writeCsvResponse(res, {
      filename: `ventes-${by}-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: [
        dimensionLabel[by],
        'Commandes livrées',
        'Unités vendues',
        'Chiffre d’affaires (FC)',
        'Remises accordées (FC)',
      ],
      rows: all.map((r) => [
        csvText(r.label),
        csvNumber(r.orders),
        csvNumber(r.units),
        csvMoneyFC(r.revenueCDF),
        csvMoneyFC(r.discountCDF),
      ]),
    });
  }
}
