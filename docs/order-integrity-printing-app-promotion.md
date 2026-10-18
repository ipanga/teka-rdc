# Order integrity, printable order documents, and mobile app promotion

Initiative started 2026-10-17. Codex supervises and independently reviews;
**official Claude Code, pinned to Opus 5.5, implements substantial changes**.
This tracker extends the existing continuity system: `STATUS.md` is the entry
point, `PROGRESS.md` the chronological record, and `CLAUDE.md` the durable rules.
Do not create a parallel progress system. On 2026-10-18 the owner authorized a
temporary local review branch, selective staging and six structured local commits;
the subsequent authorization also allowed that existing branch to be pushed and one
PR into develop. Both are complete. The owner then authorized PR836's merge commit
into develop only; it is merged and post-merge CI/CodeQL succeeded. See the current
handoff at the end. The owner subsequently authorized a separate four-file
documentation branch/commit/push/PR into develop and a Draft develop→main PR.
Neither PR merge, deployment/data change, stock correction nor mobile distribution
is authorized. The owner did request read-only historical
reconciliation; reviewed aggregate reads may use a verified READ ONLY transaction
without exposing customer rows or credentials.

## Recovery and evidence

Read `STATUS.md`, this tracker, `CLAUDE.md`, `docs/order-workflow.md`,
`docs/delivery-fees-and-currency.md`, `CONTRIBUTING.md`, then inspect Git status
and the actual diff. Starting branch: `develop`, HEAD `9e6bd60`; tree initially
clean. Previous Seller Catalogue Speed-up release is closed; retain its pending
manual device checks. Do not interpret old plans as unfinished implementation.

Evidence comes from source and executed tests, not historical green counts.
Use synthetic data, never customer information in committed evidence. Never
print credentials or load production configuration into test services.

## Delegation and billing gate

- Installed official CLI: `/Users/Apple/.local/bin/claude`, version 2.1.302.
- Inherited `ANTHROPIC_API_KEY` is SET (value never inspected or logged).
  Default `claude auth status` selects `api_key`; inference in that configuration
  is forbidden by the owner.
- A sandboxed probe without API credentials reported no login. An unsandboxed
  official `env -u ANTHROPIC_API_KEY claude auth status` confirmed `claude.ai`
  authentication and `subscriptionType: max` through macOS Keychain. No login
  or persistent authentication setting was changed. The exact Max price tier
  is not exposed by that command.
- `--bare` disables the authentication behavior needed here: the tool-free
  model probe returned `Not logged in`, with empty model usage. Use normal
  subscription authentication or `--safe-mode`, not an OAuth bridge or token
  extraction. Recheck authentication before delegation and exclude the API key
  in every child invocation. Never enable additional paid usage or fallback.
- Opus 5.5 access: VERIFIED by a successful tool-free safe-mode CLI request;
  result model usage identifies `claude-opus-5-5`, `is_error: false`. Probe session
  `e1c33b32-21a9-4ff3-91da-b01f6f65580f`. Max price tier and extra-usage account
  settings are not exposed by auth status; no API credential or fallback is used.
- Official programmatic CLI usage is documented at
  <https://code.claude.com/docs/en/headless>; subscription/API billing selection
  at <https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan>;
  model/version support at <https://code.claude.com/docs/en/model-config>.
  Official legal/compliance guidance <https://code.claude.com/docs/en/legal-and-compliance>
  permits the owner signing into the unmodified CLI with their own subscription;
  no credential collection, extraction, third-party OAuth client or resale is used.
- Only one implementation process may write this checkout at a time. Codex
  reads/reviews independently and does not silently replace Claude as implementer.
  Capture session IDs and task reports, never credentials. If subscription-only
  execution fails, stop delegation and retain the task below as a direct handoff.

## Confirmed architecture and findings

### Inventory and cancellation (first priority)

- NestJS/Prisma 6 + externally hosted PostgreSQL. Checkout decrements
  `Product.quantity` in the order-creation transaction. Availability is read
  before an unconditional decrement, without an explicit isolation level or
  stock predicate. Concurrent purchases can pass the same availability check.
- Cart checkout produces one order per seller, joined by `checkoutGroupId`.
  `OrderItem` holds quantity and price snapshots. No independent stock-bearing
  variant model was found in the schema: variants are distinct products.
- Buyer cancellation (`OrdersService.cancelOrder`), seller rejection
  (`SellerOrdersService.rejectOrder`), and `AdminOrdersService.adminCancelOrder`
  already increment stock. Their eligibility reads precede the transaction;
  unconditional order updates do not claim the transition against competing
  cancellation or fulfillment writes. Sequential retry tests do not prove
  concurrent correctness.
- **Confirmed bypass:** `AdminOrdersService.forceStatusChange` accepts CANCELLED,
  writes status/log (and reverses an earning when leaving DELIVERED), but does
  not restore stock or fail unpaid COD. The admin detail force-status modal
  offers CANCELLED. This explains a supported path to the reported symptom;
  the owner's particular order has not been inspected.
- Admin dedicated cancellation rejects only CANCELLED and DELIVERED; RETURNED
  and paid states need protection. Forced rewinds can make a released order
  appear cancellable again. Fixing one endpoint is insufficient.
- Seller/admin fulfillment helpers also use pre-read status + unconditional
  updates. They must participate in the concurrency strategy or can overwrite
  a successful cancellation. Approved returns restore stock too; preserve
  return/earning/payment behavior and protect against duplicate release.
- Buyer API allows PENDING, CONFIRMED, PROCESSING; buyer-web detail currently
  exposes cancellation only for PENDING. Review Flutter model/action eligibility
  and refresh of order, product, cart, and seller availability across all clients.
- COD transaction creation currently occurs after the checkout transaction;
  investigate cancellation-versus-payment-record creation without adding a
  provider subsystem. Preserve existing payment events and transaction semantics.
- No expiry/partial-cancellation job was identified in the initial source scan;
  confirm before marking unsupported scenarios N/A.
- Historical aggregate measured 2026-10-17 22:10 Lubumbashi: configured production
  DB has 2 CANCELLED orders, with 9 units classified `U_restoration_unproven`.
  All rollout boundaries were NULL/unverified; this is NOT proof of missing
  restoration. Other statuses: CONFIRMED 1, DELIVERED 7, READY_FOR_TEKA_PICKUP 1.
  The transaction was verified READ ONLY; only aggregates were returned and no
  stock/schema/customer data was modified. Independent SQL review and 7 synthetic
  era fixtures passed before this operational read.
  Current quantity cannot prove how much
  was previously restored because catalog edits/other sales also change stock.
  Produce read-only candidate counts from status logs, distinguish suspicion
  from proof, and require separate authorization for any historical correction.

### Printable document

- Admin order detail exists at `apps/admin-web/src/app/dashboard/orders/[id]/page.tsx`.
  API detail is `GET /v1/admin/orders/:id` under controller `@Roles('ADMIN')`;
  preserve the global JWT/roles enforcement and private/no-store responses.
- No invoice/print implementation was found in admin source. Prefer a protected
  HTML preview and A4 print CSS using existing order detail data and browser
  printing/Save as PDF. No public document URLs or financial records required.
- Read item/title/charged-price/list-price snapshots and resolved delivery
  address snapshots (`resolveDeliveryAddress`); never substitute live catalog
  values. Money is BigInt **minor units**, CDF centimes, serialized as strings.
  Reuse `@teka/shared` `formatFC`: `125.000 FC` from `12500000` centimes.
- No verified legal fiscal requirements were provided. Proposed operational
  label: **Bon de livraison**, explicitly an order/delivery document, not an
  assertion of tax-invoice compliance. Do not invent identifiers/taxes, allocate
  invoice sequences, or change payment status. Reuse verified configured
  platform details only. Clearly show COD due/collected and cancelled eligibility.
- One seller per order; do not invent combined multi-seller invoice accounting.
  Test long names, discounts, zero fees, large orders, totals and pagination.

### Mobile application promotion

- Only an existing Google Play footer link was found; no Smart App Banner.
- Buyer auth store provides resolved user/role/loading; gate on signed-in BUYER.
  Evaluate native Safari behavior against this restriction: unconditional root
  metadata would also promote to guests, so cannot satisfy it by itself.
- Prefer a lightweight phone-only client component in existing layout, with
  iOS/Android destinations, close control, persisted dismissal, accessible French
  text and no overlap with sticky navigation, auth, cart or checkout.
- Provided Apple ID `6787126945` matches repository release documentation;
  Android `com.tootiye.teka` matches native application identity. Public listing
  fetches through the web tool failed, but independent direct HTTPS checks
  returned 200 for both links. Listing HTML identifies Apple **Teka / TOOTIYE
  ENTERPRISES LTD** and Google Play **Teka / Tootiye Solutions**, with a DRC
  local-seller shopping description. Identity/link resolution verified; actual
  installation, country availability and open-app behavior remain device checks.
- Preserve buyer SSR/SEO, structured data, canonical URLs and rendering.
  Seller/admin already have robots metadata/routes and noindex response headers;
  their regression tests must remain green.

## Implementation stages and acceptance

| ID | Task / owner | Components | Dependencies | Status | Evidence / next work |
|---|---|---|---|---|---|
| D0 | Discovery and baseline / Codex | all | none | VERIFIED | Source findings + unit/web/type/e2e/mobile baseline |
| I1 | Transactional stock lifecycle / Claude Code | API | D0 billing gate | VERIFIED | Guarded transitions + stock edits independently pass 15 actual-service checks and 17 opt-in PG tests; no migration |
| I2 | Client cancellation parity / Claude Code | five clients | I1 | LOCALLY_ACCEPTED | Real buyer cancellation/GET-failure and seller stock-conflict browser workflows pass; buyer native renders + both widget suites; seller native launch limitation below |
| I3 | Read-only historical reconciliation / Claude Code, Codex review | API tooling/docs | I1 | VERIFIED | 7 independent synthetic era cases + 4 PG suite cases; configured production aggregate READ ONLY: 2 cancelled orders / 9 units restoration-unproven; no corrections |
| P1 | Protected A4 order document / Claude Code | admin, API if needed | I1 | LOCALLY_ACCEPTED | ADMIN API/browser snapshot/access/read-only checks; A4 short/80-line PDF visual review; Chromium + WebKit preview |
| M1 | Signed-in buyer mobile app promotion / Claude Code | buyer web | I1; store verification | LOCALLY_ACCEPTED | 278 buyer-web tests; real-auth Chromium/WebKit targeting/dismissal/blocked-home navigation; physical store handoff pending |
| Q1 | Cross-platform regression and release readiness / Codex | all | I1–M1 | LOCAL_QA_COMPLETE | Automated/visual evidence and release report below; CI/physical-device gates remain; no deploy authorized |

No task is DONE until Claude executed, Codex reviewed the actual diff, relevant
tests passed, and applicable visual checks are recorded. No schema changes or migrations were needed. Future migrations require lifecycle
proof, additive/backward-compatible SQL and the existing deployment manifest,
isolated PostgreSQL validation, rollback and legacy treatment. Never run `db:push` (known dev database drift).

## I1 — precise Claude Code task

Read this tracker and the referenced source, existing tests, schema, deployment
manifest and order/payment/return docs. Investigate all stock deduction/release
paths before editing. Implement the smallest coherent stock-integrity fix:

1. Atomic checkout availability enforcement; concurrent orders cannot oversell.
2. Buyer, seller rejection, dedicated admin and forced CANCELLED converge on a
   transactionally guarded release. Retries/races release each held item once;
   competing fulfillment writes cannot resurrect cancelled orders.
3. Preserve documented actor eligibility, prevent cancellation of paid,
   delivered/returned/already released orders, and define safe forced repair
   behavior without bypassing inventory/payment/earning invariants. Do not
   automatically restock legacy rows without evidence of deduction.
4. Keep stock, status, status log and COD transaction/payment failure atomic.
   Audit existing mechanism, preserve French errors and installed-mobile API
   compatibility; notify/track only successful transitions.
5. Test successful/repeated/concurrent cross-actor cancellation; before-deduction
   failure; multi-item and product variant ownership; rollback; authorization;
   invalid/paid/delivered/returned transitions; repurchase; cancellation-vs-
   fulfillment and ordering races. Real isolated PostgreSQL tests must prove
   database behavior; existing mocked Prisma e2e tests alone are insufficient.
6. Update narrowly affected clients/tests only where required. Produce a report:
   root cause, files, design/legacy tradeoffs, exact tests/results and gaps.

Constraints: no secrets/env changes, no external database writes, no production
queries without a separately reviewed read-only procedure, no commits/pushes/
deployments, no unrelated refactors/dependencies. Run no rewriting root lint.
Codex owns this tracker while Claude runs; return a task report separately.

## Pending delegation specifications

These focused task prompts preserve the next implementation steps across restart.
Codex owns this tracker while the single Claude writer implements.

### Quantity/client/report correction (I1/I2/I3)

Continue I1/I2 under Codex supervision; preserve the existing diff. No commits/deploy/secrets/external DBs, no agents; do not edit STATUS.md/PROGRESS.md/initiative tracker. Read CLAUDE.md and tracker as needed.

Codex independent evidence so far: 26 lifecycle unit tests pass. Real PostgreSQL 16 on a disposable local container passed an independent 11-check actual-service harness, including repeated and four-actor cancellation races (8 rounds), cancellation-confirm and cancellation-deliver races (8 rounds each), multi-product forced cancellation, rollback, paid/returned/delivered rejection, ownership, oversell and repurchase. Your opt-in PG suite also passed all 9 tests independently. Audit stale-pre-read concern is resolved by your lock-and-reload design.

Outstanding correction: ProductsService.updateProduct still reads product.quantity before a long plan/transaction and then writes dto.quantity unconditionally. Cancellation can restore stock between those operations; the absolute seller edit overwrites the increment. Implement minimal optimistic protection for quantity updates inside the existing transaction (conditional expected snapshot in WHERE; reject conflict with clear French 409 and roll back any spec edits). Preserve old installed client request compatibility. If necessary add OPTIONAL expectedQuantity to seller update DTO and modern seller web/mobile form payloads, while legacy requests still get at least server-read-to-write optimistic protection. Distinguish truly intentional absolute stock resets from stale forms; document limitations without pretending full protection for old clients sending no expected snapshot. Add focused tests including actual PostgreSQL competing quantity-edit/cancel behavior; don't create a stock subsystem or rewrite catalog/taxonomy logic. Reuse integer quantity validation. No database migration should be necessary.

I2 client parity: buyer-web detail currently has canCancel only PENDING although API accepts PENDING/CONFIRMED/PROCESSING. Check both buyer surfaces and seller/admin actions against paid/returned/cancelled eligibility. Show professional French errors instead of generic Erreur, refresh relevant order lists/detail and product/cart availability from API after successful cancel/reject; don't duplicate inventory calculations. Keep admin force-status UI from offering prohibited terminal revivals/invalid returns as actions that inevitably fail, while API remains authoritative. Keep scope narrow; add meaningful existing-framework tests for changed eligibility/state behavior. Do not refactor unrelated navigation.

I3: produce the read-only historical candidate reconciliation SQL/report procedure if not already done. No production queries or stock corrections. Explicitly report that candidate counts have NOT been measured from production and current quantity is not proof of missing restoration.

Run focused tests/type checks as feasible; return completion report including changed files, actual test results, residual limitations. Existing Docker engine is now recovered; Codex owns external DB/browser validation. No need to access Docker or local QA DB yourself unless given a separate explicit localhost URL. Implement this correction before moving to printing/banner tasks.

Historical SQL review correction: git show 4058842 (2026-06-29T21:38:47+03:00) proves buyer restocking was ADDED in that commit, while checkout deduction existed since 6f3992d (2026-02-28). The initial report counts every pre-fix buyer/seller/admin release-like log as a restoration. That can classify older never-restored cancellations as "ok". Do not infer deployment times from commit timestamps. Add conservative era/uncertainty classification requiring verified restoration rollout time, or explicitly include unproven-era cancellations as unknown candidates, so older missing restores are not silently excluded. Names/notes alone also aren't proof, so label likely-normal estimates appropriately. Unit/synthetic SQL fixtures should cover pre-restoration-era cancellation, regular known-era cancel, forced cancel, repeated release/rewind, and post-fix first release. Run the SQL only against synthetic localhost data, or leave execution to Codex. No production queries.

### Printable document (P1)

You are the primary implementation engineer; Codex independently supervises/reviews. Read CLAUDE.md, docs/order-integrity-printing-app-promotion.md and docs/order-workflow.md. Implement P1 professional printable order/delivery document, minimally, on existing admin order detail. Your prior inventory diff belongs to this initiative: preserve it; do not rewrite unrelated modules. Do not edit tracker STATUS.md/PROGRESS.md; Codex owns those. No agents, secrets/.env files, external DB/service calls, commits/push/deploy.

Approved approach: French Bon de livraison, operational document without assertion of fiscal invoice legality. No verified legal registration/tax identifiers: invent none. No DB records/numbers/migrations needed. Authenticated ADMIN HTML preview uses current admin API (which must retain backend role/ownership authorization) and private no-store/noindex. Prefer separate protected preview route with dedicated print CSS so admin sidebar/buttons/header never print; existing order detail gets an accessible print/preview action. Browser print gives native preview/Save as PDF; no PDF dependency. Use existing Teka logo, design tokens, formatFC exact BigInt/string centimes. All item title/prices/line totals and delivery address from snapshots; show charged unit price, quantities, totals, fee, order reference/date/generation date, buyer/recipient/town/phone/seller, buyer delivery instructions, COD payment method/status/amount to collect vs collected. No invented tax. If line original-price snapshots needed, add safe selection fields to existing ADMIN-only API; don't fetch live product prices. Multi-seller cart is multiple orders, one seller per order. Generation must be read-only and never change COD or consume number sequences. Cancelled/returned orders visibly ineligible for active delivery document; don't print misleading amounts. Non-COD historical orders clearly labeled using existing values without claiming COD cash due.

A4 with suitable margins, repeated table headers, avoid split line rows/totals, long address/text handling and long order pagination. Responsive preview at 320/390/768/1440. Test formatter/data logic, COD unpaid/paid/failed/cancelled/returned cases, large exact values, escaping, unauthorized access, snapshot correctness, and admin API auth. Existing admin Vitest is node-only; reuse React server render/pure helper where sufficient, avoid heavy new dependency. Codex will use a real browser and generated print output to verify; report visual limitations honestly. Return changed files, test commands/results, design choices. Implement, don't stop at plan.

Independent Codex finding: admin detail currently types/renders order.address, but the authoritative API resolveDeliveryAddress returns deliveryAddress. Use the actual API field in the print document and minimally correct the existing admin delivery card while touching it. The snapshot includes province/town/neighborhood/avenue/reference/recipientName/recipientPhone, not invented details fields. Also honor NEXT_PUBLIC_BASE_PATH (local admin uses /admin) when linking static logo assets; verify the image resolves. No country/registration/company address invented from seller profile. Existing configured site contact is teka.cd/contact, and verified existing platform logo is public/logo.svg.

### Mobile promotion (M1)

You are the implementation engineer; Codex independently reviews. Read CLAUDE.md and docs/order-integrity-printing-app-promotion.md. Implement M1 signed-in buyer phone app promotion on buyer-web, preserving prior initiative diffs. Do not edit STATUS/PROGRESS/tracker. No agents/commits/push/deploy/secrets/environment edits/external DB calls.

Links verified directly HTTP 200 by Codex: Apple https://apps.apple.com/sa/app/teka/id6787126945 (Teka, TOOTIYE ENTERPRISES LTD); Android https://play.google.com/store/apps/details?id=com.tootiye.teka (Teka, Tootiye Solutions). Native identity matches repository. Actual installation/open-app is still a device check. Evaluate native Safari Smart App Banner but do not add unconditional root metadata that shows it to guests or overlaps a custom prompt. Recommend small reusable client component gated on auth resolved BUYER, compatible PHONE browsers, no iPad/Android tablet/desktop. Hide on login/auth, cart/checkout/payment and order confirmation paths that may be interrupted. Use current responsive tokens/assets, French copy e.g. Ouvrir dans l’application / Télécharger l’application (don't promise installed detection), small in-flow banner without sticky overlays or layout jumps, accessible close button/tap targets, sensible persisted dismissal e.g. 30 days; localStorage unavailable must fail gracefully and not trap navigation. Prevent repeated prompts across navigation; no PII analytics. Native deep link handling remains existing app/universal links; no unverified custom schemes. Reuse existing app-icon.svg, avoid new bitmap/dependencies. Preserve SSR crawlable buyer content/metadata/JSON-LD, existing public SEO and noindex behavior of other portals.

Add meaningful Vitest component/device/auth/path/dismissal tests; UA spoofing is only heuristic, also use viewport and coarse pointer as appropriate; don't falsely assume iOS Chrome desktop Safari. Test iPhone Safari/iOS Chrome, Android Chrome, iPad, desktop, guest, seller role, 320px and larger phones, route suppression, persistence/blocked storage and accessibility close/link labels. Mobile browser actual styling/responsive checks will be performed independently by Codex. Return files, tests, limitations and implementation report.

## QA report (baseline; not feature acceptance)

2026-10-17, local checkout, before feature edits:

| Check | Result | Evidence |
|---|---|---|
| API unit: `pnpm --filter api test -- --runInBand` | PASS: 80 suites, 1,280 tests | `/private/tmp/teka-api-unit-baseline.log` (temporary) |
| Buyer web: `pnpm --filter buyer-web test` | PASS: 28 files, 193 tests | `/private/tmp/teka-buyer-web-baseline.log` |
| Admin web: `pnpm --filter admin-web test` | PASS: 9 files, 68 tests | `/private/tmp/teka-admin-web-baseline.log` |
| Seller web: `pnpm --filter seller-web test` | PASS: 10 files, 48 tests | `/private/tmp/teka-seller-web-baseline.log` |
| `pnpm type-check` | PASS across shared/API/three web apps | `/private/tmp/teka-typecheck-baseline.log` |
| API e2e: `NODE_ENV=test DATABASE_URL=postgresql://ci:ci@localhost:5432/teka_ci pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand` | PASS: 23 suites, 274 tests (mocked Prisma) | `/private/tmp/teka-api-e2e-baseline.log`; run outside sandbox for localhost binding; initial extra-`--` invocation matched no tests, sandboxed corrected run failed EPERM before assertions |
| Docker availability | PASS: daemon 29.8.2 via approved unsandboxed read | Services not started; do not launch API against cloud DB for concurrency tests |
| Buyer Flutter `flutter test --no-pub` | PASS: 524 tests | Missing generated package config restored by `flutter pub get --offline`; no lockfile changes |
| Seller Flutter `flutter test --no-pub` | PASS: 505 tests | `/private/tmp/teka-seller-flutter-baseline.log` |
| Both `flutter analyze --no-fatal-infos lib test` | PASS: buyer 7 infos, seller 6 infos; no warnings/errors | `/private/tmp/teka-{buyer,seller}-analyze-baseline.log` |
| Baseline independent service reproduction | CONFIRMED: forced cancellation retains quantity 8 rather than 10 and COD PENDING; simulated concurrent buyer cancels yield 12 instead of 10 | `/private/tmp/teka-inventory-baseline-repro.cjs`; simulation is not PostgreSQL proof |
| Focused inventory lifecycle unit suite | PASS: 26 tests, independently rerun | `/private/tmp/teka-inventory-independent-unit.log`; in-memory logic only |
| Independent actual-service PostgreSQL harness | PASS: 15 checks, including original 11 checks plus seller quantity-read/write conflict, stale expected snapshot, unchanged stock on price-only edit, and 8 real edit/cancel races | `/private/tmp/teka-independent-stock-qa.cjs`; latest `/private/tmp/teka-independent-stock-qa-with-edits.log`; PostgreSQL 16 disposable localhost, synthetic data only |
| Claude opt-in PostgreSQL regression suite after corrections | PASS: 17 tests, independently executed | `/private/tmp/teka-inventory-pg-corrections.log`; includes stock edits and four report-era tests |
| Independent historical report cases | PASS: 7 cases; transaction ends ROLLBACK | `/private/tmp/teka-report-era-fixture.cjs`, `teka-report-era-check.log`; synthetic only |
| Configured production historical aggregate | READ ONLY verified; 2 orders / 9 units restoration-unproven | `/private/tmp/teka-production-stock-aggregate-report.json`; no customer rows, no corrections |
| API unit regression after quantity/client correction | PASS: 82 suites, 1,335 tests | `/private/tmp/teka-inventory-final-unit.log` |
| API type-check after initial I1 patch | PASS | `/private/tmp/teka-inventory-type-review.log` |
| API endpoint regression after initial I1 patch | PASS: 24 suites, 285 tests | `/private/tmp/teka-inventory-e2e-review.log`; mocked Prisma, localhost server |
| Native buyer rendering | VERIFIED on iPhone 15 Pro / iOS 17.0: confirmed/preparing unpaid show cancel; paid/cancelled hide it | Four actual screenshots under `docs/qa/order-integrity/`; isolated QA bundle ID, synthetic repository, auto-state fixture; native input surface unavailable, widget tests cover interaction |
| Independent final API regression | PASS: 82 suites / 1,335 unit tests; 25 suites / 290 endpoint tests | `/private/tmp/teka-api-final-{unit,e2e}.log` |
| Independent final admin/seller web | PASS: admin 105; seller 53 | `/private/tmp/teka-{admin,seller}-final-tests.log` |
| P1 Chromium responsive/access checks | PASS at 320/390/768/1440; logo resolves; no body overflow; paid/terminal states correct; anonymous redirect; private/noindex; print invokes once with no mutations | `/private/tmp/teka-print-browser-qa.log`; synthetic fixtures, actual production build |
| P1 A4 PDF review | PASS: short 1 page, 80-line 5 pages; every page visually inspected; all items once, repeated headers, margins and totals/signatures intact, no toolbar | `docs/qa/order-integrity/bon-livraison-{court,long}-qa.pdf`; generated with Chromium |
| Real local HTTP/API/PostgreSQL + admin browser | PASS: 2-seller checkout/replay, deduction, discount/address snapshots after live edits, guest 401/buyer 403/admin success, order→preview→print with no writes/payment mutation, confirmed buyer cancellation/retry, seller status, only its product restored, document then blocked | `/private/tmp/teka-real-api-browser-qa.log`; `delivery-real-api-preview.png`; no API mocks in this run |
| Full Flutter regression | Buyer PASS 527; seller default parallel run 507 pass/2 photo-reuse failures, isolated photo file PASS 7, bounded-concurrency full run PASS 509 | `/private/tmp/teka-{buyer,seller}-flutter-final.log`, `teka-seller-photo-targeted.log`, `teka-seller-flutter-serial-review.log`; existing async file-I/O timing under load, no photo source/test changes |
| Final Flutter analysis | Buyer 7 infos / seller 6 infos, no warnings/errors; unchanged baseline; lockfiles/native projects unchanged | `/private/tmp/teka-{buyer,seller}-analyze-final.log` |
| Buyer web + workspace types after M1 | PASS 265 tests / all shared/API/three web type checks | `/private/tmp/teka-buyer-web-final-tests.log`, `teka-final-typecheck.log` |
| API source non-mutating lint | Not clean: final 114 errors (87 formatting, 27 typed lint); baseline comparison confirms zero new semantic findings, new helper clean | `/private/tmp/teka-api-lint-baseline-comparison.log`; root autofix lint not run to avoid unrelated writes |

Temporary raw logs are not durable acceptance evidence. Retain concise results
here; put redacted/synthetic visual artifacts in `docs/qa/` when generated.

## Independent review notes (initial findings, resolved unless stated)

- Initial broad-CAS audit concern addressed in the evolving patch by locking
  and reloading the row with SELECT FOR UPDATE before validation/logging.
  Verify every fulfillment/forced/return path follows this convention.
- Historical SQL needs era-aware uncertainty: `4058842` added buyer stock
  restoration on 2026-06-29, while checkout already deducted since February.
  Release-like audit notes before the verified restoration rollout cannot be
  treated as proof stock returned or excluded as normal. Corrected era-aware SQL and synthetic cases pass; production aggregate recorded above.
- Review seller absolute quantity updates: a write racing a stock release must
  reject a changed snapshot or preserve the concurrent increment. Stale forms
  are a separate limitation if the API has no expected-quantity/version input.
- Verify conditional checkout decrements have deterministic lock ordering
  across all seller groups, and that order-number serialization does not
  reintroduce overselling. Exercise real database behavior, not just mocks.
- Verify actor ownership/paid guards survive compare-and-set predicates.
- No migration selected yet; conservative historical release-log treatment
  must be explicit and must not claim backfilled stock is reconciled.

## Decisions

- Reuse STATUS/PROGRESS + one initiative tracker; avoid six duplicate state files.
- Preserve `develop`, existing architecture, minor-unit money, COD and snapshots.
- Investigate force-status escape hatch as a supported defect; do not claim
  proof that it caused a particular historical order's discrepancy.
- Existing transaction wrappers and mocks do not establish concurrency safety.
- Do not replace mandatory Claude delegation with Codex feature implementation.

## Environment incident

Docker web builds with the existing root context transferred 2.65 GB, including
local nested Next caches. Docker then reported no space left on device and the
QA PostgreSQL became unreachable. Build cancelled; no PostgreSQL test assertions
ran in that attempt. Owner freed disk and explicitly authorized Docker restart.
Graceful CLI/app shutdown stalled; verified Docker backend alone was stopped
and Desktop reopened. Docker recovered (29.8.2); disposable PostgreSQL
container/schema recreated, independent 11-check harness then PASSED. No
unrelated files/images/volumes deleted. For subsequent
builds use existing Dockerfiles with a temporary sanitized 12 MB source context
excluding all nested generated caches and env files; no source config change.
A fallback official Homebrew server bottle (19 MB) was fetched but not installed
globally or started. Record actual successful database checks separately.

## Additional browser findings and corrections

- Real signed-in buyer UI passed confirmed-order cancellation with a real POST
  and a deliberately failed follow-up GET (503): French success, merged
  CANCELLED timeline, removed cancel control, COD FAILED and stock 8→10.
  Evidence: `buyer-{confirmed,cancel-dialog,cancelled}-web.png`,
  `/private/tmp/teka-buyer-real-cancel-qa.log`. Initial harness guessed a success
  label incorrectly; rerun used actual label and a fresh synthetic checkout.
- Chromium M1 browser matrix passes real BUYER auth, iPhone 320/390, Android
  360/430, iOS Chrome UA, iPad/desktop/guest exclusions, 44px controls, keyboard
  dismissal/reload persistence, store tap destination capture, checkout routes,
  31-day expiry. WebKit full matrix passes with controlled external navigation for Apple links;
  native Apple-domain handoff is not observable from the harness. Phone emulation is not a physical store-installation check.
- WebKit local HTTP production builds upgrade localhost assets to HTTPS under
  the existing `upgrade-insecure-requests` policy, causing TLS failure. Tests
  adapt only local HTML response transport by removing that one directive;
  repository/production security configuration is unchanged. P1 WebKit widths
  320/390/768/1440 and print-media toolbar exclusion pass. Actual Safari print
  pagination remains a device check; Chromium PDFs are directly verified.
- Blocked-storage integration found an EXISTING unguarded city-store read makes
  the homepage error boundary replace the page. `/contact` still renders the
  M1 banner and handles blocked-storage dismissal/navigation. Narrow correction
  implemented by Claude, plus iPod exclusion, precise Smart Banner/identity-snapshot
  documentation and formatting of newly changed lines. Independent final browser
  checks now pass blocked-storage homepage dismissal and client navigation in both engines. No general storage or
  inventory refactor authorized.

## Follow-up native and isolated web QA — 2026-10-17

Owner launched both simulators and explicitly requested continued real native
client/server and isolated web QA, plus locked seller CocoaPods synchronization.
Do not reset/shut down the owner-booted devices or touch normal browser sessions.

- iOS: iPhone18Pro, iOS27.0, `40754F6B-BC08-4713-80F8-6A18121A47E1` (Booted).
- Android: sdk_gphone64_arm64, Android14/API34, `emulator-5554` (device); Google
  Play package present. Existing buyer prod + buyer/seller .dev apps present;
  do not clear app data or overwrite production. Use isolated auth/prefs in
  opt-in integration targets against actual QA API, not fake order repositories.
- Dedicated browser environment name: **Teka RDC — QA Testing**. Separate
  Playwright processes/contexts and fresh storage, no personal browser state.
  Existing native simulator browsers may be used only for QA tabs.
- Max gate reverified with API key excluded. Locked CocoaPods investigation
  delegated to official Opus 5.5 session `d95bcc69-020f-4f7b-a861-0c139acea5a0`,
  exec45600, result `/private/tmp/teka-claude-pods-followup-result.json`.
  CocoaPods report received: `pod install --deployment` succeeded, Manifest.lock
  now byte-identical to committed Podfile.lock; all tracked native files unchanged.
  Independent cmp confirmed. Native integration tests now being implemented by
  Opus 5.5 in same session, exec10765, report
  `/private/tmp/teka-claude-native-integration-result.json`; never concurrent writers.
  Only SDK integration_test dev dependency/new test files allowed; existing locked
  package versions must stay unchanged. Starting tree is the prior uncommitted feature diff.
- Recreated only private QA network/PG/API and reused existing three web images,
  ports55437/5050/5007/5107/5207; schema generated from existing Prisma, synthetic
  PG only. Mock WhatsApp with normal dev OTP path; external credentials absent.
  Fresh synthetic buyer mock-OTP and seller/admin email authentication verified;
  fixture/config files saved privately in `/private/tmp/teka-native-*-defines.json`.
  No credentials/tokens logged. Native tests must not read regular app auth.
- Disk at detection:3.5GB free, subsequently13GB available without agent cleanup;
  reuse images/caches, no broad cleanup. Both owner-booted devices remain running.
- Native UI: Device Hub screen capture works; CUA coordinate actions repeatedly
  fail noWindowsAvailable. Owner subsequently explicitly authorized simulator-only
  adb/simctl navigation, input, screenshots and testing, with no reset/uninstall,
  personal browser interaction or production writes. Standard Flutter integration
  tests and those simulator commands may now be used.
- CI correction from fresh source review: lint is explicitly NON-BLOCKING
  (`pr-validation.yml` continue-on-error:true); standard CI gate is typecheck.
  Existing lint debt is maintenance debt, not independently a release blocker.
  Keep the previous measured findings as evidence, not a new regression claim.

### Follow-up execution update — 2026-10-18, native runs still pending

- Opus 5.5 delivered the opt-in native harness; report
  `/private/tmp/teka-claude-native-integration-result.json`, is_error:false,
  modelUsage only claude-opus-5-5. Codex reviewed real screens/router/repos/API,
  in-memory secure storage/preferences and unbound external observers. Independently
  analyzed both apps plus integration_test/test_driver: buyer 7 / seller 6 existing
  infos only, no warnings/errors. Each pubspec.lock adds only five SDK-transitive
  entries; every existing package block is byte-identical to HEAD.
- Fresh isolated web reruns PASS: actual admin order→delivery note→print action
  and zero writes; buyer cancellation with follow-up GET503; seller stale stock
  409 preserving price; full Chromium/WebKit promotion matrix. Contact initially
  returned cached404 after fresh seed, then normal ISR revalidation returned200
  and the complete rerun passed. An actual database-backed 80-line order was
  seeded separately and opened through admin order→document: 10.005.000 FC COD,
  repeated print table header and zero stock/order/item/transaction/audit writes.
  That long fixture was seeded directly, not claimed as an 80-item UI checkout.
- Android buyer normal development QA APK built (164.9s), but explicit install-r
  safely refused UPDATE_INCOMPATIBLE (existing .dev signing certificate differs).
  No uninstall/clear/overwrite occurred. Original buyer .dev APK privately backed
  up. Opus delivered an opt-in Gradle init script + guarded Dart builder under
  scripts/mobile-qa; independent analyzer and isolated buyer build PASS (39s).
  APK manifest independently verified com.tootiye.teka.codexqa.dev, Teka QA.
  Install/test attachment is in progress. Shipping Gradle/manifests/IDs unchanged.
- Flutter drive defaults uninstall on teardown and Android installer may uninstall
  after failed update. README corrected: keep-app-running required; Android uses
  manual no-fallback install then use-existing-app driver attachment.
- Seller iOS CocoaPods sandbox is synchronized, but Xcode27 build has new target
  integrity failures: generated dependency targets declare iOS9/13, supported
  range15..27; app minimum already15. Generic build also reported architecture
  validation failure although independent lipo confirms arm64+x86_64 slices.
  Specific-device drive did not launch. Opus local QA override correction is
  active, report /private/tmp/teka-claude-native-ios-correction-result.json.
  SwiftPM generated only a new TOCropViewController 3.2.0 pin (existing cropper's
  declared compatible dependency); no existing pin/version changed. Both seller
  Package.resolved copies retain the documented addition pending final review.
- iOS seller .dev app was proven absent (simctl ENOENT), so no existing iOS seller
  app was overwritten. Initial automatic approval rejection of drive was resolved
  by that read-only evidence and explicit keep-app-running; subsequent approved
  attempt failed in compilation. Do not weaken the no-uninstall restriction.
- Native browser screenshots: local HTTP production CSP upgrades blocked Safari
  assets; temporary loopback proxy5307/5407 strips only HTTPS-upgrade, rewrites
  local API transport and uses synthetic normal-login cookies. Repository headers
  remain unchanged. Product page renders in Safari and Android Chrome (synthetic
  local product image unsupported by Next image host config; not production media).
  Native promotion/printing and native app lifecycle are NOT yet accepted.
- Resource constraint: swap peaked14.9GB of16GB; simulator Chrome briefly ANR then
  recovered. Stopped only the two idle QA-created Java daemon PIDs. Disk8.3GB at
  latest check, no cache/data pruning. Both owner devices remain booted.

### Native functional milestone — 2026-10-18

The scoped Xcode override (`scripts/mobile-qa/ios-simulator-qa.xcconfig`) raises
only simulator dependency targets to the app's existing iOS15 minimum. Seller
build94.4s + launch + driver connection PASS; CocoaPods lock unchanged. The first
run's heading/button ambiguity was corrected by Opus, including buyer cancel
dialog title/confirm ambiguity and fail-fast session preconditions.

Corrected seller iOS run: **3/5 scenarios PASS**, two harness refresh failures.
Verified actual native email/password login; native reject with reason, immediate
cancelled state, one cancellation audit, stock restoration and retry400; native
stale stock form8→server10→save409, quantity refetch10, edited price151000 kept,
server price/quantity unchanged. Buyer-cancel stale-confirm warning within the
third scenario also passed (screenshot05). Admin-cancel list row and injected
list-error waits failed because both returned to cached data without refreshing.
Opus is correcting these tests to perform the screen's real pull-to-refresh.
Independent screenshot inspection completed for seller home, rejection and409.
Snapshot409 was early in the snackbar animation; the test asserted the message
but the screenshot itself does not independently prove that message's visibility.

First Android buyer run: setup/API PASS and actual native home/catalog/loading
rendered; expected cold-start town picker timed out under heavy frame delays.
No UI login/checkout accepted. Opus added real auth/town startup synchronization
and safe status-only diagnostics; initial redirect is now checked after both
resolve, so asynchronous cold-start refresh timing is outside this harness.
Buyer iOS now building/running the reviewed harness with separate synthetic buyer.

Both Android QA packages built and installed alongside owner apps. Their native
Firebase provider was observed initializing from cached normal-build resources,
despite disabled GoogleServices generation. Codex stopped only the new QA packages;
Opus is redirecting that build-only output to an empty QA directory before further
Android runs. No credential/config file is deleted or edited, and native Firebase
network inactivity is not claimed for the earlier attempt. Application API writes
have remained restricted to the disposable local PostgreSQL. Driver logs containing
local Dart VM service URLs are private temporary files, not committed evidence.

### Accepted native journeys — 2026-10-18 (final application results)

- Buyer iOS: all3 named scenarios PASS, 19s execution, final log
  `/private/tmp/teka-native-buyer-ios-hit-drive.log`; 11 app-surface screenshots.
- Seller iOS: all6 named scenarios PASS,26s execution, final log
  `/private/tmp/teka-native-seller-ios-empty-drive.log`;11 scenario screenshots plus
  independent full-simulator capture. Login/reject/retry, buyer+admin cancellation
  with real pull-to-refresh, stock409 preserving price, read-error footer/retry.
- Buyer Android: all3 named scenarios PASS, 93s execution, normal renderer, log
  `/private/tmp/teka-native-buyer-android-normal-drive.log`; 11 screenshots.
  Software-renderer trial passed checkout but failed only SDK PixelCopy capture
  (result2 = ERROR_TIMEOUT) before cancellation. Normal-renderer rerun captured
  every state and passed; do not use the software trial as functional acceptance.
- Both platform buyer UI refreshes/retry are correct in ONE continuous mounted
  app lifetime. Old cross-test stale UI was harness teardown, not a confirmed
  shipping regression. Tap readiness now waits for transient overlays naturally;
  it never forces callbacks or suppresses missed-tap warnings.
- Android rebuilt artifacts contain none of eight Firebase configuration resource
  keys. Native runtime independently confirms no Firebase initialization and
  missing configuration. iOS firebase_core4.9.0 also auto-configures from its
  bundled plist before Dart: new guarded staging utility copies only the generated
  development simulator bundle into fresh private dirs, excluding that plist.
  Original source/generated bundles and credential files stay untouched. Staged
  copies install/run successfully without changing signing configuration.
- Independent visual review so far includes buyer price/En stock/checkout,
  cancellation timeline/snackbar, loading/error/retry/refused-cancel; seller admin
  cancellation, French409 with quantity10 and retained151000 price, error footer.
  Long native409 text truncates in the existing snackbar; the reason/new quantity
  remain visible and functional state is verified. Some SDK snapshots catch route
  animation edges; full-simulator capture distinguishes this from layout overflow.
- Seller Android: final6/6 named scenarios PASS,103s, normal renderer, log
  `/private/tmp/teka-native-seller-android-empty-drive.log`;11 screenshots. Final
  iOS and Android runs both include actual Retournées chip tap, delayed real GET
  loading skeleton then real API zero rows and French empty state. All four final
  journeys have sanitized pass transcripts in native-followup; each is ONE
  continuous mounted case, not N independent testWidgets.
- Android system/Chrome ANRs delayed the final install. Stopping only task-created
  QA processes restored responsiveness; no reboot/reset, uninstall or data deletion.
  Updated QA APK install-r and complete6-scenario run then passed. The earlier
  five-scenario Android result is retained as historical evidence.

## Original independent QA snapshot — 2026-10-17

Historical snapshot below; the2026-10-18 follow-up above and current handoff below
supersede its native-device and cleanup status. Regression counts remain valid.

Local implementation review: **ACCEPTED WITH DOCUMENTED LIMITATIONS** for I1/I2,
I3, P1 and M1. Production release: **NOT APPROVED OR EXECUTED**.

- Final independent API unit: 82 suites / 1,335 pass; endpoint: 25 / 290 pass.
  PostgreSQL: 17 regression tests + 15 independent service checks; report: 7
  synthetic era fixtures. Backend semantic behavior unchanged by final formatting.
- Final independent web: buyer 278 (34 files), admin 105 (12), seller 53 (11).
  Workspace shared/API/all three web type checks pass. All four existing
  Dockerfiles built successfully using a sanitized context and no secrets.
- Real API + PG + buyer/admin/seller browsers verified multi-seller checkout,
  idempotency, snapshot printing, unauthorized document access, zero print writes,
  cancellation/retry, seller-visible restoration, and stale seller form 409 with
  retained price edits and refreshed quantity. Buyer UI stays truthful when its
  successful cancellation is followed by GET 503. No client stock arithmetic.
- Final Chromium + WebKit promotion matrix passes iPhone Safari/iOS Chrome UA,
  Android UA, phone widths 320/360/390/430, guest/tablet/desktop exclusion,
  route suppression, 44px controls, keyboard dismissal/reload persistence,
  31-day expiry and fully blocked HOME storage with client navigation.
  WebKit on localhost uses the documented test-only HTTP transport adjustment.
- Actual Apple-domain handoff cannot be observed in Playwright WebKit: a plain
  Apple anchor also opens no observable page/request. Controlled external CTA
  and Google Play controls navigate, and Chromium captures the exact App Store
  destination. This is not proof of App Store installation/open-app behavior.
- Public homepage, contact and canonical product page: actual SSR headings,
  index/follow, canonical URLs and Organization/WebSite/WebPage/Product/
  Breadcrumb JSON-LD verified for guests and BUYER sessions. Local mobile CLS
  was 0 in all six observations, including 500ms delayed real auth, measured for
  1.2 seconds after load. These are local samples, not field Core Web Vitals.
  CMS fixtures initially produced build-time not-found cache/noindex; QA waited
  for normal ISR refresh and then verified valid published synthetic content.
- Final A4 PDF artifacts re-rendered; all 6 pages inspected. Short 1 page,
  long 80 items / 5 pages, repeating headers, no missing/duplicated items,
  no clipping, no split totals/signatures, no navigation or print controls.
- Flutter: buyer527 pass; seller509 pass with concurrency2. Default seller run
  had 2 existing file-I/O photo-reuse timing failures, both pass alone and in
  the bounded full run. Analyzers: unchanged buyer 7 / seller 6 infos, no warnings/
  errors. No lockfile or native build setting changes.
- Buyer actual iOS17 simulator rendering verified four controlled states.
  Seller native fixture build attempted but could not launch: existing
  `ios/Pods/Manifest.lock` missing / CocoaPods sandbox out of sync. No Podfile,
  lockfile, credentials or shipping project settings altered to bypass it.
  Seller native visuals and native API end-to-end remain unverified; widget
  order/form/conflict coverage passes. No connected Android device.

### Remaining release gates and operational limits

1. Run GitHub CI/PR checks when a commit/PR is authorized. Lint is documented
   maintenance debt, not an enforced gate (`continue-on-error:true`); type checks
   are enforced. Non-mutating scoped
   API ESLint is not green: 114 findings, including 27 pre-existing typed lint
   findings; comparison with HEAD found no new semantic findings. Root autofix
   lint was deliberately not run because it would rewrite unrelated files.
   Existing next-build warnings (including test-only unused mock args) remain.
2. Physical iPhone/Android: confirm store availability, actual install/open-app,
   and one real authenticated buyer/seller cancellation/status refresh. Confirm
   native Safari print pagination if it is an operational print browser.
   No signed mobile distribution or flavor release builds were made.
3. Legacy installed seller clients omit expectedQuantity: protection covers
   server-read-to-write races, not a stale form that predates the request. New
   clients send the snapshot; unchanged stock fields do not overwrite releases.
4. Buyer public catalogue SSR retains its existing 60-second revalidation cache;
   catalogue availability can lag a server stock change until refresh. Cart and
   checkout read/validate authoritative availability, and restored stock was
   repurchased in the real PostgreSQL checks. Flutter PDP refetches on open.
5. Historical 2 orders / 9 units are restoration-unproven, not a correction
   amount. Establish deployment-era evidence, inspect each order's complete
   stock/audit/physical-stock history, then prepare a separately approved,
   once-only audited adjustment. Never blindly add 9 or replay cancellation.

### Release and rollback plan (prepared, not executed)

- Keep existing develop → reviewed PR → main process. No schema/migration/env,
  NGINX, provider or secret changes required. Existing optional DTO/response
  fields preserve older clients. Web/API images use existing Dockerfiles;
  existing Flutter flavor identities and signing remain unchanged.
- Before a separately authorized release, pass relevant CI and device gates,
  capture the current immutable image SHAs and verify operational backups.
  Follow `docs/deployment.md`: GHCR image build/push, existing migration ledger
  step (no new migration), rolling API → buyer → seller → admin swaps and health
  checks. Do not replace the documented rollout with VPS git/build commands.
- Smoke a controlled order/print/cancel workflow after release, check stock,
  one status-log transition and COD consistency; review existing Sentry/PostHog
  without recording addresses/documents or adding promotion PII analytics.
- Preferred rollback is a reviewed forward revert/redeploy; emergency rollback
  uses the documented known-good immutable images. No database rollback is
  needed. Rolling back the API reintroduces the original inventory race/bypass;
  do not perform stock corrections or revive terminal orders as rollback steps.
  Mobile rollback follows existing distribution procedures; installed versions
  cannot be assumed replaced immediately.

## Previous restart handoff — 2026-10-17 (historical)

- Branch `develop`, starting HEAD `9e6bd60`; all initiative changes uncommitted.
  No commit, push, PR, merge, deployment or production write performed.
- Claude official session `d95bcc69-020f-4f7b-a861-0c139acea5a0`: I1, corrections,
  P1, M1 and final correction reports received; each `is_error:false`, model
  `claude-opus-5-5`. Every delegation freshly verified claude.ai Max with inherited
  ANTHROPIC_API_KEY excluded. No writer remains active; no relogin required.
- Read STATUS.md, this tracker, CLAUDE.md and actual Git diff before resuming.
  Local review complete; remaining release gates above are explicit.
- Evidence: `docs/qa/order-integrity/README.md` and its synthetic PDFs/screenshots.
  Temporary raw logs/scripts live under `/private/tmp/teka-*`; do not depend on
  their survival. Durable PostgreSQL/logic/browser component regressions ship
  with the source; real HTTP/browser harness observations are summarized here.
- QA teardown COMPLETE: task-owned admin/buyer/seller/API/PG containers stopped
  and private QA network removed. Unrelated `supabase_db_teka_edu` remains healthy.
  No shared image/volume pruning. Docker was restored as requested.
- Buyer QA bundle uninstalled; originally shutdown simulator returned to shutdown.
  Seller native build failed before app installation. Final cleanup restored the
  QA-generated buyer Flutter target to lib/main.dart and restored only the seller
  Package.resolved drift caused by xcodebuild to its initially clean HEAD bytes.
  Shipping apps/config/secrets preserved. Temporary sanitized build context `/private/tmp/teka-qa-context`
  avoids the earlier 2.65GB generated-cache context; use existing Dockerfiles.


## Current release readiness and restart handoff — 2026-10-18

**Local acceptance: PASS with the explicit limits below. Production release remains
unauthorized and unexecuted.** No new product regression was confirmed during this
follow-up. All four final native journeys passed: Buyer 3/3 and Seller 6/6 on both
owner-booted platforms. Named scenarios share one mounted app per journey.

- Codex independently reviewed the actual Opus 5.5 changes and real driver results,
  inspected critical native screenshots (including final seller loading/empty on
  both OS), and saved sanitized scenario transcripts beside the screenshots in
  [native-followup/README.md](qa/order-integrity/native-followup/README.md).
  Official Claude CLI 2.1.302 used claude.ai Max with inherited API key excluded;
  final report is_error:false, modelUsage only claude-opus-5-5. No active writer.
- Seller iOS sandbox: `pod install --deployment`; Podfile.lock unchanged and
  byte-identical to Manifest.lock. No shipping native project, Podfile, signing,
  credentials or production configurations changed by the follow-up. QA-only
  simulator override/staged bundle excludes Firebase plist; Android uses separate
  codexqa.dev packages with no packaged Firebase options. Early pre-isolation
  attempts are not represented as free of native Firebase activity.
- Lockfile audit: every existing buyer/seller pubspec package block unchanged;
  only integration_test, flutter_driver, fuchsia_remote_debug_protocol, sync_http
  and webdriver added. Both seller SwiftPM lockfiles add only the first compatible
  TOCropViewController 3.2.0 pin; no existing pin changed. Scoped analyzers pass with
  buyer 7 / seller 6 baseline infos only; QA Dart utilities clean. Full earlier API,
  PostgreSQL, web and Flutter regressions remain valid; no shipping code changed
  during this native follow-up, so they were not repeated unnecessarily.
- Fresh isolated real HTTP/browser flows and full Chromium/WebKit promotion matrix
  pass. Actual 80-line admin delivery document: snapshots,80 rows, COD 10.005.000 FC,
  repeated table header, zero stock/order/item/transaction/audit writes. Long order
  was seeded directly; checkout tested separately. Existing A4 PDFs (1 +5 pages)
  remain the inspected pagination evidence, not a new native Safari print claim.
- Actual native Safari promotion and real document responsive previews pass visual
  inspection. Both official store pages returned HTTP200 and matching app identity;
  href/UA targeting verified in isolated contexts. No account sign-in/install or
  existing production app opening was used. Native Android Chrome product render
  was observed earlier, but final promotion checks repeatedly hit **system ANR**
  and bounded uiautomator timeout, including after all native tests passed. Files
  `chrome-android-promotion-{fresh,recovered}-qa.png` are environment-failure
  evidence, not promotion passes. Do not reset the simulator to force acceptance.
- Final device readback: iPhone18Pro/iOS27 UUID 40754F6B-BC08-4713-80F8-6A18121A47E1
  Booted; emulator-5554 Android14/API34 device. Original Android production buyer,
  buyer.dev and seller.dev remain installed alongside the two new codexqa.dev
  packages. Both task-created iOS development QA app processes were stopped after
  accepted runs; no installed application/data was removed. No reset/shutdown.
- Branch develop, HEAD 9e6bd60 unchanged; existing uncommitted changes preserved.
  No commit, push, PR, merge, deploy or production mutation performed. No broad
  cache/image/volume cleanup. Unrelated Supabase container remains untouched.
  Task-owned isolated PG/API/web containers remain available on the documented
  loopback ports. Seller/admin Docker probes report unhealthy from the local QA
  base-path mismatch; actual login pages and tested workflows respond normally.
  Temporary proxy credentials expire and must be refreshed through
  normal synthetic login before further browser QA. Private logs/configs stay in
  /private/tmp and may not survive restart; durable sanitized evidence is in repo.

**Remaining gates / next safe action:** when explicitly authorized, create the
reviewed commit/PR and run the normal GitHub gates. API lint is non-blocking baseline
maintenance debt; do not run root autofix. The two existing seller photo-I/O flakes
passed individually and in the bounded full suite, not a new cancellation issue.
Before release, validate physical iPhone/Android store install/open-app and a real
authenticated lifecycle smoke, signed distribution and native Safari printing if
it is the operational print browser. Native harness does not cover the buyer's
late asynchronous cold-start redirect or landscape. Stock409 snackbar text
truncation is a non-blocking existing UI limitation. Retry Android Chrome promotion
only after normal simulator responsiveness returns; isolated Chromium Android-UA
coverage already passes. Historical 2 orders/9 units remain restoration-unproven:
no automatic stock adjustment or production replay is authorized.


## Final release preparation and Git review — 2026-10-18

Pre-remediation snapshot. Audit, CodeQL, dependency scope and final validation
status are superseded by the focused-security assessment at the end of this file.

**Recommendation: ready for authorized review commits/PR preparation; HOLD promotion
and deployment.** Accepted functional QA is preserved. A fresh production dependency
audit fails an enforced CI gate. No application correction, dependency upgrade,
version bump, workflow/settings change, signing action or remote mutation was made
in this preparation pass.

### Git scope and inclusion review

Baseline: current/remote `develop` **9e6bd60d488de644d4526fdcba08a641d233e964**.
Remote `main` and the last successful recorded deployment are
**60d70aceb199c75370044dd0e7980f22a4ab5ba5**. The five committed changes between
those SHAs are documentation only (STATUS, PROGRESS and seller catalogue tracker),
and must remain included; they are not an unexpected application release.

The full modified/new/deleted path inventory is
[git-change-inventory.txt](qa/order-integrity/native-followup/git-change-inventory.txt).
It includes untracked files: `git diff --stat` alone omits those. Final inventory:
**50 modified + 138 proposed additions = 188 files, zero deletions/renames**, none
staged. All 49 previously modified files and 136 previously untracked files are
preserved; this pass adds the narrow deployment-guide correction and two durable
review-evidence files. Scope reviewed:
API inventory/payment/return guards, optional stock snapshot, shared eligibility
and mutation merge, all affected web/Flutter screens, admin document, promotion
and blocked-storage fix, their regressions, opt-in PostgreSQL/native QA and tools,
read-only reconciliation report, and durable synthetic evidence/docs.

No unrelated source change or tracked deletion found. No Prisma schema/migration,
manifest-ledger, environment/configuration, Dockerfile/compose/NGINX, GitHub workflow,
Fastlane, flavor identity or signing change. API package.json adds only `test:pg`;
pnpm-lock and dependency versions are unchanged. Native lock additions are the
reviewed SDK test packages and first compatible seller SwiftPM cropper pin; no
existing package block/pin changed. The four mobile QA utilities are explicitly
opt-in, local-only and not wired into a release build. No APK/AAB/IPA, Pods, build
cache or generated application source is included. The 81 PNG/PDF evidence files
are intentional, about 17.5MB total, with no file above 0.5MB.

Secret review covered added diff lines and every new text file using focused
provider-token, JWT, PEM-key, credential-URL and local debug-auth URL patterns,
plus manual candidate review. All nine credential-URL hits are explicit fake test
or documentation literals (including remote example hosts that guards must reject).
No secret material found. Native screenshots were taken before credentials/OTP
entry and previously inspected; PDFs contain synthetic QA data. This is a focused
review, not a guarantee that a pattern scan detects every possible secret. Ignored
credentials, private logs and temporary fixture configs stay outside Git.
`git diff --check` passes; no focused/skipped regression tests were introduced.

### Proposed commits — no staging or commit performed

| Order | Proposed subject | Scope and staging boundary |
|---|---|---|
| 0 | `fix(security): patch production dependencies and pin proxy trust regressions` | Root package.json/pnpm-lock, API dependency hunks and three web Next versions; new 32-case proxy endpoint spec and durable security-remediation.json. Exclude the earlier API `test:pg` script hunk, which belongs to commit1. Keep tests with the dependency fix. |
| 1 | `fix(orders): serialize inventory holds and guarded order transitions` | API checkout/order/admin/payment/return/product guards, optional DTO, shared eligibility/mutation merge and buyer/seller/admin action/stock UI; keep the matching unit/endpoint/PG/Flutter/web regressions with the implementation. Include the read-only SQL report because its fixtures execute it. |
| 2 | `feat(admin): add protected printable delivery documents` | Admin document route/layout/view/model/CSS/assets helper, shared exact FC formatter, admin API list-price snapshot selection and dashboard document/address hunks; include document/middleware regressions and Vitest JSX setting. |
| 3 | `feat(buyer): promote native apps to eligible phone users` | Promotion decision/component/footer/store destinations, safe optional town storage access, targeting/dismissal/blocked-home regressions. |
| 4 | `test(mobile): add isolated native client-server QA journeys` | Integration targets/drivers/helpers, SDK dev dependencies/locks, two first-resolution seller SwiftPM pins, four opt-in build/staging tools. No release identity/signing changes. |
| 5 | `docs(qa): record acceptance evidence and release readiness` | STATUS/PROGRESS/current tracker, API/workflow/deep-link docs, narrow deployment-guide correction, all synthetic PDFs/PNGs/sanitized transcripts, Git inventory and preflight evidence. |

Shared files need **hunk-level** staging later: admin-orders.service.ts and admin
order-detail page mix inventory actions with document additions. Keep commits
buildable and their regression imports satisfied; do not split tests into an
artificial final catch-all. Do not use `git add .`. The authorized security remediation is commit0 above, with its own review and
validation evidence. Keep earlier feature hunks separate.

Both branches now require PRs. Once authorized, use a review branch based on this
exact develop baseline (proposed `codex/security-order-integrity-release-prep`), push only
that branch, PR it into develop, then prepare the develop→main release PR. No
branch was created and no index/ref was changed during this review.

### CI gates and preflight findings

Live effective rulesets **Protect main 15451167 / Protect develop 22732572** require
PRs, merge commits, no force-push/deletion, no bypass actors, and these contexts:

- `Lint & Type Check` (actually shared build/Prisma generation/workspace typecheck).
- `API Tests` (unit and mocked-database endpoint tests), `Web Tests`.
- `Web Build (buyer-web)`, `(seller-web)`, `(admin-web)`.
- `Flutter Tests (buyer-mobile)`, `(seller-mobile)`.
- `Flutter Analysis (buyer-mobile)`, `(seller-mobile)` (infos pass; warnings fail).
- `Dependency Audit`, `Release Config`, and `CodeQL` from integration 57789.

Main PRs additionally execute `PR validation / lint-typecheck-test` and four
`docker-build-check` matrix legs. These are release acceptance checks even though
their contexts are not in the ruleset list. Root autofix lint runs non-blocking
inside that disposable CI job; do not reproduce its unrelated rewrites locally.
The opt-in real PostgreSQL and native simulator journeys are **not** CI jobs;
retain their accepted evidence separately. CodeQL default setup is outside the
tracked workflow directory; recent `Analyze (javascript-typescript)` and
`Analyze (actions)` succeeded on the baseline. The initial commit-only listing omitted the literal `CodeQL` aggregate. The
subsequent PR824 rollup verifies that aggregate SUCCESS alongside both Analyze
jobs; see the focused-security evidence below. No administrator mapping change
is indicated. The future candidate PR must pass its own aggregate.

The last recorded develop CI run was green on the baseline
[36347262037](https://github.com/ipanga/teka-rdc/actions/runs/36347262037).
That is not CI for this uncommitted release, and does not establish today's audit.
Fresh, narrow readiness checks:

| Check | Result / implication |
|---|---|
| `ruby fastlane/testflight_groups_test.rb` | PASS 10 tests/36 assertions. Local Ruby prints existing unused native-extension warnings; no repair needed for this passing source guard. |
| `ruby fastlane/play_tracks_test.rb` | PASS 21 tests/76 assertions. |
| `sh prisma/migrations/check-manifest.sh` | PASS 16 entries; no new migration or manifest entry. |
| `pnpm audit --prod --audit-level=high --json` | **FAIL, exit 1**; metadata 11 high/1 critical, 13 moderate / 5 low. Unchanged lockfile, current advisory feed. Existing two exceptions unchanged; listed new findings are not excepted. |
| Diff/dependency/secret review | PASS with the explicit scan/physical/toolchain limits documented here. Prior successful functional/build suites were not rerun without source changes. |

Audit examples: **proxy-addr2.0.7** via Express/Nest is critical
[GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), patched
range>=2.0.8; direct **compression1.8.1** is high
[GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95), patched
range>=1.8.2. Official GitHub advisory records verified, neither withdrawn. Other
high findings cover brace-expansion, grpc-js, busboy, source-map-js, joi and sharp.
The sanitized [preflight record](qa/order-integrity/native-followup/release-preflight-result.json)
contains reported package/range/advisory details. Counts are audit metadata, not
a claim of that many distinct exploitable application paths. Runtime reachability
needs focused review; a baseline origin does not make the enforced gate optional.
Do not add blanket exceptions. Prepare minimal compatible patched dependency
changes through verified Max-authenticated Opus5.5, then independently validate
changed surfaces and audit before promoting.

### Android Chrome ANR diagnosis

Read-only diagnostics from emulator-5554 found **two retained system_server_anr
DropBox entries** and **one earlier buyer QA data_app_anr**. `dumpsys activity
lastanr` now says no ANR; retained DropBox history is stronger evidence and prevents
claiming none occurred. Chrome exit history records requested QA force-stops and
normal isolated-renderer lifecycle cleanup, not an independent crash diagnosis.

Device-recorded 2026-10-18 timestamps (+0200):

- 00:24:17 buyer QA FocusEvent timeout (~5.0s), guest totalCPU 88%, CPU pressure
  some avg10=73.07. Its actual app stack dump failed reading tombstoned; it cannot
  establish a Teka/Dart call-site defect.
- 00:24:48 system process ANR while the QA buyer ANR dialog itself failed to take
  focus, totalCPU 93%, CPU pressure 75.32%.
- 00:40:49 system process ANR while the SystemUI ANR dialog failed to take focus;
  critical-event history also names Chrome MotionEvent timeout. TotalCPU 82%, CPU
  pressure 82.71%; emulator graphics-composer service consumed 73%CPU. No retained
  system watchdog entry. Other system components were affected in the same period.

**Classification: emulator/system scheduling and graphics contention, with Chrome
and the early QA buyer affected.** Historical host swap pressure supports that
interpretation; today's 4GB swap use is not a measurement of the earlier event.
Exact upstream cause and any Teka contribution are unproven; there is no usable
Teka-specific stack or deterministic page-specific reproduction to justify a code
patch. No application change delegated/applied. Both final native Flutter journeys
subsequently passed with normal rendering. Native Chrome promotion remains
unaccepted; current physical Android smoke is still required. Preserve raw logs
privately (/private/tmp/teka-release-review); only sanitized findings enter Git.
Next safe diagnostic if needed: one QA workload at a time, record host/guest
pressure and capture the affected process trace at the event. Do not reset/erase,
kill unrelated processes or change production code to address this evidence.

### Flutter compatibility and distribution

New API remains compatible with released buyer/seller request shapes: routes,
auth, status/payment enums and response envelopes are unchanged; listUnitPriceCDF
is additive. Old seller quantity writes omit expectedQuantity and remain accepted,
with French409 on a server-read/write race. Existing French error extraction handles
business 4xx. **Limitation remains:** old forms cannot detect stock changes between
opening the form and making their request. Buyer older binaries may offer cancel
only for PENDING; the broader eligible UI needs a new buyer binary. New seller
snapshot/409 behavior and paid-reject controls need a new seller binary. Backend
integrity can roll out before those client updates.

| App | Android readiness | iOS readiness |
|---|---|---|
| Buyer 0.1.8+11 | QA debug journey passed; current versionCode 11 was already distributed. Unique higher code required before upload. | Unsigned simulator journey passed; no current signed archive. Existing workflow supplies epoch CFBundleVersion. |
| Seller 0.1.11+13 | QA debug journey passed; versionCode 13 already distributed. Unique higher code required before upload. | Locked Pods synchronized; simulator-only Xcode27 workaround passed. Device/archive compilation remains unverified; that override is not applied to iphoneos. |

Proposed marketing versions buyer 0.1.9 / seller 0.1.12 and Android codes 12/14 are
**proposals only**, subject to read-only store-console verification of every prior
upload and owner approval; do not assume the locally recorded maximum is current.
No version was bumped. Flutter stable/latest-stable Xcode are not fixed to the
local QA toolchain, so fresh CI/device release builds are required. Existing QA
APK IDs/build numbers, Firebase-free staged bundles and debug signatures are never
store artifacts. Normal release builds use lib/main.dart/production flavor/API,
existing Firebase files and existing signing through the established workflows.

`Release mobile AAB`: production signed artifact, `skip_upload=true` supports
artifact-only preparation; internal/alpha only, no production option.
`Release mobile IPA`: signed build then ios-testflight environment gate (no
artifact-only input). Do not dispatch it on an assumption that upload is disabled.
Both live android-play and ios-testflight environments have one required reviewer;
no dispatch or approval was performed. Read-only match/signing and existing secrets
remain untouched. Last recorded store runs are 36337681264/36337679322 at 60d70ac;
no current-release signed build or distribution is claimed.

**Rollback asymmetry:** the new seller web/mobile sends expectedQuantity. The old
API DTO does not accept it and `ValidationPipe(forbidNonWhitelisted:true)` rejects
unknown fields, so a new seller client against the old API gets 400 on edit. Deploy
API first. Before mobile distribution, roll web clients back first if reverting
API. After a new seller binary is distributed, keep an API that accepts the field
(or ship a forward compatibility repair); installed apps cannot be assumed rolled
back. Old mobile→new API is supported; new seller→old API is not promised.

### Staged release and rollback recommendation

1. **Review stage, no production:** authorize focused dependency remediation and
   its validation; approve the commit split/review branch. Only after separate
   commit/push/PR authorization, run develop-targeted CI and review the exact head.
2. **Release preflight:** prepare the develop→main PR, pass all listed gates on
   its exact head/merge candidate, resolve the CodeQL context if it remains
   Expected, and plan required physical buyer/seller checks on development/staging builds
   against a compatible isolated API; production-flavor internal smoke follows
   the API rollout before public mobile distribution.
   Native Safari print pagination is required only if Safari is an operational
   print browser; otherwise keep it explicitly unverified and use accepted
   Chromium A4 output. Record running production image digests, known-good GHCR
   SHA tags, fresh backup age and rollout/rollback operator before release.
3. **Authorized API+web window:** a merge commit to main automatically starts
   deploy.yml, independent of CI. The existing workflow builds/pushes all four
   images, runs the existing 16-entry migration ledger step (no new migration),
   then health-gated rolls **API → buyer-web → seller-web → admin-web**. It has no
   manual pause between services; separately timed API-only/web releases require
   separately reviewed workflow/rollout work, not an undocumented command here.
   Preserve current workflows. Validate API live/DB/ready health, private portal
   access, document snapshots/no-write behavior and controlled cancel/stock/COD
   consistency only within the separately authorized production smoke scope.
   Observe errors/Sentry/PostHog for 15min; access is not claimed in this preparation.
4. **Mobile distribution later:** after API/web stability, separately authorize
   unique version bumps, production signed builds and internal TestFlight/Play
   rollout. Before even starting new-seller internal distribution, validate the
   new API in a compatible test environment and have production API support in
   place, or keep tests on the isolated development flavor. Physical review and
   store submission/public promotion are separate approvals; current workflows
   distribute testing builds, not automatic public mobile releases.
5. **Rollback:** prefer a reviewed forward revert/repair and ordinary deploy. If
   urgent, use the documented immutable previous-image override procedure with
   release/environment labels preserved. Baseline rollback candidate is the last
   recorded successful deploy 60d70ac, but verify the actual running state and tag
   availability first. No schema rollback is needed; preserve order audit logs and
   transactions. A full old-API rollback reintroduces the stock race and rejects
   new seller fields, so prefer retaining a compatible API and rolling back the
   affected website first. Mobile already installed cannot be recalled by Git.

### Release blockers, limits and required approvals

**Blockers:** current production dependency audit failure; CI on the future
committed/reviewed release candidate not run; exact CodeQL required context must
resolve; new mobile upload needs unique versions, successful signed build and
physical validation. Required operational backup/rollback-image preflight remains
for the release window. No stock reconciliation is part of any of those gates.

**Non-blocking baseline/QA limitations:** root lint debt (explicit continue-on-error),
existing two photo-I/O timing flakes (passed isolated/bounded full suite; unbounded
CI can still flake), native 409 snackbar truncation, Chrome emulator ANRs without
Teka-specific defect proof, local seller/admin base-path healthcheck mismatch,
phone-UA heuristic/cached catalogue, late buyer cold-start/landscape gaps. Physical
store installation/open-app handoff and native Safari pagination remain unverified;
do not reinterpret simulator URL or preview results as those passes.

Exact authorizations remain separate: (a) focused dependency remediation through
Opus5.5 and scope-limited retesting; (b) commit plan/review-branch creation and commits;
(c) pushing that branch and opening PRs into develop/main; (d) merging into develop;
(e) **main merge plus its automatic production build/push/deployment**, with agreed
production smoke scope; (f) mobile version changes/signed build dispatch and each
internal upload/environment approval; (g) any later public store rollout. None is
inferred from acceptance of QA or this preparation. A historical stock correction
would require its own evidence and separate authorization: **never add the unproven
nine units automatically**.


## Focused security remediation — 2026-10-18 (final assessment)

Owner explicitly authorized focused dependency/lockfile remediation and local
validation; no branches, staging, commits, pushes, PRs, merges, workflow/settings
changes, deploys, mobile publication, production writes or historical stock fixes.
Accepted source state captured privately before changes. Fresh production audit
reproduces exit 1 with metadata 1 critical / 11 high / 13 moderate / 5 low, 28 advisory
records (10 distinct high/critical records; metadata counts differ). Official
Claude CLI authenticated claude.ai/Max, ANTHROPIC_API_KEY excluded, sole Opus 5.5
writer in existing session d95bcc69-020f-4f7b-a861-0c139acea5a0. Focus: minimal
compatible dependencies, unchanged exceptions, real proxy/IP/throttling regressions.
Private raw results: /private/tmp/teka-security-20261018. Final results follow.

**CodeQL investigation resolved.** GitHub default setup remains configured and
both effective branch rules remain unchanged. PR 824 check rollup contains the
separate **CodeQL SUCCESS** aggregate from Advanced Security alongside both Analyze
jobs: https://github.com/ipanga/teka-rdc/runs/108698421845. The older commit-only
check inspection did not show that PR aggregate. This is expected code-scanning
behavior, not evidence of a broken required context; no administrator intervention
or ruleset rename is indicated. The future PR must still pass its own aggregate.

Docker Desktop was stopped/socket unavailable; starting the existing app restored
engine 29.8.2. Existing unrelated Supabase remains healthy. Old task-owned tmpfs QA
containers are absent after that shutdown; required PG/image checks will use a new
isolated security QA instance, preserving unrelated Docker data and both simulators.


### Security outcome and local readiness

**READY FOR COMMIT/PR REVIEW.** All focused local validation is complete,
including the original API and three web Dockerfiles on Node 20.20.2, plus web
standalone HTTP and native Sharp checks. No new application defect was confirmed.
This is a local review verdict; production release remains unauthorized. Candidate
GitHub CI/review and the physical/mobile/operational gates below remain required.

Official Claude Code Opus 5.5 completed the focused dependencies and new proxy
regressions. Codex independently reviewed/tested them. Before the final two
comment-accuracy corrections, fresh official CLI auth again confirmed
`loggedIn:true`, `authMethod:claude.ai`, `subscriptionType:max`; the inherited
ANTHROPIC_API_KEY was excluded from every CLI child. Final correction report is
successful, modelUsage only claude-opus-5-5. No implementation writer remains.

| Dependency | Locked before → after |
|---|---|
| proxy-addr | 2.0.7 → 2.0.8 |
| compression | 1.8.1 → 1.8.2 |
| @fastify/busboy | 3.2.0 → 3.2.2 |
| @grpc/grpc-js | 1.14.4 → 1.14.5 |
| brace-expansion (production graph) | 5.0.9 → 5.0.12 |
| joi | 18.2.1 → 18.2.9 |
| sharp | 0.35.4 → 0.35.5 |
| source-map-js | 1.2.1 → 1.2.2 |
| fast-uri | 3.1.7 → 3.1.8 |
| multer | 2.3.0 → 2.4.0 |
| dompurify | 3.4.15 → 3.4.16 |
| next (three websites) | 15.5.25 → 15.5.27 |

The [security report](qa/order-integrity/native-followup/security-remediation.json)
contains all 28 original package/advisory records, GHSA/CVE identifiers, complete
paths, direct/transitive status, runtime inclusion, fixed ranges, compatibility
review and tests. All 10 unexcepted critical/high records are fixed (1 critical,
9 high); all 22 non-residual production records are fixed. Sentry remains 10.53.1.
No new advisory/package pair appeared compared with a fresh full-tree audit of
the original manifests/lock;19 unique advisory/package pairs were removed.

Independent audit outcomes are deliberately separate:

- Exact enforced `pnpm audit --prod --audit-level=high`: **exit 0**, output
  **8 vulnerabilities: 6 moderate + 2 high (2 ignored)**. Both high exceptions
  predate this work and remain byte-identical; no exception was added.
- JSON production variant `pnpm audit --prod --audit-level=high --json`:
  **exit 1**, metadata 0 critical / 2 high / 6 moderate; unexcepted 0 critical / 0 high / 6 moderate.
  This observed format-dependent exit behavior is preserved, not normalized.
- Full informational `pnpm audit --audit-level=low --json`: **exit 1**,
  metadata 2 critical / 5 high / 12 moderate / 2 low; unexcepted 2 critical / 3 high / 12 moderate / 1 low.
  Existing dev-tool findings include handlebars 4.7.9 (two critical),
  brace-expansion 1.1.18 (two high), braces 3.0.3 (one high, no patched release).
  These are not new findings and the full audit is not an enforced release gate.
  API Docker copies full node_modules, so tooling can be physically installed
  in that image despite not being an API request path. Do not describe the
  entire dependency tree or image as vulnerability-free.

### Six accepted residuals — review by November 17, 2026

**TEMPORARILY RISK-ACCEPTED, UNRESOLVED.** Explicit owner approval covers only
these six moderate package findings. They share one upstream advisory,
[GHSA-qqmp-wf37-98f9 / CVE-2026-104872](https://github.com/advisories/GHSA-qqmp-wf37-98f9),
which concerns database usernames emitted through db.user telemetry.

| Installed package | Vulnerable version | Upstream fixed version |
|---|---|---|
| @opentelemetry/instrumentation-pg | 0.66.0 | 0.73.0 |
| @opentelemetry/instrumentation-mysql2 | 0.60.0 | 0.67.0 |
| @opentelemetry/instrumentation-knex | 0.58.0 | 0.65.0 |
| @opentelemetry/instrumentation-mysql | 0.60.0 | 0.67.0 |
| @opentelemetry/instrumentation-mongoose | 0.60.0 | 0.67.0 |
| @opentelemetry/instrumentation-tedious | 0.33.0 | 0.40.0 |

Responsible component: API and Buyer/Seller/Admin web Sentry integration;
backend/web telemetry maintainer, with the release owner responsible for acceptance
review. Exact paths for every app remain visible in the JSON. Do not suppress them,
add audit ignores, weaken CI or override Sentry's exactly pinned OTel adapters.

Independent Node 20 API-image verification and three web server bootstrap probes
found no pg/mysql/mysql2/knex/mongoose/tedious driver module. Their instrumentations
are registered but dormant: no matching driver operation is active. Prisma uses
its own engine. **Correction to the initial rationale:** tracesSampleRate: 0 does
NOT globally disable tracing export; the SDK inherits an incoming sampled parent.
The isolated shipping-bootstrap probe observed 0 local-root transactions and 1
inherited transaction. Acceptance relies on the absence of the affected drivers,
not on assuming all tracing is disabled.

The same Node 20 probe ran actual SELECT 1 and bound-value Prisma queries against
the disposable DB. In-memory envelopes contained no synthetic DB username,
password, connection URL or bound parameter value. A synthetic error removed
request token/authorization/cookie/password values. All three shipping web Node
configs also captured/sanitized an error correctly. No Sentry network export was
made. Parameterized SQL text and db.system remain normal Prisma span metadata.
These are bounded local results, not a claim that all possible errors or SQL
strings are safe. All 10 Sentry config files are byte-identical to the last
recorded deployed 60d70ac. Live VPS environment and actual Sentry account telemetry
were not inspected; no production database access occurred.

Safe 10.x investigation: the official registry has no 10.53 patch after 10.53.1.
10.54.0 removes the dependency rows by vendoring the same six affected adapters;
it is not a verified fix. The inspected latest 10.x, 10.76.2 still assigns DB_USER
without a PII guard in pg/mysql/mysql2/knex/tedious vendored code. Its mongoose code
has no DB_USER match; that alone does not establish an all-six compatible fix.
No 10.x upgrade or Sentry 11 upgrade was applied.

Follow-up due **2026-11-17**: inspect a Sentry 10.x release with corrected source,
then have Max-authenticated Opus implement a demonstrated compatible fix and
independently validate all four integrations, privacy envelopes and Node 20 builds.
If unavailable, separately assess removing unused integrations or span-attribute
minimization; never silently extend acceptance or force incompatible overrides.
Reassess immediately before adding an affected driver or changing telemetry.
**Any demonstrated exploitable active production path is a release blocker,
regardless of moderate severity.** No such path was demonstrated here.

### Independent validation and disk recovery

| Check | Actual result |
|---|---|
| Frozen install; shared build; Prisma generation; workspace types | PASS |
| API unit / endpoints | PASS 1,335 / 322, including 32 new proxy regressions |
| Real PostgreSQL | PASS 17 on new disposable localhost testDB only |
| Buyer / Seller / Admin web tests | PASS 278 / 53 / 105 |
| Three host Next production builds | PASS, Node 22.22.2, sanitized local API config |
| API original Dockerfile production build | PASS, Node 20.20.2 |
| Node 20 runtime integrations | PASS patched proxy matching, XFF prefix handling, gzip roundtrip,20 aborted-response/recovery cases, Firebase client construction without service calls and multipart parsing |
| Sharp native host probe | PASS 0.35.5/libvips 8.18.7 PNG and SVG→WebP, Darwinarm64 |
| Relevant Flutter Buyer / Seller tests | PASS 91 /67; no SDK/source changes this task |
| Both Flutter analyzers | PASS; unchanged 7/6 info-only findings, no warnings/errors |
| Sentry shipping bootstraps | PASS Node 20API + three host web Node configs; privacy and inherited sampling qualification above |
| Linux/Node 20 web Docker images + native Sharp runtime | PASS all three; Next 15.5.27, Sharp 0.35.5/libvips 8.18.7; standalone root/robots HTTP 200 and portal login HTTP 200 |

No application test failure remains. The first PG attempt was correctly refused
by its safety guard before scenarios because the private runner supplied the
same application/test URL; only that runner was corrected. The first Sentry probe
used an SQL alias identical to the synthetic DB username and falsely matched it;
the corrected probe and bound-query check pass. An initial private Firebase probe
used the wrong cleanup API and was corrected. Shipping source was not changed to
make any of these probes pass. Earlier accepted full Flutter/native/browser/print
QA was not rerun; its physical-device limitations remain unchanged.

The buyer Docker build was safely interrupted before compilation when only about
2.4 GiB remained. The first post-cleanup observations (5.6–7.9 GiB) were below the
owner's required 8 GiB additional capacity. A subsequent df check found 18 GiB;
the resume runner measured 18.44 GiB before restarting, so the condition
was met. Only the three remaining web images were resumed, reusing caches and the
sanitized 8.31 MB context. Successful build durations: api 117.1s, buyer-web 162.3s, seller-web 182.3s, admin-web 192.4s.

Disk was sampled every 2 seconds with a 3 GiB stop floor; the minimum across
resumed builds was **16.58 GiB**, final observed free space **25.75 GiB**. No
Docker image/volume/container pruning or unrelated file deletion occurred. The
earlier API image was reused. All three final web images ran their actual
standalone server under Node 20.20.2 with no external network: root/robots HTTP200,
Seller/Admin login HTTP200 and private robots preserved. Native PNG roundtrip and
SVG→WebP pass on Sharp 0.35.5/libvips 8.18.7 in each Linux arm64 image. None of the
six affected drivers resolves there. Actual Sentry network export was not tested.

Local images are **Linux arm64** on this Mac; no x86 production-host build is
claimed. The unchanged GitHub ubuntu-latest CI/build jobs must validate the exact
candidate after separately authorized Git actions. Existing task-owned PostgreSQL,
images and build cache remain available; unrelated Supabase and owner simulators
are untouched. No destructive cleanup was performed.

### Final Git/release boundary

Final inventory: **55 modified + 140 proposed additions = 195 files**, zero deleted
or staged. The security delta adds six dependency/lock files, the proxy regression
and security report; the API package's earlier test:pg hunk belongs to inventory
QA. All accepted shipping source is preserved. Since the pre-security snapshot,
only the six manifest/lock files and authorized durable docs changed; no existing
file was removed. The final two proxy comment edits were reviewed as comment-only.
No schema/migration/env/infrastructure/workflow/Fastlane/flavor/signing change.
Existing two audit exceptions unchanged, and no new secret/generated build output
is intended for Git. See the refreshed full inventory and preflight evidence.

Commit 0 and the retained five feature/QA commits above are proposals only. Local
validation is complete; staging still requires the owner to authorize the plan. Then
use the proposed temporary codex/security-order-integrity-release-prep branch,
PR into develop, pass all 13 required contexts plus release acceptance jobs, and
retain main/develop as the only long-lived branches. CodeQL aggregate mapping is
resolved; future candidate CI remains unrun and mandatory.

API compatibility, staged API→Buyer→Seller→Admin rollout, mobile signing/version
and physical gates, automatic deployment on a main merge and rollback asymmetry
remain exactly as reviewed above. Production merge/deploy, mobile builds/uploads,
and production smoke writes each need separate explicit authorization. Historical
two orders/nine units remain restoration-unproven and untouched.


## Local review branch and structured commits — 2026-10-18

**Six local commits prepared; STOP before push/PR.** The owner accepted the
security/local QA reports and explicitly authorized only the temporary local
branch, selective staging, six commits and verification. No substantial application
implementation was needed in this phase. Codex performed Git separation/review;
all previously implemented Opus 5.5 source bytes remain unchanged. No Claude API
billing or new delegation occurred in this Git-only phase.

Branch: `codex/order-integrity-release-review`, based exactly on develop
`9e6bd60d488de644d4526fdcba08a641d233e964`. Cached origin/develop matched that SHA.
Remote refs/working credentials were not refreshed; GitHub was not contacted.
Existing local main was already older than cached origin/main and was left alone.
Only develop/main remain permanent branch roles; this is a temporary review branch.

| # | Commit | Subject and boundary |
|---|---|---|
| 1 | `6151b4fa969c6034082e95ed5a6467b51ce33e04` | `fix(security): remediate production dependency vulnerabilities` — Six dependency/lock files, 32 proxy regressions and security evidence; PG script excluded. |
| 2 | `f7f0a09ee8bf8d22117134e2483456b22d6256d9` | `fix(orders): enforce inventory integrity and safe cancellation` — API/shared/client integrity changes and regressions, safe PG guard/suite/SQL report; PG script included. |
| 3 | `f788bb37a77f6dfd429671e65891adac2be96835` | `feat(admin): add protected printable delivery documents` — Protected document route/middleware/view/formatting/snapshot selection and matching tests; admin page printing/address hunks. |
| 4 | `c9b8d88c8b475f42a9bee0a575993d8bd97b3346` | `feat(buyer): add mobile application promotion` — Buyer promotion/footer/targeting, blocked-storage handling and tests. |
| 5 | `0409da050047b3791a3a75a8db6877d3e5521e5a` | `test(mobile): add isolated native QA integration coverage` — Buyer/Seller opt-in native QA tests, dev SDK locks, simulator tools and reviewed seller SwiftPM pins. |
| 6 | `HEAD` / review-branch tip | `docs(qa): document verification and release readiness` — existing trackers, release/security handoff and all durable synthetic QA evidence. |

The sixth commit is this documentation commit. Its hash is content-derived and
cannot be embedded into itself. The final user-facing handoff supplies its exact
hash; Git persistently records all six. Resolve without modifying anything:

```sh
git log --reverse --format='%H %s' 9e6bd60..codex/order-integrity-release-review
git rev-parse codex/order-integrity-release-review
```

No commit was amended. Documentation was completed before the sixth commit;
post-commit history/content checks are read-only. Each staged diff was inspected,
checked for whitespace/secrets/generated artifacts and matched to its explicit
file list before committing. Static relative-import closure was checked against
the index. No commit hook changed files; the configured hook directory contains
only pre-push, which was not invoked. The index was used to split mixed hunks;
working-tree source files were never overwritten or reset.

### Final focused verification on committed application state

- `pnpm install --frozen-lockfile`, shared build and `pnpm type-check`: PASS.
- Eight relevant API unit suites: **135 PASS**; three endpoint suites:
  **48 PASS**, including 32 proxy tests, document authorization/snapshot tests and
  the disposable-database safety guard.
- Full Buyer/Seller/Admin web suites: **278/53/105 PASS**.
- Relevant Buyer/Seller Flutter tests: **91/67 PASS**. Both analyzers PASS with
  the same 7/6 informational findings and no warnings/errors.
- Exact `pnpm audit --prod --audit-level=high`: **exit 0**, 8 findings:
  six moderate + two previously ignored highs. JSON variant remains **exit 1**,
  with exactly six unexcepted records; metadata 0 critical / 2 high / 6 moderate.
- All 195 accepted path bytes matched the pre-branch manifest after checks.
  Every source/test/dependency/tool byte was already committed after commit 5;
  remaining changes were exactly the planned documentation/evidence.

Commands used a minimal synthetic test environment; production env files were
not loaded. Full command/exit records are in security-remediation.json's
localReviewHandoff. Existing Node 20 API/three web image builds, standalone/Sharp,
PostgreSQL 17, full API 1,335/322 and accepted native/browser/PDF results were retained
because their input bytes were unchanged. No expensive rebuild or simulator
journey was repeated. Local Docker verification remains Linux arm64; exact-head
GitHub ubuntu-latest candidate CI is still required after remote authorization.
Root autofix lint was not run; existing lint debt was preserved.

### Security and release boundary after local commits

The six moderate Sentry records are **temporarily risk-accepted, unresolved until
November 17, 2026**, under the existing conditions and shared advisory/CVE. No new
exception was added; both existing ignored highs remain visible. Matching drivers
are absent, but tracesSampleRate: 0 can inherit sampled parents; the accepted
justification remains driver absence and bounded telemetry verification. Any
active exploitable production path remains a blocker. Historical nine units stay
restoration-unproven and untouched.

Cumulative scope remains **195 paths (55 modified, 140 added), no deletions**,
including 81 intentional synthetic PNG/PDF artifacts. No omitted source, accidental
generated build output, real credential or unrelated change was found. No schema,
migration, environment, infrastructure, workflow, flavor identity or signing
configuration changed. Existing mobile/browser/physical QA limitations remain.

After interruption: read STATUS, this section and the security evidence; verify
branch/base, the six-entry log and a clean git status. Do not reset or reapply
accepted patches. Next safe action requires explicit owner authorization to
**push this branch and open a PR into develop**. Then run/review the candidate's
13 required contexts plus release acceptance jobs; CodeQL aggregate mapping is
already resolved. Merge into develop, subsequent main merge/automatic deployment,
production smoke writes, signed mobile builds/uploads and publication each remain
separate approvals. Preserve API→Buyer→Seller→Admin rollout and compatible API
rollback for new seller clients. No remote or production action occurred here.


## Review branch push and PR into develop — 2026-10-18

**READY TO MERGE INTO DEVELOP — awaiting explicit owner merge authorization.**

[PR #836](https://github.com/ipanga/teka-rdc/pull/836), source
`codex/order-integrity-release-review` → target `develop`.
Remote HEAD: `33993416e980124603d02e2eedcef8ae1dd64710`.
Base: `9e6bd60d488de644d4526fdcba08a641d233e964`, unchanged after fetch and final
remote verification; main remains `60d70ac`. Exactly the accepted six commits
were pushed without force, amendment or another commit. The sixth documentation
commit's literal hash is now recorded above. No implementation correction or
new Claude delegation was necessary; accepted Opus 5.5 implementation is preserved.

All 195 GitHub file blobs match approved local HEAD: 55 modified, 140 added,
zero deleted, including 81 intentional synthetic PNG/PDF artifacts. The complete
six-commit GitHub patch was reviewed and screened. No unexpected file, credential,
schema/migration, environment, infrastructure, workflow, flavor or signing change.
API/client compatibility and expectedQuantity rollback constraints remain as reviewed.

Tested merge candidate: `76f305c51316167c9507871268aad3394bfcada7`.
Its tree `ab133a512ed3a56a3250afddecbdc2015b21bfab` equals approved HEAD's tree;
CI checkout logs identify that candidate. GitHub reports OPEN, MERGEABLE and CLEAN.
Auto-merge is disabled, and no merge occurred.

### Exact-head GitHub Actions

[CI run 39105213864](https://github.com/ipanga/teka-rdc/actions/runs/39105213864)
completed SUCCESS. All 13 live required contexts succeeded:

| Required context | Result |
|---|---|
| Lint & Type Check | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452447) |
| API Tests | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452325) |
| Web Tests | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452412) |
| Dependency Audit | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452461) |
| Release Config | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452477) |
| Web Build (buyer-web) | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452403) |
| Web Build (seller-web) | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452429) |
| Web Build (admin-web) | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452413) |
| Flutter Tests (buyer-mobile) | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452430) |
| Flutter Tests (seller-mobile) | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452408) |
| Flutter Analysis (buyer-mobile) | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452449) |
| Flutter Analysis (seller-mobile) | [SUCCESS](https://github.com/ipanga/teka-rdc/actions/runs/39105213864/job/117609452374) |
| CodeQL | [SUCCESS](https://github.com/ipanga/teka-rdc/runs/117609554971) |

Both extra Analyze (actions) and Analyze (javascript-typescript) checks in
[CodeQL run 39105212841](https://github.com/ipanga/teka-rdc/actions/runs/39105212841)
also succeeded. The required [CodeQL aggregate](https://github.com/ipanga/teka-rdc/runs/117609554971)
was verified on exact HEAD from github-advanced-security integration 57789,
matching the rule. No context/ruleset change, bypass, rerun or suppression.

Actual CI counts: API 1,335 unit/322 endpoint; Buyer/Seller/Admin web 278/53/105;
Buyer/Seller Flutter 527/509. Three Node 20 web production builds passed on Ubuntu.
Analyzers passed with 7/7 info-only notices, no warnings/errors. CI Seller has one
more info than scoped local analysis: use_super_parameters at unchanged baseline
test/support/seller_profile_fixtures.dart:87. No unrelated lint repair was made.

Enforced Dependency Audit passes: 8 findings, 6 moderate + two previously ignored highs.
The full informational audit retains its warning: 21 findings, 2 critical/5 high
(including 2 existing exceptions)/12 moderate/2 low. The push banner's 23 default-branch
alerts are a separate branch/feed view. Six Sentry/OTel package findings remain
**unresolved, temporarily risk-accepted until November 17, 2026** under existing
conditions; no new exception. Matching drivers are absent, but tracing can inherit
sampled parents. Live production telemetry was not inspected. The passing enforced
gate does not establish a vulnerability-free full tree or image.

No check failed and no corrective commit or rerun was needed. PR validation and
its four Docker jobs are configured only for main-targeted PRs, so they did not
run here; none was disabled. They remain a later release-PR gate. No release PR
into main, production deployment/data operation or mobile build/upload occurred.

### Persistent handoff and authorization boundary

The PR description now includes exact-head CI links/results and documented
security/QA limits. Existing release-preflight-result.json records full result
metadata under github_pr_review. Raw CI logs remain private temporary material.

Four existing progress files are locally updated and left **unstaged/uncommitted**:
STATUS.md, PROGRESS.md, this tracker and release-preflight-result.json. The owner
requested continuity updates but prohibited additional commits/pushes without
authorization. Preserve these updates; do not reset/discard, amend the sixth
commit or automatically add/push a seventh. Remote PR HEAD remains 33993416.

Next safe action: request explicit owner authorization to merge PR 836 into develop
with a merge commit. Keep auto-merge disabled. Main merge/automatic deployment,
production smoke writes, stock reconciliation, mobile version bumps/signed builds/
uploads/publication remain separate approvals. Physical store installation/open-app
handoff, native Safari printing and live Sentry inspection remain unverified;
signed-mobile/physical/backup/rollback gates remain. Historical nine units stay
restoration-unproven and untouched.


## Authorized develop merge and read-only production release assessment — 2026-10-18

### Merge verification and preservation

Owner authorization was limited to PR836 → develop using a merge commit. Immediately
before execution: target develop; exact HEAD `33993416e980124603d02e2eedcef8ae1dd64710`;
base `9e6bd60d488de644d4526fdcba08a641d233e964`; MERGEABLE/CLEAN;
all **13 required checks SUCCESS**, including Advanced Security CodeQL aggregate.
Required approvals/protections were respected; no admin bypass or settings change.
`gh pr merge --merge --match-head-commit` completed at **07:15:46 UTC**.

Result: **`41f684d827b05f656b512d00b8c99186975ed94e`**
([merged PR](https://github.com/ipanga/teka-rdc/pull/836)). Its parents are the
previous develop `9e6bd60d488de644d4526fdcba08a641d233e964` and approved head
`33993416e980124603d02e2eedcef8ae1dd64710`. Tree
`ab133a512ed3a56a3250afddecbdc2015b21bfab` equals the approved PR tree exactly.
Remote develop and local develop match the merge commit. Remote/local review branch
remains at approved head; automatic deletion is disabled and no branch was deleted.

The four already-dirty files (STATUS.md, PROGRESS.md, this tracker and
release-preflight-result.json) were copied privately with a binary patch and SHA256
checkpoint before the merge. Local develop was fast-forwarded and switched to;
all four hashes still matched **before** these intentional documentation updates.
Nothing was stashed/reset/discarded/staged or accidentally committed. The same four
files remain locally modified, unstaged/uncommitted. No additional commit/push is
authorized; separately approve documentation inclusion before a later release PR.
Private checkpoint: `/private/tmp/teka-develop-merge-20261018` (temporary, not the durable handoff).

### Checks on the actual develop merge

[CI 39107009104](https://github.com/ipanga/teka-rdc/actions/runs/39107009104)
**SUCCESS, 12/12 jobs**: types, API, web tests, all three web builds, both Flutter
test and analysis legs, Dependency Audit and Release Config.
[CodeQL 39107008969](https://github.com/ipanga/teka-rdc/actions/runs/39107008969)
**SUCCESS, 2/2 analyses** (actions and javascript-typescript), exact merge SHA.
The separate CodeQL aggregate was required/successful on PR836; this push has the
two analysis checks rather than a new PR aggregate. No failed CI job or rerun.

Actual counts: API 82 suites/1,335 unit tests + 26 suites/322 endpoint tests;
web Buyer/Seller/Admin 278/53/105; Flutter Buyer/Seller 527/509. Both analyzers
report 7 info-only items, no warnings/errors; known lint/deprecation debt unchanged.
Enforced `pnpm audit --prod --audit-level=high` passes with 6 moderate + two prior
excepted highs. Full informational audit warns: 2 critical/5 high (2 ignored)/
12 moderate/2 low. Neither outcome establishes a vulnerability-free full tree/image.

Automatic Dependabot update jobs also ran against the new default-branch commit;
some fail and remain visible maintenance follow-ups. All nine inspected failures
say `security_update_not_possible`: the six accepted Sentry/OTel adapters, plus
brace-expansion 1.x, postcss-selector-parser and handlebars full-tree follow-ups.
Examples: pg latest resolvable 0.66.0 vs fixed 0.73.0; selector-parser 6.0.10 vs
7.1.6. No new exception or risk acceptance was added for the other findings.
These jobs are separate from the successful CI/CodeQL workflows; no override,
suppression, rerun, automatic update merge or dependency change was made.
The machine-readable snapshot records observed states without claiming all
Actions jobs green; remaining updater jobs are not release-validation jobs.

### Prospective develop → main release (read-only)

Remote main remains **`60d70aceb199c75370044dd0e7980f22a4ab5ba5`**. No main PR was
created. Current compare is **196 paths: 56 modified, 140 added, zero deleted**;
PR836 contributed 195 paths, and already-present develop documentation history
accounts for the additional tracker path. There are 12 develop-only commits and
one main-only previous release merge; that topology is not a source conflict.
Local merge-tree calculation reports no conflicts and the same approved tree.
A future PR must recheck its actual head/base and merge candidate.

No schema/migration/auto-apply manifest, environment validation/files, Docker/NGINX,
GitHub workflow, Fastlane, flavor or signing configuration change in the release
compare. The added inventory-hold SQL file is a **read-only report, not a migration**;
never execute stock restoration from it automatically. The unchanged manifest has
16 entries; the prior production run logged 0 applied/16 skipped. Live production
ledger is not inspected here, so the release window must confirm expected skips.
Native dev-dependency integration_test entries and two accepted Seller SwiftPM
TOCropViewController 3.2.0 resolutions are included; mobile version fields unchanged.

Live main rules still require a PR, merge commits only and the same 13 contexts:
types, API, web tests, Dependency Audit, Release Config, three web builds, two
Flutter tests, two Flutter analyses and CodeQL aggregate. Its own CodeQL analyses
must pass. Main-targeted `pr-validation.yml` additionally runs lint-typecheck-test
and **four Docker build checks**. These are operational release gates even though
not separately named in the 13-context ruleset. Lint remains explicitly
non-blocking; do not refactor baseline lint or weaken protection.

**Main merge automatically deploys** independently of the CI workflow, without a
production-environment pause. Therefore approve production deployment explicitly
before authorizing a main merge; creating a release PR alone would not authorize it.
No workflow was dispatched or changed in this assessment.

### Backup and rollback readiness

Last successful production deploy remains [36337328372](https://github.com/ipanga/teka-rdc/actions/runs/36337328372),
2026-09-27, main `60d70ac`. Its logs prove historical push of all four full-SHA tags:

| Image at ghcr.io/ipanga/teka-rdc/ | Historical manifest digest |
|---|---|
| api | `sha256:a9a722601485ed39cf0e07f3533d0f80aa744e3772c2119121d86fe4d807a38a` |
| buyer-web | `sha256:1cf58ab2368c6f34618628cb838dce583b989c19bf83979d097277cc8de7801e` |
| seller-web | `sha256:36ba5df1fb58f19dc2f3e0b9e58dd6d0fda837cc55b2a0324e30aa5b3bf8fbcd` |
| admin-web | `sha256:0fa02f9e58052820c462e296772d52ca92e013cc4f08f3a688f9de3efb052d53` |

These establish provenance **only**. A read of GHCR API versions returned 403:
current GitHub token lacks read:packages. No token scope/credential was changed.
Current registry retention/pullability, actual running VPS image IDs/digests and
operator access remain **unverified release gates**; verify all four, use immutable
full-SHA/digest targets rather than latest, preserve runtime-only environment labels.
No image was pulled/re-tagged/pruned and no VPS command was executed.

The deployment guide describes provider backups/manual pg_dump and restore, but
contains no current backup timestamp, restore-test evidence or confirmed provider
retention/PITR state; no repo-owned automated backup workflow was found. **Fresh
production backup + known age, verified storage/access/retention and isolated
restore evidence/RPO/RTO remain required before release**. A DB restore is an
incident recovery action requiring separate authorization; none was taken or
rehearsed against production. No claim is made that provider backups are enabled.

### Deployment sequence, compatibility and mobile gates

Recommended approved window: verify the release head, CI, backup/current rollback
images and operator access first. Existing deploy builds/pushes four images, runs
the unchanged migration ledger step, then health-gated rolls **API → Buyer web →
Seller web → Admin web**, with no manual per-service pause. API liveness alone is
not DB readiness: check full/ready health and compatible seller behavior before
calling release healthy. Watch errors/telemetry after rollout; live Sentry access
and production smoke writes require the separately authorized release scope.

Released old Flutter request shapes remain compatible with the new API.
`expectedQuantity` stays optional; old seller forms retain their documented stale
form limitation. New seller web/mobile sends that field, which the old strict API
rejects with 400. **Roll out API first; roll back an affected website first and
retain an API accepting the field after any new seller binary is distributed.**
Prefer reviewed forward repair/revert to restoring the old integrity bug. No new
schema rollback is required by this change; never repair order/stock history as a
rollback shortcut. Installed mobile clients cannot be recalled by a Git rollback.

No mobile workflow was dispatched, version changed, signed binary built or uploaded.
Buyer remains 0.1.8+11, Seller 0.1.11+13; used Android codes require fresh store readback
and separately approved unique codes/marketing versions. Android signing/AAB and
iOS device/archive/export/Firebase checks, existing environment reviewers and
TestFlight/Play processing/tester verification remain gates. IPA workflow includes
upload after its environment gate; do not assume artifact-only mode. Internal
physical-device checks must precede public publication. Existing simulator journeys
stand; physical store install/open-app handoff and native Safari print pagination
remain **unverified**. Chromium A4 output is accepted; Safari needs a physical check
if used operationally. Android ANR diagnosis remains system/emulator contention,
no demonstrated Teka-specific defect and no speculative correction.

Six Sentry/OTel package findings sharing GHSA-qqmp-wf37-98f9 / CVE-2026-104872 remain
**UNRESOLVED, TEMPORARILY RISK-ACCEPTED until November 17, 2026**, under the existing
reachability/privacy/review conditions and existing two high exceptions. Matching
drivers are absent in accepted runtime images; incoming sampled parents can still
activate tracing. Any active exploitable path blocks release regardless of severity.
No new audit exception/forced incompatible adapter or telemetry claim is introduced.
The nine historical restoration-unproven units remain separate and untouched.

**Next recommended step:** review this handoff, then separately authorize a scoped
documentation commit/push and creation of the develop→main PR. Its review/CI and
backup/rollback preflight must complete before a separate main-merge/production
deployment authorization. Mobile versions/signed builds/internal distribution,
public publication and any production smoke writes remain separate approvals.
Codex performed review/orchestration/documentation only; no implementation correction
or Claude inference/API billing was needed for this merge task.


## Documentation synchronization and Draft release preparation — 2026-10-18

The owner explicitly authorizes the four pending documentation updates through
`codex/release-handoff-docs` → develop, and a **Draft** develop → main PR. No merge,
auto-merge, deploy, production data/infrastructure/secret change, mobile version/
signed build/upload or historical stock restoration is authorized.

The four pending files were copied/hashed before branch preparation, their exact
diff reviewed and added lines screened: zero private keys, tokens/JWTs, credential
URLs or email addresses; no customer records or raw private CI logs. Stored CI
metadata is check/job/step state and public GitHub links. Existing accepted source,
tests, dependency pins and security exceptions are unchanged. No new app correction
or Claude inference is needed; Codex handles review, Git and documentation only.

Current release source **41f684d827b05f656b512d00b8c99186975ed94e** includes PR836.
Develop CI39107009104 (12 jobs) and CodeQL39107008969 (2 analyses) remain SUCCESS.
Main is **60d70aceb199c75370044dd0e7980f22a4ab5ba5**. The 12-ahead/1-behind shape
comes from main-only #821 merge60d70ac, parents860b740/b0f4643. A direct tree diff
against its second/develop parent b0f4643 is empty; there is **no production-only
content to preserve separately**. The main commit itself remains in history.
Prospective main/develop merge tree is ab133a512ed3a56a3250afddecbdc2015b21bfab,
conflict-free and identical to approved develop. No reset/rebase/force-push or
unapproved back-merge is necessary. Release compare remains196 paths (56M/140A/0D),
including previously merged develop-only documentation history.

**Rollback preflight improvement:** Docker's existing credential-store setup can
read all four `60d70ace...` rollback manifests through `buildx imagetools inspect
--raw`. Their SHA256 values exactly equal the four historical deployment digests
listed above, with linux/amd64 images present. No layers were pulled, no login,
permission/token change or registry/VPS mutation performed. GitHub package-version
API still returns403/missing read:packages; this does not invalidate the independently
successful registry manifest reads. Blob downloads/complete image pullability and
**actual running VPS image IDs/digests remain unverified**. Minimal access needed:
an existing read-only-capable deployment connection/operator report for narrowly
scoped Docker ps/inspect fields (never print container Env), plus registry pull/read
for any later separately approved layer verification. No packages:write needed.

**PostgreSQL preflight remains BLOCKED:** existing docs describe backup/restore,
but no authoritative current backup timestamp, availability/location/retention,
checksum/integrity evidence, provider PITR or last isolated restore-test result is
available. No production deploy/provider connection is inherited; only an SSH alias
for another project is configured and it was not used. No production DB connection
or customer-row query was made. Requested an existing connection name or sanitized
operator metadata, without secrets. Do not infer enabled backups from generic
provider guidance. Before release, verify a fresh successful backup and its age,
storage/access/retention, integrity evidence and recoverability. Proposed separate
restore rehearsal: restore a verified backup into a disposable isolated PostgreSQL
instance, outbound integrations disabled, restricted local storage/access; validate
schema/ledger/count/integrity aggregates without exposing rows, record restore time
and recovery point, then separately approve retention/cleanup. Never restore over
production; no backup download or restore was performed here.

Documentation PR and Draft release PR metadata/checks will be recorded after
creation. The Draft source is current develop and **excludes this documentation
branch until its PR is separately authorized/merged**. After a docs merge,
revalidate actual release head, merge candidate and all13 required contexts plus
main-only PR validation/four Docker builds; previous successful runs are insufficient.
Do not enable auto-merge. Main merge automatically deploys without an environment
pause: a later main-merge authorization must also explicitly authorize production
deployment. Retain API→Buyer→Seller→Admin order and expectedQuantity compatibility.

The six moderate Sentry/OTel findings stay UNRESOLVED/risk-accepted through
November17,2026, and the two existing high exceptions stay separate/unchanged.
Any active exploitable affected production path is a blocker. Dependabot update
resolution outcomes remain separate from candidate application CI. Mobile versions,
signing/Fastlane/flavors and workflow/environment reviewer settings stay unchanged;
current signed binaries, store readback, physical install/open-app handoff and
native Safari pagination remain outside verified results. Historical two orders/
nine restoration-unproven units remain untouched.
