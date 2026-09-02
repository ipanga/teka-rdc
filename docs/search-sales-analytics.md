# Search & Sales Analytics — Workstreams B, C, D

**Started:** 2026-09-03
**Surfaces:** `apps/api`, `apps/admin-web`, `apps/buyer-web`, `apps/buyer-mobile`, `apps/seller-mobile`
**Status:** PR 1 (#625) and PR 2 open against `develop`. **Nothing merged, nothing deployed, no
production migration run.**

## Why this exists

The Seller Catalog Taxonomy initiative completed **Workstream A only** and said so explicitly
(`docs/seller-catalog-taxonomy.md:6`). This picks up the three that were never started:

- **B — search analytics.** `SearchQuery` has been written since June 2026 but is read by *no* admin
  surface; its only consumer is the public `/v1/browse/search/popular` autocomplete endpoint.
- **C — sales analytics.** No product, category or town dimension exists anywhere, and the existing
  sales report applies **no status filter at all**, so cancelled orders count as sales.
- **D — CSV.** Exports existed but had no formula-injection guard and no tests.

Search itself is mature (French FTS over an unaccented generated `search_vector`, pg_trgm
`word_similarity` for typo tolerance, admin-editable synonyms, town scoping) and is **not** being
changed.

## Decisions

- **Search event model stays minimal.** Production holds 53 `SearchQuery` rows over ~70 days, 33 of
  them zero-result. No session ids, no click attribution, no retention infrastructure at this volume.
- **`source` travels as a query param, not a header.** `main.ts:87` has an explicit CORS
  `allowedHeaders` allowlist, and `surface.util.ts:18` defaults `X-Teka-Surface` to `'buyer'` — so
  reusing it would confidently mislabel every mobile search as web. A wrong analytics column is worse
  than `UNKNOWN`.
- **`forbidNonWhitelisted: true` (`main.ts:94`) means the API ships before the clients.** An
  undeclared query param is a hard 400, not a silent drop.
- **Autocomplete noise is stopped with an explicit `searchIntent`, not server-side prefix collapse.**
  Collapse keyed on `(source, cityId, term)` has no client identity and would merge two different
  buyers searching the same term seconds apart.

## Measured baseline (2026-09-02, on `develop`)

**API 313 unit + 118 e2e · buyer-web 68 (vitest).** CLAUDE.md (271) and
`docs/seller-catalog-taxonomy.md:92` (287) are both **stale**.

## PR 1 — shared CSV writer (#625)

`apps/api/src/common/utils/csv.util.ts`; all four generators moved onto it; `escapeCsv` deleted.

**The defect.** `escapeCsv` did RFC-4180 quoting only, so a cell starting with `=`, `+`, `-`, `@`, TAB
or CR was emitted verbatim — and seller `businessName`, buyer/seller names and admin-typed
`rejectionReason` all reach these files.

**Two decisions worth keeping.**

1. **The guard is split by cell kind.** Applying a formula prefix to a *number* would prefix every
   negative amount with `'`, Excel would read the column as text, and `SUM()` in the finance sheet
   would silently break. `csvText` guards; `csvNumber`/`csvMoneyFC` do not, and each asserts its own
   output is numeric.
2. **Formula detection checks raw AND trimmed.** Trimming alone cannot replace the raw check — `\s`
   matches TAB and CR, which are themselves formula-starting characters. The first draft had only the
   trimmed check and the TAB/CR tests caught it.

`csvMoneyFC` is deliberately **not** `formatFC` from `@teka/shared`: that emits `"52.957 FC"`, which
every Excel locale reads as text.

Column sets, headers and values unchanged. One improvement falls out: a `+243…` payout phone is no
longer evaluated by Excel into `243970000001`. French headers and centimes→francs are deferred to
their own PR, since finance may have sheets keyed on the current English headers.

## PR 2 — report windows, bounds, pagination, N+1

### Date windows — `apps/api/src/reports/report-window.util.ts`

Replaces `buildDateFilter`, which called `endDate.setHours(23, 59, 59, 999)`. Three bugs in one line:
it read the **server's** timezone, it left a last-millisecond hole, and it ignored that Teka operates
in **Africa/Lubumbashi (CAT, UTC+2, no DST)** — so a UTC bucket puts every 22:00–00:00 local delivery
on the previous day.

Now a half-open `[gte, lt)` window anchored to CAT. `dateTo` stays inclusive to the caller.
`AdminStatsService` is **deliberately not** retrofitted — that would change dashboard numbers already
on screen, and belongs in its own change.

### Bounds — `dto/report-query.dto.ts` + `common/validators/date-range.validator.ts`

`dateFrom <= dateTo`, a 366-day maximum span, and `page`/`limit` (max 200). All messages French.

Validated in a **unit** spec, not e2e: Nest runs **guards before pipes**, so an unauthenticated
request to an `@Roles('ADMIN')` route returns 401 and never reaches validation.

### Pagination

All four reports now return `{ data, pagination: { page, limit, total, totalPages } }` — the same
envelope `AdminOrdersService` already uses. **CSV exports are not paginated**: they call the same
private collector with `CSV_MAX_ROWS + 1`, so `page`/`limit` are ignored on the export path.

`apps/admin-web/.../reports/page.tsx` changes in the same PR — it derived its columns from
`Array.isArray(res.data)` → `Object.keys(rows[0])`, so the new envelope would have silently blanked
the table. The client-side `slice(0, 50)` is replaced by real server paging, and a failed fetch now
renders a distinct error state with a retry instead of "Aucune donnée pour cette période".

### The N+1

`getSellerPerformanceReport` issued **four queries per seller** (3 × `order.count` + 1 ×
`sellerEarning.aggregate`) inside a `Promise.all` over an *unbounded* seller list. Now a fixed **four
queries total** — count + page + `order.groupBy(['sellerId','status'])` + `sellerEarning.groupBy`.

`user.findMany` gained `orderBy: { createdAt: 'desc' }`: paging an unordered `findMany` can repeat or
skip rows between pages.

## Verification actually performed (PR 2)

Against a **local API on the dev DB** (8 orders spanning every status, 10 sellers, 1 payout), using a
dev-signed admin JWT — `admin@teka.cd` is seeded out-of-band and its password was not available, and
was **not** changed.

- **Envelope** — `/sales` returns `{success, data:{data, pagination}}`, `pagination` =
  `{page:1, limit:2, total:8, totalPages:4}`, column keys unchanged. All four tabs verified.
- **Paging** — pages 1 and 2 return disjoint order numbers.
- **Inclusive `dateTo`** — `dateTo=2026-09-01` → 8 rows, `2026-08-31` → 7, single-day
  `2026-09-01..2026-09-01` → exactly 1.
- **Bounds** — inverted range, >366 d, `limit=500`, `page=0`, bad `sellerId` and an undeclared param
  all return 400 with the French message.
- **Authorization** — 401 unauthenticated / 403 buyer / 403 seller / 200 admin, on **both** JSON and
  CSV routes.
- **CSV** — ignores `page`/`limit` and exports all 8 rows; BOM present; headers unchanged.
- **N+1 correctness** — the old per-seller logic was re-run as an independent oracle and produced
  **byte-identical** aggregates (Boutique Marie 6/2/1/11500000/1150000; Tech Shop 2/0/0/0/0).
- **Admin Web in Chrome** — table renders, footer reads "Page 1 sur 1 — 8 lignes" with both buttons
  disabled; with `PAGE_SIZE` temporarily set to 3 (reverted), paging walked 1→3 with correct
  disabled states and 3+3+2 = 8 rows; the error state renders with a working Réessayer. No console
  errors.

**Not verified:** nothing was run against production. Sentry was not checked.

### A pre-existing e2e flake, characterised (not introduced here)

The e2e suite intermittently fails an **unauthenticated-401** assertion. Two shapes were seen:
`Auth (e2e) › GET /api/v1/auth/me › returns 401 without a token` failing with
`Parse Error: Expected HTTP/, RTSP/ or ICE/`, and
`Checkout & Cart & Orders (e2e) › GET /api/v1/cart › should return 401 without authentication`
failing with `expected 401, got 501`.

It was attributed by running the suite on **both** branches rather than assumed:

| Branch | Failures |
|---|---|
| `fix/report-window-bounds-and-n1` | 3 / ~42 runs |
| **clean `develop`** | **2 / 38 runs** |

So it reproduces on `develop` with no changes at all, hits a *different* spec each time, and lands on
specs this PR does not touch. The error shape is transport-level — a genuine regression would read
"expected 401, got 200", not a socket parse error. `createTestApp()` calls no `app.listen()`, so
supertest is on ephemeral ports; this looks like socket reuse in the harness.

**Worth its own fix**, and worth knowing before someone re-runs the suite and blames their own branch.
A single green run is not proof here — repeat it.

## Known, deliberately out of scope

- `HttpExceptionFilter` hardcodes `field: 'unknown'` on every validation error
  (`http-exception.filter.ts:36`), so the French messages arrive without a field name. **Pre-existing**,
  affects every DTO in the API, and not PR 2's to fix.
- `AdminStatsService` still buckets in UTC (see above).
- `getSalesReport` remains an order **ledger** on `createdAt`. Delivered-revenue semantics
  (`DELIVERED`, keyed on `deliveredAt`) arrive with the sales-analytics endpoints in PR 3, alongside
  an explicit `status` filter.

## Remaining PRs

3. Sales analytics breakdown (`?by=product|category|seller|town|day`) + composite
   `@@index([status, deliveredAt])`.
4. `source` + `searchIntent`, the `SearchQuerySource` enum migration, retention cron, both clients.
5. Search analytics endpoints + `reports.e2e-spec.ts` + the « Recherches » admin page.
