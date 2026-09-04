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

## PR 5 — Commission administration (`feat/commission-admin`)

Scope: `apps/api` (seller-override endpoints, history, optimistic concurrency) and `apps/admin-web`
(Commissions page rework, seller « Commission » card). **No schema, migration, env or dependency
change** — `SellerProfile.commissionRate`, the `CommissionSource` enum, the per-item snapshot columns
and the audit actions `SELLER_COMMISSION_OVERRIDE_SET/CLEARED` all shipped with PR 2.

### Re-audit (2026-09-04, against the code in `develop` at `dccd864`)

| Question | Answer (verified in code) |
|---|---|
| Where does the rate come from? | `EarningsService.resolveCommission(sellerProfileId, categoryId)`: `SellerProfile.commissionRate` (NULL = no override; `0` = real 0 %) → active `CommissionSetting[leaf category]` → active `CommissionSetting[categoryId IS NULL]` → `CommissionNotConfiguredError` (no hardcoded fallback; the PR 2 migration guarantees a 10 % global row where none existed). |
| When is it calculated? | Once, at **delivery**, inside `markDelivered`'s transaction (`createEarning`), per order item, integer centimes with half-up rounding (`commission-math.ts`). Order-detail previews before delivery recompute but are labelled non-final and read the earning row once it exists. |
| Is history a monetary snapshot? | Yes. `SellerEarning` stores `grossAmountCDF / commissionCDF / netAmountCDF / commissionRate / commissionSource`; every `OrderItem` stores `commissionRate / commissionCDF / commissionSource / commissionRuleId`. Balances, payouts, reports and the seller clients read these persisted amounts. **Nothing recomputes from the current rate.** |
| Precedence default vs override | `seller override ?? category rate ?? platform default` (decision D3). Fully compatible with the requested `override ?? default` — the category tier sits between them and is surfaced explicitly in the UI. |
| Removing an override | `commissionRate` → NULL; the next delivered order resolves category/global again. Existing earnings untouched (spec: "removing the override falls back … no persisted earning is rewritten"). |
| Validation / precision | Decimal(5,4): fraction in [0, 1], ≤ 4 decimals (0,01 % steps). DTOs: `IsNumber({maxDecimalPlaces: 4})`, `Min(0)`, `Max(1)`, whitelist (unknown props → 400). Service re-normalises through the integer representation (0.1 ≡ 0.1000) and `rateToUnits` throws on anything else. |
| Who may change it? | `@Roles('ADMIN')` (class-level) — same as the existing platform/category endpoints. `SUPPORT` can read a seller (`/admin/users/:id`) but not its commission endpoints. `FINANCE` exists in the enum but is not wired anywhere today (follow-up, not changed here). |
| Auditability | Every mutation writes an `admin_audit_logs` row **inside the same transaction** (actor, action, entity, before/after). Unchanged values are no-ops with no audit row. |
| Future-only? | Yes — by construction (snapshot at delivery). Browser-verified: after 10 % → 12,5 % the two historical earnings kept `0.1` and their amounts (`updatedAt` Feb/Apr 2026). |

### API

- **`GET /v1/admin/sellers/:sellerProfileId/commission`** → `overrideRate`, `platformDefaultRate`,
  `effectiveRate`, `effectiveSource` (`SELLER | GLOBAL | null`), `activeCategoryOverrides` (how many
  category rates can still precede the default for this seller), `lastChange` (action, actor, before,
  after, createdAt). Never fabricates a rate: no global row → `null`.
- **`PUT …/commission { rate, expectedPreviousRate? }`** — sets the override; **`DELETE …/commission
  { expectedPreviousRate? }`** — clears it (idempotent). Keyed by `SellerProfile.id` (the row that
  carries the rate and the audit entity). 404 unknown seller, 400 invalid rate, **409** when
  `expectedPreviousRate` (the value the operator saw, `null` = none) differs from the stored value —
  optimistic concurrency, added after browser QA showed a stale screen could confirm « 8,25 % → 7 % »
  over a colleague's 6 %. Omitted → previous behaviour (older clients). The same field was added to
  `UpsertCommissionDto` for the platform default and category rates. The 409 message names the
  current value as a French percent.
- **`GET /v1/admin/commission-settings/history?limit=`** — audit rows for platform, category and
  seller changes with actor names, target labels (`PLATFORM | CATEGORY | SELLER`) and before → after.

### admin-web

- `lib/commission.ts` (pure, 11 vitest): Decimal(5,4) ↔ percent by string/integer math (no float),
  `formatRatePercent` (« 8,25 % », « 10 % »), `parsePercentInput` (comma or dot, 0–100, ≤ 2 decimals,
  French errors), `describeEffective` (one unambiguous sentence: specific / default + category
  exception / not configured), precedence + history copy.
- **Commissions page** — « Taux par défaut de la plateforme » (rate in force, last change with actor
  and before → after, new-rate input with confirmation « 10 % → 12,5 % »), « Taux par catégorie »
  (add / modify / retirer, each confirmed), « Historique des modifications » (seller rows link to the
  seller page); skeleton / error-with-retry / empty states; API messages surfaced; 409 → drop the
  intent, show the message, reload. No fabricated 10 % when nothing is configured.
- **Seller page « Commission » card** — « Taux appliqué à ce vendeur » / « Taux spécifique du
  vendeur » / « Taux par défaut de la plateforme » side by side, the sentence from `describeEffective`,
  the precedence line, radio « Utiliser le taux par défaut de la plateforme » vs « Taux spécifique à
  ce vendeur » + percent input, confirmation dialog (before → after, "future deliveries only",
  "recorded with your name"), 409 → reload, last change. Link to the Commissions page.

### Runtime verification (2026-09-04, Chrome DevTools MCP, isolated local stack on the dev DB)

Same recipe as PR 3/4. Verified:

1. **Commissions page** loaded: 10 % in force, « Électronique 8 % », empty history.
2. Default rate: `abc` → « Taux invalide … » (no request); `12,5` → dialog « 10 % → 12,5 % » → confirmed
   → 12,5 % in force, « Dernière modification … par Admin Teka (10 % → 12,5 %) », history row.
3. **DB after the change:** both historical earnings still `rate 0.1`, `700 000` / `450 000` centimes
   commission, `updatedAt` 2026-02-27 / 2026-04-12 — untouched.
4. **Seller page (Tech Shop Lubumbashi)**: card showed 12,5 % « Taux par défaut », « Aucun » override,
   « Exception : 1 catégorie a un taux propre ». Radio → specific, `8,25` → dialog « Taux par défaut
   12,5 % → 8,25 % » → confirmed → 8,25 % « Taux spécifique », sentence says category/default no longer
   apply, last change stamped.
5. **Concurrency, before the fix:** curl set 6 %; the stale screen (8,25 %) offered « 8,25 % → 7 % »
   and would have overwritten silently → `expectedPreviousRate` added. **After the fix:** curl set 5 %
   with a matching expectation; the stale screen (6 %) confirmed 7 % → **409** « … modifié entre-temps
   (valeur actuelle : …). Rechargez la page … », dialog closed, card reloaded to 5 %. Curl with a stale
   expectation on the platform default → 409 as well.
6. « Utiliser le taux par défaut » → « Retirer le taux spécifique » → dialog « Le taux spécifique de
   5 % est retiré … » → confirmed → « Aucun », 12,5 % « Taux par défaut » again.
7. Platform default restored to 10 % (curl, matching expectation). History (API + page): six rows —
   PLATFORM 10 % → 12,5 %, SELLER none → 8,25 % → 6 % → 5 % → retiré, PLATFORM 12,5 % → 10 %, all by
   Admin Teka.
8. API validation via curl: `-0.01`, `1.5`, `0.12345`, `"abc"`, `{}`, unknown property → **400** with
   French messages; unknown seller → **404**; unauthenticated → **401** (e2e).
9. Narrow viewport (390 px) of the Commissions page: cards stack, no body overflow.

**Not verified in the browser:** category add / modify / retirer submissions (same code path as the
platform default, dialog + `expectedPreviousRate`, spec-covered), the 409 path on the Commissions page
itself (same handler as the card, curl-proved on the API), a 403 for a non-ADMIN role (no seller
session available — guard is the existing class-level `@Roles('ADMIN')`, 401 e2e-covered).

**Dev DB after QA:** platform default back to 10 %, « Électronique » 8 % unchanged, no seller override;
six extra `admin_audit_logs` rows. **Side effect on the machine:** a `pkill -f dist/src/main` used to
restart the isolated API also stopped the user's watch-mode API on :5050; it was restarted with
`pnpm dev:api` (kill by port from now on).

### Tests

API: `commission.service.spec.ts` **+19** (context read incl. 0 % override and "nothing configured";
set / clear with audit, no-op, boundaries 0 and 1, invalid → 400, 404, conditional-update race → 409;
history resolution; optimistic concurrency mismatch → 409 with no write/audit, normalised match,
omitted → unchanged), `earnings.service.spec.ts` **+2** (two sellers at different effective rates,
identical rounding rule; override removal changes future computations only), `commission.e2e-spec.ts`
**6** (401 contract for every endpoint). Full suite **576 unit / 141 e2e**, type-check clean.
admin-web: `commission.test.ts` **11**, total **31 vitest**; type-check, eslint and production build
clean (32 routes, private `robots.txt`).

### Follow-ups (recorded, out of scope)

- `FINANCE` role exists in `UserRole` but no finance endpoint accepts it; decide whether finance staff
  may edit commissions / process payouts, then widen `@Roles` deliberately.
- The seller-facing clients display `earning.commissionRate` from the snapshot (correct) but do not
  show a seller their *current* effective rate before a sale; a read-only « Votre commission » on
  seller-web/mobile could reuse `getSellerCommission`. Not part of this initiative's contract.
- `apps/api` `HttpExceptionFilter` reports validation errors with `field: "unknown"`; pre-existing.

## PR 6 — Payout notifications in the seller feed + Seller Web / Mobile deep links (`feat/payout-feed-notifications`)

Scope: `apps/api` (feed rows, dedupe, owner-scoped payout detail, one additive enum migration),
`apps/seller-web`, `apps/seller-mobile`. **Schema:** `UserNotificationType` gains `PAYOUT`
(`manual/2026-09-04_user_notification_payout_type.sql`, `ALTER TYPE … ADD VALUE IF NOT EXISTS`,
top-level statement, in `auto-apply.list`; applied twice to the **dev** DB, not to production).
**Dependency:** seller-web gains `vitest` (dev only) like admin-web did in PR 3.

### Fresh audit (2026-09-04, `develop` at `471b2e7`)

- **Persistence.** One per-user feed (`user_notifications`, `UserNotificationService`, every read/write
  scoped by `userId`, mark-read via `updateMany({id, userId})`). Seller feed at `/v1/seller/notifications`.
- **Delivery.** `SellerNotificationService` — product events write the feed row first, then
  `PushService.sendToUser` (FCM, multicast per user) with email fallback when push reaches 0 devices.
  Payout approved / paid / rejected already pushed + emailed **but wrote no feed row**, and their push
  `data.screen = 'earnings'` was routed by neither client (mobile router had no `earnings` case; web
  `hrefFor` fell back to the products list).
- **Trigger points.** `PayoutsService.approve/complete/reject` call the notifier **after** the
  conditional `updateMany` + audit transaction committed; a retried / concurrent call finds `count = 0`
  and throws 409 before any notification (spec-pinned since PR 2). `PROCESSING` notifies nobody.
  `requestPayout` notifies nobody (the seller's own action).
- **Clients.** seller-mobile: `PushController` handles the three tap sources (foreground local-notif
  tap, `onMessageOpenedApp`, `getInitialMessage` post-first-frame) through `NotificationRouter` and
  `router.push`; `sellerRefreshProvider.handlePush` invalidates orders/products only; feed tap handled
  product/order only; the router redirect sent unauthenticated navigations to `/auth/login` and
  login always went to `/` — a cold-start push tap while signed out lost its target. seller-web:
  bell `hrefFor` product/order only; the earnings page had a Virements tab with no URL state; the
  middleware sent protected visits to `/login?redirect=<path>` (query dropped) and the login page
  ignored the param. No seller-side payout detail existed on either client or in the API
  (`GET /v1/sellers/payouts` list only).
- **Action Center.** Both seller action centers are fed by the order/product stats endpoints. No
  payout state is a *required* seller action: a request is voluntary, approval and payment need
  nothing from the seller, and a rejection returns the funds to the balance (re-requesting is
  optional and the reason may call for updating the payout destination first). **Decision: payout
  events stay information / history in the feed; nothing is added to the action centers.**

### Transitions that notify (and why)

| Transition | Seller notification | Rationale |
|---|---|---|
| seller → REQUESTED | none | the seller's own action; the UI confirms it |
| REQUESTED → APPROVED | « Paiement approuvé » — *approuvée, virement en préparation, vous serez informé dès qu'il sera effectué* | sets expectations without ever saying "paid" |
| APPROVED → PROCESSING | none | internal operator step, nothing for the seller |
| APPROVED/PROCESSING → COMPLETED | « Paiement effectué » — *Votre demande de paiement de 900.000 FC a été marquée comme payée.* | the event that matters; reference stays in the payout detail / email |
| REQUESTED/APPROVED → REJECTED | « Demande de paiement refusée » + admin reason + *Le montant est de nouveau disponible sur votre solde.* | the reason is authored for the seller (admin dialog says so); balance note tells them what changed |
| PROCESSING → REJECTED | « Virement échoué » + reason + balance note | a failed transfer is not a refusal (`transition()` now returns `previousStatus`) |

Each = durable feed row (type `PAYOUT`, `entityType 'payout'`, `entityId`) **first**, then push-primary +
email fallback. Push `data` = `{screen:'earnings', event, payoutId}` only — no phone, method, reference,
amount-in-data or email (the amount is in the human body, as the product requires).

### Effectively-once and reliability

- Only a committed conditional transition reaches the notifier (409 otherwise).
- Feed rows use `UserNotificationService.createIfAbsent(user, type, entity, title)`; the title is the
  event, so approved → paid on one payout are two rows while a re-emitted event is not.
- Notification failures never touch the transition: the notifier catches everything and the feed
  write never throws; push failure → email fallback; feed write failure is logged, push still sent.
  The feed row is **not** inside the payout transaction (existing architecture: notifications are
  post-commit, fire-and-forget) — a crash between commit and notify loses the notification (no
  outbox); documented limitation, unchanged from before.

### API

- `GET /v1/sellers/payouts/:id` (SELLER, `UuidParam`) — the deep-link target. Ownership **is** the
  `WHERE`: another seller's id, a deleted id or garbage all answer one French 404 (« Ce virement est
  introuvable ou ne vous appartient pas. »). A payout id from a notification is never trusted.
- Migration `2026-09-04_user_notification_payout_type.sql` (see top). Old mobile builds render an
  unknown type with the default icon and no navigation (verified `default:` branches).

### seller-web

- `lib/payout-notifications.ts` (9 vitest): `hrefForNotification` (payout → `/dashboard/earnings?tab=payouts&payout=<id>`; non-uuid ids never become a path), `parseEarningsQuery` (malformed/stale → defaults), status labels/hints (approval never « payé »; COMPLETED → « Payé »), 404 wording.
- Bell uses it. Earnings page reads the query once on mount, opens Virements and a « Détail du
  virement » card fetched by id through the owner-scoped endpoint (loading / error / Fermer), highlights
  the row, keeps the URL in sync with the tabs.
- `lib/post-login-redirect.ts` (2 vitest) + middleware keeps `path?query` in `redirect`; the login page
  returns to it (internal `/dashboard` paths only; external, `//host`, auth, undecodable → dashboard).

### seller-mobile

- `NotificationRouter`: `earnings` + uuid `payoutId` → `/earnings/payouts/:id`; without / malformed →
  `/earnings?tab=payouts`; `routeForFeedItem` mirrors web; ids must be uuid-shaped; `isTabRoot` → `go`
  (tab switch) vs `push` (detail, back returns). Used by `PushController` and the feed screen.
- `/earnings/payouts/:id` → `PayoutDetailScreen` (`FutureProvider.family` over `getPayout`): loading,
  error with the API's French 404 verbatim + « Réessayer » + « Voir tous mes virements », loaded
  (amount, status badge + hint, destination, dates, reference / reason), `AdaptiveLeading`.
- `/earnings?tab=payouts` → Virements tab (`initialTab`, honoured in `didUpdateWidget` because the
  shell keeps the tab alive).
- Redirect: unauthenticated navigation → `/auth/login?from=<location>`; after login →
  `PostLoginTarget.resolve(from)` (internal, non-auth, non-onboarding paths only). Covers cold-start
  push taps while signed out.
- `sellerRefreshProvider` gains an `earnings` signal (foreground payout push, app resume) → Revenus
  refreshes wallet + payouts. Shared `PayoutStatusUi` vocabulary (tile + detail), PAYOUT feed icon.

### Runtime verification (2026-09-04)

Isolated API on :5051 (cookie domain cleared) for seller-web, the user's watch API on :5050 for the
Android emulator (dev flavor → `10.0.2.2:5050`, bearer tokens). Existing sellers all have real
passwords, so a **throwaway seller fixture** (`qa-pr6-seller@example.test`, approved profile, one
REQUESTED payout of 63.000 FC) was created on the dev DB with Prisma and **deleted after QA** (user,
profile, payout, feed rows; the two `admin_audit_logs` rows for its payout remain — append-only).

- **API, authoritative transitions:** admin `approve` → exactly one `PAYOUT` feed row « Paiement
  approuvé » + dev email fallback; a second `approve` → 409 and **no second row**. `complete` with a
  reference → « Paiement effectué » row; a second `complete` → 409.
- **seller-mobile (Android emulator, API 34, debug APK, driven by adb):** login → dashboard bell « 1 » →
  Notifications shows « Paiement approuvé » with the payments icon → tap → « Détail du virement »
  63.000 FC, « Approuvé — virement en préparation » + hint, destination, date, « Voir tous mes
  virements » → Revenus screen on the **Virements** tab already listing the payout as « Payé » with the
  reference (the completion had happened meanwhile).
- **seller-web (Chrome):** login → bell lists « Paiement effectué » and « Paiement approuvé », each
  linking to `/dashboard/earnings?tab=payouts&payout=<id>` → click → Virements tab with the « Détail du
  virement » card (« Payé », 63.000 FC, hint, destination, reference, « Payé le »), row highlighted.
  Same URL with **another seller's payout id** → « Ce virement est introuvable ou ne vous appartient
  pas. » in the card, list untouched. Middleware (production build, curl): protected visit → 307 to
  `/seller/login?redirect=%2Fdashboard%2Fearnings%3Ftab%3Dpayouts%26payout%3D…` with `noindex`.

**Not verified at runtime:** real FCM push delivery and the three tap sources (foreground / background /
cold start) — the emulator has no registered device token and no push was sent (the email fallback
fired instead); the mobile 404 screen and the signed-out `from` round-trip (unit-tested: router,
`PostLoginTarget`, `PayoutDetailScreen` 404 widget test); iOS simulator (Android only); the
« Virement échoué » rejection copy end-to-end (unit-tested).

### Tests

API `+15`: seller-notification (feed row + copy per transition, no PII in push data, email fallback,
push failure never throws nor loses the row, unknown payout, reason truncation), user-notification
(`createIfAbsent`), payouts (owner-scoped 404, `failedTransfer` variants), e2e 401 — full suite **590
unit / 142 e2e**, type-check clean. seller-web **11 vitest** (new runner), type-check + eslint +
production build clean. seller-mobile **+13 → 128** tests, `flutter analyze` at the 17 pre-existing
infos, no warnings.

### Follow-ups (recorded, out of scope)

- No outbox: a crash between the payout commit and the notifier loses that notification (pre-existing
  pattern for every notification in the API).
- Only the payout vocabulary was aligned across the two seller clients; the order-detail financial
  blocks (earning snapshot, commission line) were not touched.
- The middleware `redirect` return was dead code before this PR (login ignored it) — now live for all
  protected seller-web routes, not only payouts.
- FINANCE role, seller effective-commission display, `field: "unknown"` — unchanged (see PR 5).

## PR 7 — Regression / security / performance review (`feat/initiative-review`)

PR 6 merged as **#650 (`c64f6e4`)**. Pre-implementation audit of what PR 7 was for, against `develop` at `c64f6e4`.

### What PR 7 was meant to do

The plan's line 7 reads « regression/security/performance review ». The initiative brief spells it
out: re-run every suite and gate; review RBAC / ownership, IDOR, DTO whitelisting, CSRF, transaction
boundaries, idempotency / replay, audit logging, sensitive fields in logs / Sentry / PostHog, payout
destination exposure, CSV formula injection, rate limiting; and check for N+1, one-request-per-tile
and aggressive polling. It has no product scope of its own.

### What earlier PRs already satisfied

| Area | Status at `c64f6e4` |
|---|---|
| Defects 1–11 (races, TOCTOU, fire-and-forget earning, forced cancel, return deletes ledger, float math, first-item rate, no actor/audit, PROCESSING, multiple globals) | **Closed by PR 2** (#646), spec-pinned. |
| RBAC / ownership / IDOR | Admin finance endpoints `@Roles('ADMIN')`; seller payouts, earnings, payout detail, notifications all scoped by the owner in the `WHERE` (PR 2, PR 6). |
| DTO validation | Global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` — unknown properties → 400 (verified by curl in PR 5). |
| CSRF | Cookies `httpOnly` + `SameSite=Lax`; cookie auth is only read for the surface named by the `X-Teka-Surface` header (no header → buyer cookie names → an admin cookie is never read), a custom header a cross-site form cannot set; CORS restricted to `CORS_ORIGINS` with credentials. |
| Transactions / idempotency / concurrency | Conditional `updateMany` + audit in one transaction, 409 on retry / race (PR 2, PR 4); optimistic concurrency on commission edits (PR 5); feed-level `createIfAbsent` (PR 6). |
| Audit | `admin_audit_logs` for every payout transition and commission change, actor + before/after (PR 2, PR 5). |
| Sensitive data | API `instrument.ts` `beforeSend`/`beforeBreadcrumb` scrub `+243…` phones; payout push `data` = routing keys only (PR 6, spec-pinned); no PostHog capture references payouts or commissions on admin-web / seller-web; API logs carry ids only. |
| Destination exposure | Admin list/detail expose `payoutPhone` to ADMIN (needed to pay); seller sees only their own; never in push payloads. |
| CSV | `csv.util.ts`: `csvText` quotes formula-looking values with a `'` prefix, `csvNumber` deliberately not (documented); PR 2's report change only added the `REVERSED` status. |
| Rate limiting | Global throttler 100/60 s; auth stricter; payout request additionally serialised by the seller row lock + partial unique index. |
| Performance | Admin payouts list = one query with joins; detail = 4 queries; stats = bounded `Promise.all` of counts (PR 3); commission history = 1 + 3 lookups; no new polling (only the pre-existing 60 s unread-count poll on both bells); mobile refresh coalesced (300 ms). No N+1 found in the code added by PRs 2–6. |

### What is still open from the documented list

- **Defect 12 leftovers** (documented under PR 6's line « parity fixes (labels, method names, rate
  display, Rule 15) » — PR 6 shipped labels and method names only):
  1. seller-web shows an earning's commission as « 0.1% », seller-mobile as « 0% » (fraction rendered
     as a percent);
  2. both clients label every unpaid earning « Disponible », including earnings still inside the
     2-day return window, reserved in an open payout, or reversed;
  3. mobile `request_payout_screen` uses a raw `ScaffoldMessenger` (Rule 15: `showAppSnackbar`);
  4. « 5 000 FC » hard-coded with a space on both clients (money convention is `5.000 FC`).
- **Defect 13** — a cancelled COD order keeps `paymentStatus = PENDING` and its COD `Transaction`
  `PENDING` forever (only an analytics event is emitted). Not a balance issue (no earning exists
  before delivery) but a reporting / transactions-page one. **Changing it changes financial
  meaning** (which terminal payment status a cancellation gets, and whether historical rows are
  backfilled) → recorded as **decision D7, not fixed here**. Proposed: on any cancellation of a COD
  order set `paymentStatus = FAILED` and the COD transaction `FAILED` inside the cancel transaction
  (matches the seed precedent and the existing `payment_failed` analytics event); no backfill.

### Dependencies, apps, schema

Depends on #647–#650 being in `develop` (they are). Apps touched by the remaining scope: `apps/api`
(additive `state` on seller earnings rows so clients label from the source of truth), `seller-web`,
`seller-mobile`. **No schema or migration change.**

### Decision on scope

PR 7 is still necessary as the review and regression record, and to close the four documented
defect-12 leftovers (presentation / parity, API-derived). Nothing else is added: defect 13 waits for
D7; the outbox, FINANCE role, seller commission display and `field: "unknown"` findings stay
follow-ups.

