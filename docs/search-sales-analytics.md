# Search & Sales Analytics — Workstreams B, C, D

**Started:** 2026-09-03
**Surfaces:** `apps/api`, `apps/admin-web`, `apps/buyer-web`, `apps/buyer-mobile`, `apps/seller-mobile`
**Status: RELEASED TO PRODUCTION 2026-09-03.** Release PR **#632** (`develop → main`, merge commit
**`9e89478`**, 18 commits / 44 files), deploy run **`33756698400`** success, back-merged by
fast-forward so `main == develop == 9e89478`.

All three workstreams are complete and live — **B** (search analytics, #629 write path + #630 admin
read surface), **C** (sales analytics, #627 on the corrected foundations of #626) and **D** (CSV
hardening, #625) — together with the `DELIVERED ⇒ deliveredAt` prerequisite (#628).

Merged into `develop` in this order: #625 `33a816b` → #626 `3ac6c7c` → #627 `9075d56` →
#629 `3a1c0be` → #630 `db7628d` → #628 `9efe42a` (+ #631 `b86dfe3`, CONTRIBUTING). Real merge
commits, never squashed.

Integrated gates before release: API **507 unit / 135 e2e** (0 failures in 8 consecutive e2e runs) ·
buyer-web 74 · buyer-mobile 238 · seller-mobile 42 (untouched) · admin-web build clean · type-check
clean across 5 projects.

**The migration auto-applied exactly once**, in the deploy's expand phase before the rolling swap;
`_manual_migrations` 31 → 32, recorded once, no duplicates. It was **not** run by hand.
Production verification (schema, health, telemetry end-to-end, admin analytics, authorization, SEO) is
recorded in `STATUS.md` → "Most recently completed initiative" and is not repeated here.

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

**Third shape seen during PR 3 (2026-09-03):** the entire `Health Check (e2e)` suite failed at once —
5 tests, including `should return degraded status when database is down`, which *mocks* the database
rather than touching it. A whole suite going down together, mocked cases included, points at a one-off
app-bootstrap or resource failure rather than a logic regression. Rate on the PR 3 branch:
**1 failure in 22 runs (~4.5%)**, at or below the ~5% measured on clean `develop`. It did **not** recur
across the following 20 runs, so its error body could not be captured — recorded here as an unknown
rather than explained away. If it reappears, capture the full jest output before doing anything else.

## Known, deliberately out of scope

- `HttpExceptionFilter` hardcodes `field: 'unknown'` on every validation error
  (`http-exception.filter.ts:36`), so the French messages arrive without a field name. **Pre-existing**,
  affects every DTO in the API, and not PR 2's to fix.
- `AdminStatsService` still buckets in UTC (see above).
- `getSalesReport` remains an order **ledger** on `createdAt`. Delivered-revenue semantics
  (`DELIVERED`, keyed on `deliveredAt`) arrive with the sales-analytics endpoints in PR 3, alongside
  an explicit `status` filter.

## PR 3 — sales analytics breakdown

### What counts as a sale — derived from the code, not the enum

`status = 'DELIVERED' AND "deletedAt" IS NULL`, on the **`deliveredAt`** axis.

`AdminOrdersService.markDelivered()` is the single moment a sale completes: it stamps `deliveredAt`,
flips a COD order's `paymentStatus` to COMPLETED (the agent collects cash at the door), increments
`Product.unitsSold`, and triggers `EarningsService.createEarning()`. **Nothing earlier does any of
that** — CONFIRMED, PROCESSING, READY_FOR_TEKA_PICKUP, RECEIVED_AT_TEKA and OUT_FOR_DELIVERY have been
paid for by nobody, so none of them is a sale.

- **CANCELLED** — excluded; never delivered, stock restored.
- **RETURNED** — needs **no** explicit exclusion. `ReturnsService.approveReturn()` moves the order
  *off* `DELIVERED`, restocks it and reverses the earning, so the status predicate already excludes it.
  A test pins this so nobody adds a redundant `NOT IN` later.
- Both are still **reported as separate counters**, so the headline cannot be misread as "nothing was
  cancelled".

### The finding that shaped the design: `deliveredAt` is not always set

Two code paths produce a DELIVERED order with **no** `deliveredAt`:

1. `AdminOrdersService.forceStatusChange()` writes only `{ status }` — the manual escape hatch stamps
   no timestamp, creates no earning, increments nothing.
2. **`prisma/seed.ts` never sets `deliveredAt` at all** — zero occurrences in the file.

This is not hypothetical: **both** DELIVERED orders in the dev database have `deliveredAt IS NULL`, so
a strictly windowed query returns *zero sales*. The `EXPLAIN` output shows it plainly —
`Rows Removed by Filter: 8`, `rows=0`.

So the window is applied **only when the caller supplies a date bound**, and
`getSummary()` returns **`deliveredWithoutDate`**. An unfiltered report covers everything; a windowed
one says, in the UI, « ⚠ 2 commandes livrées sans date de livraison — exclue(s) de ce filtre par
période. » The alternative — silently under-reporting — was rejected.

> **Follow-up worth doing separately:** `seed.ts` should stamp `deliveredAt` on its DELIVERED orders.
> The same gap also hides them from payout eligibility (`earnings.service.ts` filters
> `deliveredAt: { lte: cutoff }`), so local payout testing is unrepresentative today.

### What "revenue" means

`SUM(order_items."totalCDF")` — the price actually charged, discount already applied
(`CheckoutService` snapshots `discountPriceCDF ?? priceCDF` into `unitPriceCDF`). It equals
`Order.subtotalCDF` and therefore **excludes the delivery fee**, deliberately: a delivery fee belongs
to an order, not to a product or category, so including it would make those dimensions incomparable
with the others. The UI states this in plain French under the totals.

`discountCDF` reconstructs the buyer's saving from the `listUnitPriceCDF` snapshot the schema keeps
for exactly this purpose.

### Index decision — measured, then declined

`@@index([status, deliveredAt])` was planned. **It was not added**, because the plan does not justify
it:

```
orders: 8 rows, 288 kB   |   order_items: 12 rows, 96 kB

Aggregate  (cost=1.11..1.12 rows=1)
  ->  Seq Scan on orders o  (actual time=0.072..0.072 rows=0 loops=1)
        Filter: (("deletedAt" IS NULL) AND ("deliveredAt" >= ...) AND (status = 'DELIVERED'))
        Rows Removed by Filter: 8
Planning Time: 0.408 ms
Execution Time: 0.123 ms
```

Postgres correctly seq-scans a 9-row table; planning time exceeds execution time by ~3×. An index
would never be chosen, and would add write cost to every order transition. **Revisit when `orders`
reaches roughly the low tens of thousands**, or when `EXPLAIN` on production shows the filter
dominating. `EXPLAIN ANALYZE` was run for all four aggregation shapes; every one seq-scans and
completes in ~0.12 ms.

**No migration, no schema change, in this PR.**

### Query shape

All five dimensions aggregate over `order_items ⋈ orders` in **one** statement each, so every
dimension returns the identical row shape and the same revenue definition. Prisma `groupBy` cannot
express them: they need a join, `COUNT(DISTINCT o.id)`, a CASE-guarded discount sum, and — for town —
a `COALESCE` plus an accent-folded grouping key distinct from its display label. Raw SQL is
parameterised through `Prisma.sql` tagged templates, the same approach
`AdminStatsService.getDashboardTrends()` already uses.

- **product** — labelled from the `productTitle` **snapshot**, so a renamed or soft-deleted product
  still labels its own historical sales.
- **category** — grouped at leaf level in SQL (bounded by taxonomy size, ~350) then rolled to the root
  with the same `rootIdOf` walk `AdminStatsService.getCatalogCoverage()` already uses.
- **town** — from the order's delivery **snapshot** with the relation only as the pre-backfill
  fallback, exactly as `resolveDeliveryAddress()` does it. Grouped
  `f_unaccent(LOWER(COALESCE(...)))` so "Likasi" and "LIKASI" are one town, with a readable label kept
  separately.
- **day** — `date_trunc(... AT TIME ZONE 'Africa/Lubumbashi')`.
- Pagination: SQL `LIMIT/OFFSET` for product/seller/town; in-memory for category and day, whose group
  counts are inherently bounded (taxonomy size / the DTO's 366-day cap). CSV never paginates.

### Validation — an independent oracle over rich fixtures

Aggregations were checked against a **JS oracle that does no SQL aggregation at all**: it pulls raw
rows and recomputes every dimension in TypeScript, then diffs.

Because dev data is thin (no discounts, one seller, one town, and `day` empty), the real run used
**purpose-built fixtures created inside an interactive transaction that is always rolled back** —
the dev database was verified unchanged afterwards (8 orders / 12 items, 0 fixture rows).

Fixtures covered: a CAT day boundary (22:30Z → next day CAT, 21:30Z → same day), a discounted
multi-item order, a **multi-seller checkout** (two orders sharing one `checkoutGroupId`), an
accent/case town variant, and four rows that must be excluded — CANCELLED, RETURNED,
OUT_FOR_DELIVERY and a soft-deleted DELIVERED order.

| Scenario | product | category | seller | town | day |
|---|---|---|---|---|---|
| all delivered, no window | MATCH | MATCH | MATCH | MATCH | MATCH |
| June 2026 | MATCH | MATCH | MATCH | MATCH | MATCH |
| **1 July only (CAT boundary)** | MATCH | MATCH | MATCH | MATCH | MATCH |
| **30 June only (CAT boundary)** | MATCH | MATCH | MATCH | MATCH | MATCH |
| single seller | MATCH | MATCH | MATCH | MATCH | MATCH |
| empty window | MATCH | MATCH | MATCH | MATCH | MATCH |

Decisive spot checks: day buckets `2026-06-30:1` and `2026-07-01:2` — the 22:30Z delivery lands on
**1 July** CAT, which is the UTC-vs-CAT bug proven fixed; towns folded to
`Lubumbashi(8) LIKASI(6) Kolwezi(3)`; `discountCDF = 600` = (1000−800)×3; and total units **17, not
276** — the excluded rows carried 99 + 50 + 77 + 33 units precisely so that a leak would be obvious.

### Verified over HTTP (local API, dev DB)

- **No route collision.** All five paths map distinctly; the `sales` ledger still returns its own
  columns and all 8 orders. Nest log confirms `sales`, `sales/csv`, `sales/summary`,
  `sales/breakdown`, `sales/breakdown/csv`.
- **Authorization** — 401 / 403 buyer / 403 seller / 200 admin on summary, breakdown **and** the CSV.
- **Validation** — unknown dimension, inverted range, `limit=999` and an undeclared param all 400 with
  French messages.
- **CSV** — French headers, accents intact, FC conversion (9 000 000 centimes → `90000`), and
  `page`/`limit` ignored.
- **Admin UI in Chrome** — summary cards, the « hors ventes » line, the table (Mode 90.000 FC +
  Maison & Cuisine 25.000 FC = the 115.000 FC headline), and the gap warning flipping from
  « incluse(s) ici » to « exclue(s) de ce filtre par période » once a range is set. No console errors.

## PR 4 — search `source` + `searchIntent` (the write path)

### Why `X-Teka-Surface` was not used

Two independent reasons, both verified in code: `main.ts` sets an explicit CORS `allowedHeaders`
allowlist (a new header needs a CORS change plus preflight), and `surface.util.ts` has
`DEFAULT_SURFACE = 'buyer'` — so buyer-mobile, which sends no such header, would have been labelled
`BUYER_WEB` with total confidence. A query parameter needs neither.

### `source` semantics

`BUYER_WEB` | `BUYER_MOBILE` | `UNKNOWN`. **`UNKNOWN` is not "probably web"** — it means exactly "a
client that predates this parameter". Missing *and* unrecognised values both map to it.

The parameter is a bounded **string** in the DTO, mapped to the enum in the service, not `@IsEnum`.
A strict enum would turn a client typo into a **400 on the search endpoint** — telemetry breaking a
buyer's search, which is precisely what the design forbids. Validation still happens server-side; it
just resolves to `UNKNOWN` instead of failing the request.

### `searchIntent` semantics

Accepted: `SUBMIT`, `SUGGESTION`, `REFINE`. **Only the first two are stored.**

| Value | Meaning | Stored? |
|---|---|---|
| `SUBMIT` | the buyer explicitly ran a search (Enter, search key, `/recherche?q=`, deep link) | yes |
| `SUGGESTION` | the buyer picked a recent / popular / brand chip | yes |
| `REFINE` | a filter, sort, page or pull-to-refresh re-fetch of a search already run | **no** |
| *missing* | a currently-deployed client | yes, as `SUBMIT` |
| anything else | unrecognised — we refuse to classify it | **no** |

Missing defaults to `SUBMIT` so clients already on devices keep contributing demand for the months
before a store release; their rows stay identifiable because their `source` is `UNKNOWN`.

`SUGGESTION` is stored rather than derived because "autocomplete selection rate" is one of the metrics
the admin reporting is meant to answer.

### Normalisation and de-duplication

New `normalizeSearchTerm()` = `stripAccents()` **plus** collapsing every whitespace run to one space.
`stripAccents` only *trims*, so `"robe  wax"` and `"robe wax"` were two aggregation keys for one piece
of demand. It is a **separate** function on purpose: `stripAccents` also feeds `expandSynonyms` and the
PDP specification de-dupe, and changing it would change search **matching**.

Sub-2-character terms are now dropped at **write** time (they were written and only filtered on read).

**There is no de-duplication and no identity column.** Two buyers searching the same term are two
demand signals — one row per event. That is also why no session or user id was added: the only
identity-shaped requirement is satisfied without one, so collecting it would be extra PII for no
reporting question. The stored row is exactly
`{term, termNormalized, resultCount, cityId, source, intent, createdAt}` — a test asserts nothing else
creeps in.

### Failure isolation

Unchanged and now explicitly tested: the write is not awaited, every rejection is swallowed, and the
whole call sits in a `try/catch`, so a missing delegate or a dead database cannot fail a search.

### Clients

**buyer-web** has **two** querystring builders and they disagree — this is the trap:

- the inline builder in the `[query]` effect is the *actual submitted search* and the only path that
  fires `search_performed` → `SUBMIT`;
- `buildQuery()` backs Appliquer / Effacer / sort / load-more → `REFINE`.

Tagging only one would have either missed every first-load search or counted every filter click as new
demand. A test pins the split.

**buyer-mobile**: `searchIntent` was added to `BrowseProductsParams` but **deliberately excluded from
`==`/`hashCode`**. That class is a Riverpod `family` key and the notifier fetches in its constructor,
so a tag that varied per interaction would mint a new notifier and an extra network request per
interaction, and leak the old ones. Consequence, accepted and documented: for a given `(search,
cityId)` the first fetch's tag wins — which is correct, since no second request means no second row.
`loadMore` and `refresh` send `REFINE`.

### What was NOT changed, on purpose

- **The search engine.** `buildSearchMatch`, `expandSynonyms`, `getSynonymGroups` and `stripAccents`
  are untouched; the only removed lines in `browse.service.ts` are the old `logSearch` body, its call
  site and one import.
- **buyer-web's nationwide first page.** `cityId` is still absent from the submitted-search builder.
  Adding it would change the RESULTS buyers see — a product decision, not an analytics one. The cost
  is that a web `SUBMIT` row carries no town. **Known gap, deliberately left.**
- **buyer-mobile's 1-character search.** Mobile fetches on one character where web needs two. Changing
  it would change UX; the sub-2-char write filter handles the analytics side.

### Verification actually performed

**API, against the dev database** — 13 representative requests, then the rows inspected directly:
accented vs unaccented (`"Téléphone"` and `"TELEPHONE"` → one key `telephone`, both 32 results),
messy whitespace (`"  robe   wax  "` → `robe wax`), zero-result, typo, town scoping, legacy client
(→ `UNKNOWN/SUBMIT`), unknown source (→ `UNKNOWN`), unknown intent (→ no row), 1-char (→ no row),
`REFINE` (→ no row), and an undeclared param (→ **400**, the `forbidNonWhitelisted` guard).
**Every search returned 200, including those with bad analytics values.**

**Matching unchanged, measured:** `telephone` 32 · `telephon` 28 · `caserole` 1 · `casserole` 1 ·
`robe` 4 · `samsung` 2. Typo tolerance is partial (`telefone`, `samsng`, `robbe` → 0) — that is the
**pre-existing** trigram threshold, not a regression: no matching code was touched.
Autocomplete still returns products/categories/brands.

**buyer-web in Chrome, PRODUCTION build** (`next build` + `next start`, served on an allowed CORS
origin): a real search persisted exactly **one** row — `chemise coton` → `BUYER_WEB/SUBMIT n=2`,
`farine manioc` → `BUYER_WEB/SUBMIT n=0`. In the dev server the same flow writes **two** rows ~1.7 s
apart; that is a **Next.js dev-mode artifact** (the production build was the control), and it is
recorded here so nobody mistakes it for a defect later.

**Not performed:** the buyer-mobile emulator. The mobile changes are covered by `flutter test` (238
pass) and `flutter analyze`, and the mobile parameter shape was exercised through the API by hand —
but the app itself was **not** run.

### Found while verifying, NOT fixed here

`search-autocomplete.tsx`'s `onKeyDown` calls `goToSearch()` **without** the event in the
`!open || items.length === 0` branch, so its `e?.preventDefault()` no-ops and the browser also fires
the form's native submit — `router.push` runs twice for one Enter. A one-line fix was written,
**measured to change nothing**, and reverted: it is a search-UX change that does not belong in an
analytics PR. Worth its own PR.

## PR 5 — admin search analytics (the read surface)

Completes the initiative: Workstream B's reporting half, on top of the telemetry #629 writes.

### Where it lives

A **« Recherches » tab on the existing Rapports page**, not a separate dashboard — the admin
analytics navigation already exists and a disconnected page would compete with it. The panel itself is
`components/reports/search-analytics-panel.tsx`, so the page file does not balloon.

### Routes (`@Roles('ADMIN')`, all read-only)

| Route | Answers |
|---|---|
| `GET /v1/admin/reports/search` | what buyers search for (paginated term table) |
| `GET /v1/admin/reports/search/summary` | headline metrics |
| `GET /v1/admin/reports/search/trending` | what is rising |
| `GET /v1/admin/reports/search/breakdown?by=source\|intent\|town\|day` | how it splits |
| `GET /v1/admin/reports/search/csv` | raw events for the active filters |

### Metric definitions — the denominator is stated once and applies to all

**Every row in `search_queries` is already a meaningful search**: the write path stores only `SUBMIT`
and `SUGGESTION`, and drops REFINE re-fetches, unrecognised intents and sub-2-character terms *before*
insert. So `totalSearches` = rows matching the filters, and it is the denominator for every rate on
the page. There is no hidden second population. The UI says this in French above the table.

| Metric | Definition |
|---|---|
| `totalSearches` | rows matching the filters |
| `uniqueTerms` | `COUNT(DISTINCT termNormalized)` |
| `zeroResultSearches` / `Rate` | `resultCount = 0`, over `totalSearches` |
| `lowResultSearches` / `Rate` | `resultCount BETWEEN 1 AND 3`, over `totalSearches` |
| `suggestionSearches` / `Rate` | `intent = SUGGESTION`, over `totalSearches` — "how often suggestions are selected" |
| `unknownSourceSearches` | `source = UNKNOWN`, reported so an admin can judge how much of the source split is actually known |

`LOW_RESULT_MAX = 3` is a judgement call, so it is exported, returned in the payload, and **stated in
the UI label** ("entre 1 et 3 produits") rather than hidden behind the word "low".

**`UNKNOWN` is rendered as « Non identifiée » and is never folded into « Site web ».**

### Trending

The selected window is split into two equal halves and the recent half is compared with the one before
it. Ranked by **absolute delta, not percentage**: at Teka's volumes a percentage from a small baseline
is noise and from a zero baseline is undefined, so a term absent from the earlier half is flagged
**« nouveau »** instead of being given infinite growth. Both halves are counted in ONE pass with
`FILTER`, so it stays a single bounded query.

Honest limitation, stated in the UI: at current volumes this answers *"what is being searched now that
was not before"*, not a statistically significant trend.

### Zero-result / unmet demand — and the distinction that matters

The same table serves it, via the « Sans résultat uniquement » filter, with a **Diagnostic** column
driven by `maxResultCount`:

- **« Jamais de résultat »** — the term has never returned a product *anywhere*. A catalog gap **or** a
  search-quality problem (typo, missing synonym).
- **« Selon la ville »** — it returns products somewhere, so a zero here is a town-coverage gap, not
  missing stock.

The panel says so in French above the table. **Not every zero-result term is demand Teka should
stock** — the dev data shows exactly why: `riz local` and `telefone` both read "jamais de résultat",
but one is a plausible product gap and the other is a misspelling of a term that returns 32 products.

### Filters, pagination, plans

Date range (**reusing `resolveWindow`** from PR 2 — CAT, half-open, 366-day cap), town, source,
intent, zero-result-only, page/limit (max 200). Invalid values 400 with French messages, including
`intent=REFINE` — which is never persisted, so filtering by it could only ever return nothing.

**No index added.** All three query shapes were EXPLAINed against the real table: seq scan,
**0.05–0.19 ms** execution with planning time at or above it. Revisit around the low hundreds of
thousands of rows. Town labels are hydrated with ONE `city.findMany({ id: { in } })` after grouping —
no dimension can degrade into an N+1; the term listing is exactly two queries (page + count).

### CSV

Raw events, honouring the active filters, through the **shared writer from #625** — no second escaping
implementation. French accented headers behind a BOM, numeric `Résultats` left bare, and a buyer-typed
`=cmd|'/c calc'!A1` neutralised to `"'=cmd|'/c calc'!A1"` — verified end to end by driving that term
through the *buyer* search API and exporting it. Empty export = header only. Existing finance/report
CSV formats untouched.

### SearchSynonym — investigated, deliberately not built

`SearchSynonym` has exactly **one** consumer (`browse.service.ts:107`, a 60 s cached read) and **no
admin CRUD anywhere** — no API route, no page. It is editable only by direct SQL, despite the schema
comment calling it "admin-editable".

Building CRUD here would have doubled the PR and added a write surface to a table that feeds live
search matching. **Deferred as the next focused follow-up.** The analytics page already delivers the
evidence that decides it: the zero-result table with the « jamais de résultat » diagnostic is exactly
the list of candidate synonyms (`telefone` → `telephone` is visible in the dev data today).

### Verification actually performed

**API against the dev table (21→23 real events):** summary arithmetic, term listing, zero-result
listing, all four breakdown dimensions, trending, every filter composing (source/intent/town/
zero-only/date — 18 + 3 = 21 across the CAT date split), seven invalid-filter cases each 400 with a
French message, and **401 / 403 buyer / 403 seller / 200 admin on all five routes including the CSV**.

**Admin Web in Chrome** — the « Recherches » tab: summary cards, the denominator sentence, the
`UNKNOWN` caveat, the term table with its Diagnostic column, pagination footer, trending with
« nouveau » badges, the three breakdown tables (« Site web » 16 / « Non identifiée » 5 /
« Application mobile » 2), the day chart, the **empty state** ("Aucune recherche pour ces filtres",
CSV button correctly hidden), the **error state** with a working « Réessayer », the zero-result filter
switching the table heading, and a **real CSV download** (200, header + 9 events, accents intact).
French accents render correctly throughout.

**Not verified:** a genuinely narrow viewport. The browser reported a 1728 px viewport and the resize
did not take effect on the rendered page, so responsive behaviour is **claimed only** to the extent
that the page does not overflow horizontally at that width and the wide table sits in an
`overflow-x-auto` wrapper.

### A fourth shape of the documented e2e flake

`Payments (e2e)` failed once in 8 runs on this branch — a spec PR 5 does not touch. Same family as the
Auth-401 and Health shapes already recorded.

## Carried forward, deliberately not fixed in this initiative

- **`forceStatusChange()` has the same gap for `returnedAt` that #628 fixed for `deliveredAt`** — same
  function, same root cause. Left out to keep #628 narrow.
- **The dev database is missing `2026-07-28_review_title.sql`**, which *is* in `auto-apply.list`. A full
  dev seed aborts at Phase 6 with `reviews.title does not exist`. Pre-existing dev drift.
- **buyer-web fires two `router.push` calls for one Enter** (see PR 4 above). Measured to change
  nothing, reverted, worth its own PR.
- **The Next.js dev server writes a search row twice**; the production build writes one. A dev
  artifact — do not "fix" it from a dev observation.
- **`SearchSynonym` has no admin CRUD** (see PR 5). The recommended next PR.
- **The e2e suite's pre-existing 401 flake** — three observed shapes (`Auth`, `Health Check`,
  `Payments`) at roughly 5 % of runs on clean `develop`. Not introduced here; re-run before blaming a
  branch.
- **Unrelated Dependabot PRs** (#549, #565, #595) remain open and were untouched.

**None of these was fixed as part of the release, deliberately.** `SearchSynonym` admin CRUD is the
recommended next piece of work.

## Remaining PRs

**All five planned PRs are open.** The natural next piece of work is admin CRUD for `SearchSynonym`,
fed by the zero-result evidence this initiative now surfaces.
