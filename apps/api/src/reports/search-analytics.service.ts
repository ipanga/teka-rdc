import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  REPORT_DEFAULT_LIMIT,
  REPORT_MAX_LIMIT,
} from './dto/report-query.dto';
import {
  SearchAnalyticsQueryDto,
  SearchBreakdownDimension,
  SearchBreakdownQueryDto,
} from './dto/search-analytics-query.dto';
import { resolveWindow } from './report-window.util';
import {
  CSV_MAX_ROWS,
  csvNumber,
  csvText,
  writeCsvResponse,
} from '../common/utils/csv.util';

/**
 * Admin search analytics — the read side of the telemetry written by
 * `BrowseService.logSearch`.
 *
 * ─── What "a search" means here, and therefore every denominator ─────────
 *
 * Every row in `search_queries` is already a MEANINGFUL search: the write path
 * stores only `SUBMIT` and `SUGGESTION`. A `REFINE` re-fetch (filter, sort,
 * page, pull-to-refresh), an unrecognised intent, and any term under two
 * characters are dropped before insert and never appear. So "total searches"
 * is a count of rows, and it is the denominator for every rate on this page —
 * there is no hidden second population.
 *
 * `UNKNOWN` source means "a client predating the `searchSource` parameter".
 * It is reported as its own cohort and is NEVER folded into BUYER_WEB.
 *
 * ─── Query shape ─────────────────────────────────────────────────────────
 *
 * Aggregation is pushed into Postgres; nothing iterates rows in application
 * code. Town labels are hydrated with ONE `city.findMany({ id: { in } })` after
 * grouping, so no dimension can degrade into an N+1. Every listing is bounded
 * by the DTO's pagination, every export by `CSV_MAX_ROWS`, and the date range
 * by the inherited 366-day cap.
 *
 * No index was added. The real table was EXPLAINed for all three query shapes
 * (top terms, zero-result, trend): Postgres seq-scans it in 0.05-0.19 ms with
 * planning time at or above execution time. An index would never be chosen and
 * would add write cost to the buyer's hot search path. Revisit at roughly the
 * low hundreds of thousands of rows, or when EXPLAIN shows the filter
 * dominating.
 */

/** A search returning 1..N products is "poorly covered". Stated in the UI label. */
export const LOW_RESULT_MAX = 3;

interface TermRow {
  key: string;
  label: string | null;
  searches: bigint | number;
  zeroResults: bigint | number;
  lastSeen: Date | null;
  maxResultCount: number | null;
  avgResultCount: string | number | null;
}

@Injectable()
export class SearchAnalyticsService {
  constructor(private prisma: PrismaService) {}

  /** The filter predicate shared by every query in this service. */
  private where(query: SearchAnalyticsQueryDto): Prisma.Sql {
    const { gte, lt } = resolveWindow(query.dateFrom, query.dateTo);
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (gte) parts.push(Prisma.sql`sq."createdAt" >= ${gte}`);
    if (lt) parts.push(Prisma.sql`sq."createdAt" < ${lt}`);
    if (query.cityId) parts.push(Prisma.sql`sq."cityId"::text = ${query.cityId}`);
    if (query.source) {
      parts.push(Prisma.sql`sq."source"::text = ${query.source}`);
    }
    if (query.intent) {
      parts.push(Prisma.sql`sq."intent"::text = ${query.intent}`);
    }
    if (query.zeroResultsOnly === 'true') {
      parts.push(Prisma.sql`sq."resultCount" = 0`);
    }
    return Prisma.join(parts, ' AND ');
  }

  private resolvePage(query: SearchAnalyticsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(query.limit ?? REPORT_DEFAULT_LIMIT, 1),
      REPORT_MAX_LIMIT,
    );
    return { page, limit, skip: (page - 1) * limit, take: limit };
  }

  /**
   * Headline metrics. Every rate's denominator is `totalSearches` — the rows
   * matching the active filters.
   */
  async getSummary(query: SearchAnalyticsQueryDto) {
    const where = this.where(query);
    const [row] = await this.prisma.$queryRaw<
      {
        total: bigint;
        unique_terms: bigint;
        zero: bigint;
        low: bigint;
        suggestion: bigint;
        unknown_source: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*)::bigint                                                   AS total,
        COUNT(DISTINCT sq."termNormalized")::bigint                        AS unique_terms,
        COUNT(*) FILTER (WHERE sq."resultCount" = 0)::bigint               AS zero,
        COUNT(*) FILTER (WHERE sq."resultCount" BETWEEN 1 AND ${LOW_RESULT_MAX})::bigint AS low,
        COUNT(*) FILTER (WHERE sq."intent" = 'SUGGESTION')::bigint         AS suggestion,
        COUNT(*) FILTER (WHERE sq."source" = 'UNKNOWN')::bigint            AS unknown_source
      FROM "search_queries" sq
      WHERE ${where}
    `);

    const total = Number(row?.total ?? 0);
    const rate = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
    const zero = Number(row?.zero ?? 0);
    const low = Number(row?.low ?? 0);
    const suggestion = Number(row?.suggestion ?? 0);

    return {
      // Population for every rate below.
      totalSearches: total,
      uniqueTerms: Number(row?.unique_terms ?? 0),
      zeroResultSearches: zero,
      zeroResultRate: rate(zero),
      lowResultSearches: low,
      lowResultRate: rate(low),
      lowResultMax: LOW_RESULT_MAX,
      suggestionSearches: suggestion,
      suggestionRate: rate(suggestion),
      // Rows whose surface is unattributable. Surfaced so an admin can judge
      // how much of the split below is actually known.
      unknownSourceSearches: Number(row?.unknown_source ?? 0),
    };
  }

  /**
   * Term listing — the main table. One row per normalised term.
   *
   * `maxResultCount` is what separates the two very different reasons a term
   * can show zero results:
   *   - max = 0  -> the term has NEVER returned anything, anywhere. A catalog
   *                 gap, or a search-quality problem (typo, missing synonym).
   *   - max > 0  -> it DOES return products somewhere, so a zero here is a
   *                 town-coverage gap, not a missing product.
   * Reporting that distinction is the point; the page must not imply that every
   * zero-result term is demand Teka should stock.
   */
  async getTerms(query: SearchAnalyticsQueryDto) {
    const { page, limit, skip, take } = this.resolvePage(query);
    const where = this.where(query);

    const [rows, countRow] = await Promise.all([
      this.prisma.$queryRaw<TermRow[]>(Prisma.sql`
        SELECT
          sq."termNormalized"                       AS key,
          MAX(sq."term")                            AS label,
          COUNT(*)::bigint                          AS searches,
          COUNT(*) FILTER (WHERE sq."resultCount" = 0)::bigint AS "zeroResults",
          MAX(sq."createdAt")                       AS "lastSeen",
          MAX(sq."resultCount")::int                AS "maxResultCount",
          ROUND(AVG(sq."resultCount"), 1)::text     AS "avgResultCount"
        FROM "search_queries" sq
        WHERE ${where}
        GROUP BY sq."termNormalized"
        ORDER BY COUNT(*) DESC, sq."termNormalized" ASC
        LIMIT ${take} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS n FROM (
          SELECT sq."termNormalized"
          FROM "search_queries" sq
          WHERE ${where}
          GROUP BY sq."termNormalized"
        ) g
      `),
    ]);

    const total = Number(countRow[0]?.n ?? 0);
    return {
      data: rows.map((r) => ({
        term: r.label ?? r.key,
        termNormalized: r.key,
        searches: Number(r.searches),
        zeroResults: Number(r.zeroResults),
        lastSeen: r.lastSeen ? r.lastSeen.toISOString() : null,
        maxResultCount: Number(r.maxResultCount ?? 0),
        avgResultCount: Number(r.avgResultCount ?? 0),
        // true only when the term has never once returned a product.
        neverAnyResult: Number(r.maxResultCount ?? 0) === 0,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Trending terms: the selected window is split in half and the recent half is
   * compared with the one immediately before it.
   *
   * Ranked by ABSOLUTE DELTA, not by percentage. With Teka's volumes a
   * percentage from a small baseline is noise, and from a zero baseline it is
   * undefined — so a term unseen in the previous half is flagged `isNew` rather
   * than being given an infinite growth rate. Both halves are counted in ONE
   * pass with FILTER, so this stays a single bounded query.
   *
   * Honest limitation, and it is shown in the UI: at current volumes this
   * answers "what is being searched now that was not before", not a
   * statistically significant trend.
   */
  async getTrending(query: SearchAnalyticsQueryDto) {
    const { page, limit, skip, take } = this.resolvePage(query);
    const { gte, lt } = resolveWindow(query.dateFrom, query.dateTo);

    // Default to the last 30 days when the caller gave no range, so "trending"
    // always has a defined, equal-length pair of windows.
    const end = lt ?? new Date();
    const start =
      gte ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const mid = new Date((start.getTime() + end.getTime()) / 2);

    const scoped: SearchAnalyticsQueryDto = { ...query, dateFrom: undefined, dateTo: undefined };
    const filters = this.where(scoped);

    const rows = await this.prisma.$queryRaw<
      { key: string; label: string | null; recent: bigint; previous: bigint }[]
    >(Prisma.sql`
      SELECT sq."termNormalized" AS key,
             MAX(sq."term")      AS label,
             COUNT(*) FILTER (WHERE sq."createdAt" >= ${mid})::bigint AS recent,
             COUNT(*) FILTER (WHERE sq."createdAt" <  ${mid})::bigint AS previous
      FROM "search_queries" sq
      WHERE ${filters} AND sq."createdAt" >= ${start} AND sq."createdAt" < ${end}
      GROUP BY sq."termNormalized"
      HAVING COUNT(*) FILTER (WHERE sq."createdAt" >= ${mid}) > 0
      ORDER BY (COUNT(*) FILTER (WHERE sq."createdAt" >= ${mid})
              - COUNT(*) FILTER (WHERE sq."createdAt" <  ${mid})) DESC,
               COUNT(*) DESC
    `);

    const data = rows.map((r) => {
      const recent = Number(r.recent);
      const previous = Number(r.previous);
      return {
        term: r.label ?? r.key,
        termNormalized: r.key,
        recent,
        previous,
        delta: recent - previous,
        // No percentage from a zero baseline — flagged as new instead.
        isNew: previous === 0,
      };
    });

    return {
      data: data.slice(skip, skip + take),
      window: {
        start: start.toISOString(),
        mid: mid.toISOString(),
        end: end.toISOString(),
      },
      pagination: {
        page,
        limit,
        total: data.length,
        totalPages: Math.ceil(data.length / limit),
      },
    };
  }

  /** Dimensional splits: by source, intent, town or day. */
  async getBreakdown(query: SearchBreakdownQueryDto) {
    const by: SearchBreakdownDimension = query.by ?? 'day';
    const where = this.where(query);

    const keyExpr: Record<SearchBreakdownDimension, Prisma.Sql> = {
      source: Prisma.sql`sq."source"::text`,
      intent: Prisma.sql`sq."intent"::text`,
      town: Prisma.sql`sq."cityId"::text`,
      // CAT, not UTC — a 22:30Z search is already the next local day.
      day: Prisma.sql`to_char(date_trunc('day', sq."createdAt" AT TIME ZONE 'Africa/Lubumbashi'), 'YYYY-MM-DD')`,
    };

    const rows = await this.prisma.$queryRaw<
      { key: string | null; searches: bigint; zero: bigint }[]
    >(Prisma.sql`
      SELECT ${keyExpr[by]} AS key,
             COUNT(*)::bigint AS searches,
             COUNT(*) FILTER (WHERE sq."resultCount" = 0)::bigint AS zero
      FROM "search_queries" sq
      WHERE ${where}
      GROUP BY ${keyExpr[by]}
      ORDER BY ${by === 'day' ? Prisma.sql`1 ASC` : Prisma.sql`COUNT(*) DESC`}
    `);

    // Town labels: ONE lookup for the whole page, never one per row.
    let names = new Map<string, string>();
    if (by === 'town') {
      const ids = rows.map((r) => r.key).filter((k): k is string => Boolean(k));
      if (ids.length > 0) {
        const cities = await this.prisma.city.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        names = new Map(cities.map((c) => [c.id, c.name]));
      }
    }

    return {
      data: rows.map((r) => ({
        key: r.key,
        label:
          by === 'town'
            ? r.key
              ? (names.get(r.key) ?? '(ville inconnue)')
              : 'Sans ville'
            : (r.key ?? '(inconnu)'),
        searches: Number(r.searches),
        zeroResults: Number(r.zero),
      })),
    };
  }

  /**
   * CSV export of the raw events matching the active filters.
   *
   * Raw rather than aggregated on purpose: the aggregated tables are on screen,
   * whereas an export is what an admin pivots elsewhere. Uses the shared writer
   * from the CSV-hardening change, so free text is formula-guarded and numbers
   * stay numeric.
   */
  async generateCsv(query: SearchAnalyticsQueryDto, res: Response) {
    const where = this.where(query);
    const rows = await this.prisma.$queryRaw<
      {
        createdAt: Date;
        term: string;
        termNormalized: string;
        source: string;
        intent: string;
        resultCount: number;
        cityName: string | null;
      }[]
    >(Prisma.sql`
      SELECT sq."createdAt", sq."term", sq."termNormalized",
             sq."source"::text AS source, sq."intent"::text AS intent,
             sq."resultCount", c."name" AS "cityName"
      FROM "search_queries" sq
      LEFT JOIN "cities" c ON c."id" = sq."cityId"
      WHERE ${where}
      ORDER BY sq."createdAt" DESC
      LIMIT ${CSV_MAX_ROWS + 1}
    `);

    writeCsvResponse(res, {
      filename: `recherches-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: [
        'Date',
        'Terme recherché',
        'Terme normalisé',
        'Source',
        'Intention',
        'Ville',
        'Résultats',
        'Sans résultat',
      ],
      rows: rows.map((r) => [
        csvText(r.createdAt.toISOString()),
        csvText(r.term),
        csvText(r.termNormalized),
        csvText(r.source),
        csvText(r.intent),
        csvText(r.cityName ?? ''),
        csvNumber(r.resultCount),
        csvText(r.resultCount === 0 ? 'oui' : 'non'),
      ]),
    });
  }
}
