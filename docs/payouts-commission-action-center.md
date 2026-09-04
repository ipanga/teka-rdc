# Admin Action Center · Seller payout workflow · Payout notifications · Commission management

Initiative tracker. Started 2026-09-04 on `develop` `44b1c32` (`main == develop`). Financially
sensitive: every phase below is derived from the code, not from the prompt. `docs/payouts.md` is
**stale** on two points (it says `createEarning` credits `walletBalanceCDF` and reject "re-credits
the wallet"; neither happens — the balance is lazy, see §1.1). `docs/order-workflow.md` § Financials
is accurate and wins.

## Phase 0 — audit (read-only, complete 2026-09-04)

Sources: three parallel code audits (financial domain · client surfaces · notifications/RBAC/migrations),
each claim below re-read at the cited line before being recorded.

### 1. The twelve financial-semantics answers

| # | Question | Verified answer |
|---|---|---|
| 1 | Balance source of truth | **Computed on read** from `SellerEarning` rows (`payments/earnings.service.ts` `getBalances`, `eligibleEarningWhere` / `pendingEarningWhere`). `SellerProfile.walletBalanceCDF` is dead (seed-only). |
| 2 | When commission is final | **At delivery.** `AdminOrdersService.markDelivered()` fires `createEarning()` fire-and-forget, which snapshots `commissionRate / commissionCDF / netAmountCDF`. Nothing is snapshotted at checkout; before delivery the seller sees a live projection (`isFinal:false`). |
| 3 | When earnings become payable | **On read, no status column, no cron.** Eligible = `isPaid=false AND payoutId IS NULL AND order.status != RETURNED AND order.deliveredAt <= now − 48 h` (`RETURN_WINDOW_DAYS = 2`). |
| 4 | Cancellation / return effects | Cancel (buyer/seller/admin) restocks only; `paymentStatus` and the COD `Transaction` stay `PENDING`. Return approve → order `RETURNED`, restock, and **`reverseEarning()` deletes the earning row** (no reversal row); if the earning is already in a payout it only logs "manual clawback required" and writes a `REFUND/MANUAL` transaction. |
| 5 | Requested funds reserved? | **Yes.** `requestPayout` flips the eligible earnings to `isPaid=true, payoutId=<new>` in the same `$transaction` as the payout create, so they leave `availableCDF` immediately. |
| 6 | Overlapping requests possible? | **Yes (race).** The pending check (`findFirst` on `REQUESTED/APPROVED`) and the eligible-earnings read both run *before* the transaction, unlocked; the `updateMany` has no `payoutId: null` guard; no partial unique index. Two concurrent requests → two `REQUESTED` payouts over the same earnings. `PROCESSING` is not in the pending list (both clients block it, the API does not). |
| 7 | Double-payment protection | Status guards exist on approve/process/complete/reject but are **read-then-write** without a transaction or a conditional `where: {status}`; two concurrent `complete` calls both pass, the second overwrites `externalReference` and sends a second "paid" notification. Money moves off-platform, so this is a duplicate-notification / audit defect, not a double disbursement. |
| 8 | Destination snapshotted? | **Yes.** `Payout.payoutMethod` / `payoutPhone` are NOT NULL, filled from the request body or the profile at request time; admin list + CSV read the snapshot. |
| 9 | Rate snapshotted? | **Yes, per earning:** `SellerEarning.commissionRate Decimal(5,4)` + `commissionCDF`. Not on `OrderItem`/`Order`. No record of *which rule* produced the rate. |
| 10 | Can today's rate change old earnings? | **No** for delivered orders (all reads use the persisted row). **Yes for placed-but-undelivered orders**: the projection and the final rate use the rate active at delivery, not at checkout. |
| 11 | Auditability | **Thin.** `Payout.approvedById/approvedAt` only; `process` / `complete` / `reject` record no actor (logger only); `CommissionSetting` has no `updatedById` or history; no `AuditLog` model anywhere. |
| 12 | Payout states + meaning of approve | `PayoutStatus = REQUESTED → APPROVED → (PROCESSING) → COMPLETED`, `REQUESTED|APPROVED → REJECTED`. **Approve = authorization only** (no money, no earning change). **Paid = `COMPLETED`**, a distinct manual mark-paid with a required `externalReference` — the existing model already keeps approval and payment apart. Notifications: approve → `notifyPayoutApproved`, complete → `notifyPayoutPaid`, reject → `notifyPayoutRejected` (push + email fallback, **no feed row**); `process` and `request` notify nothing. |

### 1.1 Current-state diagrams (as implemented)

```
EARNING  (SellerEarning row; state derived on read)
  [none] ──markDelivered (fire-and-forget)──▶ HELD        isPaid=false, payoutId=null, deliveredAt > now−48h
  HELD ──time──▶ AVAILABLE                                  deliveredAt ≤ now−48h AND order.status ≠ RETURNED
  HELD|AVAILABLE ──return approved──▶ [row deleted]         history lost
  AVAILABLE ──requestPayout──▶ RESERVED                     isPaid=true, payoutId=P
  RESERVED ──payout rejected──▶ AVAILABLE                   isPaid=false, payoutId=null
  RESERVED ──payout completed──▶ RESERVED                   unchanged; "paid" lives on the payout
  RESERVED ──return approved──▶ RESERVED + log "manual clawback"
  any ──order forced DELIVERED→CANCELLED──▶ unchanged       still counts as AVAILABLE  ← defect

PAYOUT
  REQUESTED ──approve (approvedById/At, notify)──▶ APPROVED
  APPROVED  ──process (no actor, no notify)──▶ PROCESSING
  APPROVED|PROCESSING ──complete(externalReference, processedAt, notify "paid")──▶ COMPLETED  (terminal)
  REQUESTED|APPROVED ──reject(reason, unlink earnings, notify)──▶ REJECTED               (terminal)
  PROCESSING ─✗─▶ REJECTED   (not implemented)
```

### 1.2 Commission model as implemented

`getCommissionRate(categoryId)`: (1) `CommissionSetting{categoryId = leaf, isActive}` → (2)
`CommissionSetting{categoryId = null, isActive}` (the platform default) → (3) hardcoded `0.1000`.
Applied to `order.subtotalCDF` using **only `items[0].product.categoryId`** (first item's leaf, no
tree walk). **No per-seller rate exists** (`SellerProfile` has no commission column). Rate is
`Decimal(5,4)`; money is BigInt centimes; the multiply is `Math.round(Number(gross) * rate.toNumber())`
(float). Admin CRUD: `PUT/DELETE /v1/admin/commission-settings[/:categoryId]`; admin UI treats `0`
as a real 0 % override. Seeded Électronique override sits on a *top-level* category and therefore
never matches (products link to leaves).

### 1.3 Admin dashboard actionable coverage

Rendered and honoured by the destination filter: products awaiting moderation
(`?status=PENDING_REVIEW`), the five order-ops queues, returns (`?status=REQUESTED`). Rendered but
**not** honoured: sellers awaiting approval (links to `/dashboard/sellers` with no query; the page
never reads the URL). **Not rendered at all** although the stats endpoint returns them:
`pendingPayoutsCount` / `pendingPayoutsAmountCDF` (defined as `status = REQUESTED` only — approved
payouts awaiting actual payment are counted nowhere). The payouts page has no `?status=` deep link.

### 1.4 Notification behaviour

Seller feed = `UserNotification` (`type ∈ PRODUCT_APPROVED | PRODUCT_REJECTED | BROADCAST |
PRODUCT_PROMO | ORDER`, **no PAYOUT**). Established helper: `UserNotificationService.create()` then
`SellerNotificationService.pushOrEmailToSeller()` (push, email only when 0 devices). The three
payout notifiers skip the feed row. Push payload `data.screen = 'earnings'` is handled by neither
client: seller-mobile `notification_router.dart` falls to `default → null`, seller-web `hrefFor` maps
only `product` / `order`. No dedup key on notifications; exactly-once relies on the payout status
guards, which are racy (Q7). Email templates `payout-{approved,paid,rejected}` exist.

### 1.5 Defects and risks (ranked)

1. Payout request race — no lock, no partial unique index, unguarded `updateMany` (Q6).
2. Admin transition TOCTOU — read-then-write, no conditional update, no transaction (Q7).
3. `markDelivered` side effects run after commit, fire-and-forget, no retry: a crash leaves a
   DELIVERED order with no earning and a PENDING COD transaction.
4. Forced `DELIVERED → CANCELLED` keeps the earning payable (eligibility excludes only `RETURNED`).
5. Return approval has no window check; an in-window request approved after a payout request lands in
   the silent "manual clawback" branch with no flag on any row.
6. Return approval **deletes** the earning row — ledger history lost, `totalEarnedCDF` shifts.
7. Float in commission math; `Math.round` half-up.
8. Commission from the first item's leaf category only; overrides above leaf level never apply.
9. No actor on process/complete/reject; no audit of commission changes; no `AuditLog`.
10. `PROCESSING` not in the API's pending list (clients and docs say one request at a time).
11. Multiple global `CommissionSetting` rows possible (`findFirst`).
12. Client bugs: seller-web shows commission as `0.1%`, seller-mobile as `0%`; mobile `payout_tile`
    matches `MPESA/AIRTEL/ORANGE` instead of the API's `M_PESA/AIRTEL_MONEY/ORANGE_MONEY`
    (raw enum shown); in-window earnings labelled « Disponible »; mobile earnings use a raw
    `ScaffoldMessenger` and hand-rolled Dio error parsing (Rule 15); `Complété` (web) vs `Terminé`
    (mobile) for the paid state; hard-coded « 5 000 FC » with a space separator on both clients.
13. Cancelled orders keep `paymentStatus = PENDING` and the COD transaction `PENDING` forever.

Not defects: destination snapshot (Q8), reservation (Q5), rate snapshot (Q9), approve ≠ paid (Q12).

## Phase 1 — design (proposal; decisions marked ⚠ need explicit approval)

### Payout state machine (proposed = existing enum, hardened)

Keep `REQUESTED → APPROVED → PROCESSING? → COMPLETED` and `→ REJECTED`; no new statuses. Changes:
- every admin transition becomes `updateMany({ where: { id, status: <expected> } })` inside a
  `$transaction`, failing with 409 when `count === 0` (idempotent under retries / double clicks);
- ⚠ **D1** allow `PROCESSING → REJECTED` (reason required, earnings unlinked) so a failed transfer is
  representable; today it is a dead end;
- ⚠ **D2** treat `PROCESSING` as pending for new requests (API joins the clients);
- `requestPayout`: pending check + eligible read + reservation inside one `$transaction`, the
  `updateMany` guarded by `payoutId: null` and its `count` compared to the expected ids, plus a partial
  unique index `payouts(sellerProfileId) WHERE status IN ('REQUESTED','APPROVED','PROCESSING')`;
- actor columns `rejectedById`, `processedById`, `completedById` (+ timestamps) on `Payout`, and a
  generic `admin_audit_logs` table (actorId, action, entityType, entityId, before/after JSON, reason)
  written inside the same transactions for payout transitions, commission changes and settings.
- UI label for `COMPLETED` becomes « Payé » on both clients (presentation only).

### Commission precedence (proposed)

`effective = SellerProfile.commissionRate ?? CommissionSetting[leaf category] ?? CommissionSetting[global] ?? 0.1000`

- `SellerProfile.commissionRate Decimal(5,4) NULL` — **NULL means "use the default"**; `0` is a
  legitimate 0 %. Admin seller detail: « Utiliser la commission par défaut » toggle + custom rate.
- ⚠ **D3** seller override *above* category override (negotiated seller deals win) — alternative is
  category above seller.
- `SellerEarning.commissionSource` (`SELLER | CATEGORY | GLOBAL | DEFAULT`) + `commissionRuleId`
  snapshotted at creation so every historical row explains itself. Existing rows stay NULL (unknown).
- ⚠ **D4** rate resolution time stays **at delivery** (current behaviour; COD sale completes at
  delivery). Alternative: snapshot at checkout on `Order`. Either way delivered rows never change.
- ⚠ **D5** multi-category orders: keep order-level rate from the first item (status quo) or compute
  per `OrderItem` category and sum. Changes future amounts, never history.
- Integer arithmetic: rate as basis points ×100 (`Decimal(5,4)` → bigint 0..10000), commission =
  `(gross * r + 5000n) / 10000n` (half-up), no floats.
- Enforce a single global row (upsert on `categoryId IS NULL`); validate `categoryId` by DB lookup.

### Earnings ledger (proposed)

Stop deleting on return: add `SellerEarning.reversedAt` (+ `reversalReason`), exclude reversed rows
from balances/reports, keep `orderId @unique`. ⚠ **D6** eligibility becomes positive
(`order.status = DELIVERED`) so a forced cancel also removes payability. Return approval flags the
in-payout case on the row (`clawbackRequiredAt`) instead of a log line. `markDelivered`: move earning
creation + COD `Transaction` completion into the same transaction as the status flip (the current
"fire-and-forget after commit" is defect 3).

### Notifications (proposed)

Add `PAYOUT` to `UserNotificationType`; `notifyPayout{Approved,Paid,Rejected}` write the feed row
first (`entityType:'payout'`, `entityId`), then push/email — the existing helper order. Copy for
paid: « Paiement effectué » / « Votre demande de paiement de 900.000 FC a été marquée comme payée. »
Approved and rejected keep their notifications; `PROCESSING` stays silent (no seller action).
Effectively-once comes from the conditional transition (a retry that finds `count = 0` never
notifies). Clients: seller-mobile push router handles `earnings`, feed `entityType:'payout'` opens
`/earnings`; seller-web `hrefFor('payout') → /dashboard/earnings`. Old mobile builds render an
unknown type with the default icon and no navigation (verified: `default:` branches exist).

### Admin Action Center (proposed)

One « À traiter » block on `/dashboard` fed by the existing `/v1/admin/stats` (extended with
`payoutsAwaitingReview` = REQUESTED, `payoutsAwaitingPayment` = APPROVED + PROCESSING, and the amount
of each), each tile deep-linking to a filtered queue that reads `?status=` from the URL: sellers
(`?status=PENDING`), payouts (`?status=REQUESTED|APPROVED`), plus the existing product/order/return
links. KPIs (users, revenue, trends) move below. Count/queue reconciliation tests on the stats
service and on each page's initial filter.

### Schema / migrations (all additive, `auto-apply.list`, idempotent)

1. `ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'PAYOUT';` (top-level statement).
2. `seller_profiles ADD COLUMN "commissionRate" DECIMAL(5,4) NULL`.
3. `seller_earnings ADD COLUMN "commissionSource" TEXT NULL, "commissionRuleId" UUID NULL, "reversedAt" TIMESTAMPTZ NULL, "reversalReason" TEXT NULL, "clawbackRequiredAt" TIMESTAMPTZ NULL`.
4. `payouts ADD COLUMN "rejectedById"/"processedById"/"completedById" UUID NULL, "rejectedAt"/"processingAt" TIMESTAMPTZ NULL`; partial unique index on `(sellerProfileId)` for open statuses.
5. `admin_audit_logs` table (template: `2026-06-18_user_notifications.sql`).

No backfill, no rewrite of existing rows. Rollback = drop the added columns/table/index.

### Backward compatibility

All API changes are additive; response shapes keep every existing field (`pendingPayoutCDF` stays).
Installed seller-mobile 0.1.7 keeps working: unknown notification type → default icon; new payout
fields are optional. A 409 on a duplicate request already exists and both clients surface it.

### PR / merge order

1. `docs`: this audit (Phase 0/1) — **this PR**.
2. `api`: ledger + payout hardening (transactions, conditional updates, partial index, actor columns,
   audit table, integer commission math) + migrations 3–5 + specs.
3. `api` + `admin-web`: Action Center (stats extension, `?status=` on sellers/payouts, dashboard).
4. `admin-web`: payout queue/detail/actions with reasons, references, actors, balance context.
5. `api` + `admin-web`: commission default + per-seller override (migration 2, precedence, audit).
6. `api` + `seller-web` + `seller-mobile`: PAYOUT feed notifications (migration 1), deep links,
   parity fixes (labels, method names, rate display, Rule 15).
7. regression/security/performance review; 8. docs + release prep. **No `main` merge without approval.**

## Decisions (approved 2026-09-04)

| # | Decision | Approved as |
|---|---|---|
| D1 | `PROCESSING → REJECTED` | **Yes.** Reason + actor + audit row; reserved earnings released in the same transaction. |
| D2 | `PROCESSING` blocks a new request | **Yes**, enforced in the API transaction (row lock on the seller profile) and by the partial unique index `payouts_one_open_per_seller`. |
| D3 | Precedence | **seller override → leaf category → global.** No hardcoded fallback once a global row is guaranteed (the migration materialises 10 % only where none exists; the API then refuses to deliver without one). |
| D4 | Rate resolution time | **At delivery** (COD: the sale completes when Teka delivers and collects the cash). Snapshotted on the earning and on every order item. |
| D5 | Multi-category orders | **Per item**: each line at its own rule, amounts summed; integer arithmetic on centimes, half-up rounding per line (`payments/commission-math.ts`). Earning keeps the exact rate when all lines share one rule, otherwise a blended display rate + `MIXED`. |
| D6 | Payability | **Order must still be `DELIVERED`.** Reversals are auditable: the earning row is kept and stamped `reversedAt`/`reversalReason` (`RETURN_APPROVED` \| `ORDER_STATUS_FORCED`); if already reserved in a payout, `clawbackRequiredAt` is stamped instead. Nothing is deleted; no historical row is rewritten. |

**COD invariant (recorded):** an earning exists only from `markDelivered` (inside its transaction).
No earlier lifecycle step creates a withdrawable balance. Extensible: the earning/commission model
does not reference the payment method; a future non-COD method would call the same ledger at its
own "cash collected" event.

## PR 2 — API financial foundation (`feat/api-payout-ledger-foundation`)

Scope: `apps/api` only. Schema additive; migration `manual/2026-09-04_payout_commission_ledger_foundation.sql`
(in `auto-apply.list`).

- **Earnings ledger** (`payments/earnings.service.ts`): `resolveCommission` (D3), per-item
  `computeBreakdown` (D5) on `commission-math.ts` (BigInt, half-up), `createEarning(orderId, tx)`
  snapshotting earning totals + `commissionSource` and per-line `OrderItem.commission*`, positive
  payability (`order.status = DELIVERED`), `reverseEarning` marks instead of deleting, totals/reports
  exclude reversed rows. `CommissionNotConfiguredError` replaces the hardcoded 10 %.
- **Delivery** (`admin/admin-orders.service.ts`): COD transaction completion + earning creation now
  run inside the `markDelivered` transaction (a failure rolls the delivery back). Forced exit from
  `DELIVERED` reverses the earning (`ORDER_STATUS_FORCED`). Previews project per item and degrade to
  zero commission (non-final) when unconfigured.
- **Payouts** (`payouts/payouts.service.ts`): request = one transaction with `SELECT … FOR UPDATE`
  on the seller profile, open-payout check (`OPEN_PAYOUT_STATUSES` incl. PROCESSING), eligibility
  read under the lock, reservation `updateMany` guarded by `payoutId: null`/`reversedAt: null` with a
  count check, P2002 → 409. Admin transitions = conditional `updateMany({ where: { id, status } })` +
  audit row in one transaction; `count = 0` → 400 with the current status, no re-notify. Actor
  columns `processingById/At`, `completedById`, `rejectedById/At`. `PROCESSING → REJECTED` allowed.
- **Audit** (`audit/admin-audit.service.ts`, `admin_audit_logs`): who/what/when/before/after/reason
  for payout transitions and commission settings (upsert/remove now take the actor).
- **Consumers updated**: reports (`REVERSED` payout status, seller-performance excludes reversed),
  admin stats (commission total excludes reversed), account deletion (open statuses incl. PROCESSING).
- **Backward compatibility**: wallet/payout response fields unchanged (new fields optional);
  `/v1/sellers/payouts` 409 semantics unchanged for clients; mobile 0.1.7 keeps working.

## PR 3 — Admin Action Center (`feat/admin-action-center`)

Scope: `apps/api` (stats + queue definitions) and `apps/admin-web` (dashboard, payouts, sellers). No
schema/migration/env/dependency change on the API; admin-web gains `vitest` (dev dependency) for
pure-logic tests.

- **`admin/admin-queues.ts`** — the authoritative `where` builders for every "À traiter" queue.
  `AdminStatsService` counts with them and `findSellerApplications(status=PENDING)` lists with the
  same one; `admin-queues.spec.ts` captures the `where` each service passes to Prisma and asserts
  equality (count/queue reconciliation), plus soft-delete exclusion.
- **`/v1/admin/stats.actionCenter`** (additive) — `sellerApplicationsPending`, `productsPendingReview`,
  `returnsPending`, `ordersReadyForPickup`, `ordersReceivedAtTeka`, `payoutsAwaitingReview {count,
  amountCDF}` (REQUESTED), `payoutsAwaitingPayment {count, processingCount, amountCDF}` (APPROVED +
  PROCESSING). Legacy fields kept. Applications list now also exposes `user.status/createdAt`.
- **Dashboard** (`dashboard/page.tsx`) — one « À traiter maintenant » block first: seven tiles
  (finance → moderation → returns → logistics), each deep-linking to the filtered queue; zero counts
  muted; « Rien à traiter pour le moment. » / « N éléments en attente d’une action. » summary; explicit
  error state with retry and no fabricated numbers; skeleton tiles while loading. KPIs and a
  « Suivi logistique » follow-up (seller-side new orders, out for delivery, delivered today) below;
  trends unchanged. `lib/action-center.ts` (pure) + `action-center.test.ts` (8 vitest cases: one tile per
  counter, href ↔ queue, money passthrough, ordering, zero state, `?status=` allow-list, URL round-trip).
- **Payouts page** — honours `?status=` on mount (allow-listed) and writes the tab back to the URL.
- **Sellers page** — honours `?status=` and, for the PENDING/APPROVED/REJECTED tabs, lists from
  `/v1/admin/sellers/applications?status=` (server-side filter + pagination) instead of narrowing a
  paginated `/users` page client-side; explicit load-error state with retry; French empty state for the
  pending queue.

### Runtime verification (2026-09-04, Chrome, isolated local stack)

Signed in as the seeded ADMIN with the repository's dev-only temporary-password helper (cleared right
after) against an **isolated API on :5051** (`COOKIE_DOMAIN` cleared — the dev env's `.teka.cd`
domain makes the browser drop the session cookie on localhost; pre-existing) and admin-web pointed
at it. Verified on the dev DB: action center loaded with **1** virement à approuver (**63.000 FC**),
**3** produits à valider, the five other queues at 0 (muted), summary « 4 éléments en attente »;
« Virements à approuver » → `/dashboard/payouts?status=REQUESTED` opened on the « En attente » tab
showing exactly that one 63.000 FC request; « Vendeurs à approuver » → `/dashboard/sellers?status=PENDING`
opened on « En attente », called `/applications?status=PENDING` and rendered the empty queue copy.
Loading, loaded and error states of the action center were all seen (the error state appeared while
the stale session was 401ing). **Not verified:** the narrow-viewport layout (the automation window
did not resize), the products/orders/returns deep links (unchanged pages), and hover/keyboard focus.
No admin mutation was triggered. Side effect during QA: a production `next build` inside
`apps/admin-web` broke the running `next dev` server until it was restarted — do not build in an app
directory while its dev server runs.

### Tests

API: `admin-queues.spec.ts` (4) + updated `admin-stats.service.spec.ts`; full suite **551 unit**,
type-check clean. admin-web: type-check clean, **8 vitest**, production build clean (32 routes).

## PR 4 — Admin payout workflow (`feat/admin-payout-workflow`)

Scope: `apps/api` (payout detail context, 409 on stale transitions, reject-reason bounds, a dev-only
seller password helper) and `apps/admin-web` (payout queue, detail drawer, actions). **No schema,
migration, env or dependency change.**

### API

- **`GET /v1/admin/payouts/:id`** (additive) now carries the operator's decision context on top of the
  row: `balances` (`availableCDF`, `pendingCDF`, `totalEarnedCDF`, `totalCommissionCDF` — centime
  strings from `EarningsService.getBalances`, never computed client-side), `actors`
  (`approvedBy`/`processingBy`/`completedBy`/`rejectedBy` resolved to `{id, firstName, lastName}` —
  the `user` query selects exactly those three columns), and `auditTrail` (the `admin_audit_logs`
  rows for the payout, newest first, each with `actorName`). Every pre-existing field is kept, so the
  seller clients and the list endpoint are untouched.
- **Stale / concurrent transitions answer 409** instead of 400 (`ConflictException`): the
  conditional `updateMany` found `count = 0`, i.e. another admin moved the payout first or the action
  was retried. Validation failures stay 400, so a client can tell "refresh, state moved" from "fix
  your input". Message elision fixed (« Impossible d’approuver … »).
- **`RejectPayoutDto.reason`: 5–500 characters** — it is shown to the seller and preserved in the
  audit trail. `CompletePayoutDto.externalReference` stays 1–200.
- `scripts/set-temp-seller-password.ts` mirrors the admin helper (refuses prod, refuses to overwrite a
  real credential, `--clear`). Not used in this QA — see below.

### admin-web

- **`lib/payout-workflow.ts`** (pure, 12 vitest cases): `allowedActions(status)` mirrors the API
  state machine exactly (REQUESTED → approve | reject; APPROVED → process | complete | reject;
  PROCESSING → complete | reject; COMPLETED / REJECTED → nothing); distinct labels where
  authorization is never worded as payment (« Demandé », « Approuvé — à payer », « Virement en
  cours », « Payé », « Rejeté / échec »); per-status hints; DTO-mirroring `validateReason` /
  `validateReference`; `describeActionError` maps 409/404 to "stale → close the dialog, reload the
  authoritative state, never assume success"; method labels; audit-action labels.
- **`dashboard/payouts/page.tsx`** — tabs « Tous · À approuver · À payer · En cours · Payés · Rejetés »
  (URL-backed, from PR 3); each row shows only the transitions the API accepts, plus « Détails »;
  paid rows show the payment reference, rejected rows the reason. One confirmation dialog per action
  with explicit wording: approve says no money moves; « Lancer le virement » says the seller is not
  notified; « Marquer payé » requires a payment reference and says the seller will receive
  « Paiement effectué »; reject requires a reason and reads « Transfert échoué » from PROCESSING.
  Double-submit lock (`useRef`) + disabled controls while a dialog is open. Detail drawer: status
  badge + hint + reference/reason, « Contexte financier du vendeur » (requested vs available (excluding
  this payout) vs pending, total earned / commission), destination « figée à la demande », timeline with
  actors, reserved earnings with a « Récupération manuelle » flag on `clawbackRequiredAt`, audit
  history, and the same action bar. Success/error feedback is repeated inside the drawer (the page
  banner sits under the overlay). Explicit loading / error-with-retry / per-tab empty states.

### Runtime verification (2026-09-04, Chrome DevTools MCP, isolated local stack)

Same recipe as PR 3 (API on :5051 with `COOKIE_DOMAIN` cleared, admin-web pointed at it, temporary
admin password set then cleared, user's dev server restored afterwards). The Claude-in-Chrome
extension was not connected this time; the Chrome DevTools MCP tools (`take_snapshot` uids +
`fill_form`/`click`) worked well. Walked the **seeded payout `d0000000-…0001` (Boutique Marie,
63.000 FC) through the whole lifecycle on the dev DB**:

1. « À approuver » listed exactly the one request; « Détails » opened the drawer with balances
   (63.000 FC available, 0 FC pending, 115.000 FC / 11.500 FC earned / commission), the snapshotted
   M-Pesa destination, the « Demandé » timeline entry, no reserved earnings (the seeded row predates
   the ledger) and an empty audit history.
2. « Rejeter » → reason `abc` → « Indiquez une raison d’au moins 5 caractères. » (no request sent);
   cancelled.
3. « Approuver » → confirm → badge « Approuvé — à payer », hint « L’argent n’a PAS encore été
   envoyé », timeline « Approuvé par Admin Teka », audit row, the queue behind emptied
   (« Aucune demande à approuver. »), actions became « Lancer le virement · Marquer payé · Rejeter ».
   Dev email « Retrait approuvé » logged for marie@shop.cd.
4. « Lancer le virement » → « Virement en cours », timeline « Virement lancé par Admin Teka »,
   actions « Marquer payé · Transfert échoué ».
5. « Marquer payé » with an empty reference → « La référence de paiement (ex. identifiant M-Pesa) est
   requise. »; with `MPESA-QA-20260904-001` → « Payé », reference shown, « Payé par Admin Teka »,
   « Aucune action — état final ». Dev email « Retrait effectué » logged. « Payés » tab lists the row
   with « Réf. MPESA-QA-20260904-001 ».
6. Narrow viewport (390 px): header collapses to the drawer menu, tabs and the table scroll inside
   their own containers, no body overflow.

Against the API directly (curl with the admin session): `approve` while PROCESSING → **409**;
`reject` with `abc` → **400** validation; `complete` again after COMPLETED → **409** (double-payment
refused). DB after the run: `status=COMPLETED`, `externalReference` set, the three actor ids +
timestamps stamped, three `admin_audit_logs` rows (`PAYOUT_APPROVED`, `PAYOUT_PROCESSING`,
`PAYOUT_COMPLETED`, each with the after-state). No `PAYOUT` feed row yet — that is PR 6 by design.

**Not verified:** the reject *submission* path and the « Rejetés » tab with data (the dev DB has one
payout, now paid; the demo seller's password is unknown and swapping it was declined, so a second
request could not be created), the 409 path *through the UI* (covered by `describeActionError`
tests + the curl proof above), pagination, hover/keyboard focus. The reject path itself is
spec-covered in `payouts.service.spec.ts` (REQUESTED / PROCESSING → REJECTED, earnings released).

### Tests

API: `payouts.service.spec.ts` +1 (detail context: balances, actors, trail, restricted user select);
stale-transition expectations moved to `ConflictException`; full suite **552 unit**, type-check
clean. admin-web: type-check clean, **20 vitest** (8 action-center + 12 payout-workflow), production
build clean (32 routes, private `robots.txt`).

### Dependency / merge order

Builds on PR 3 (`?status=` + `readStatusParam`/`withStatusParam`); independent of PR 5 (commission
admin) and PR 6 (feed notifications). Safe to merge into `develop` on its own. No production action.

