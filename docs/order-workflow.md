# Order workflow (buyer / seller / admin × web + mobile)

Authoritative reference for the end-to-end **Teka-managed** order lifecycle. COD-only; extensible.
Teka collects from the seller, delivers to the buyer, collects the cash, holds a 2-day return window,
then pays the seller minus commission. See also `delivery-fees-and-currency.md` (fees + FC),
`payouts.md` (settlement), `push-notifications.md` (FCM), `analytics.md` (PostHog).

## Lifecycle (managed)

```
checkout ─► PENDING ─► CONFIRMED ─► PROCESSING ─► READY_FOR_TEKA_PICKUP ─► RECEIVED_AT_TEKA ─► OUT_FOR_DELIVERY ─► DELIVERED ─► (RETURNED)
              │  seller: confirm / reject / préparer / prête-pour-collecte │   admin (Teka ops): reçue / en livraison / livrée+encaissement
              └─► CANCELLED  (buyer while {PENDING,CONFIRMED,PROCESSING}, or seller "reject")
SHIPPED (legacy, no longer produced) ─► OUT_FOR_DELIVERY | DELIVERED   (so in-flight orders still complete)
```

- **Control transfer (managed model).** The **seller** drives PENDING → READY_FOR_TEKA_PICKUP
  (confirm / reject / préparer / *prête pour collecte*). **Teka/admin** drives everything after:
  `markReceivedAtTeka` → `markOutForDelivery` → `markDelivered`. Sellers no longer ship or deliver.
- **Canonical state machine:** `apps/api/src/orders/order-workflow.constants.ts`
  (`ORDER_STATUS_TRANSITIONS`, `canTransition`, `BUYER_CANCELLABLE_STATUSES`, `RETURN_WINDOW_DAYS=2`,
  `isWithinReturnWindow`). Seller transitions live in `SellerOrdersService`, admin transitions in
  `AdminOrdersService` (validated via `canTransition`; `forceStatusChange` remains a manual escape hatch).
  Every transition writes an `OrderStatusLog` (audit) and fires notifications.
- **Order creation** is atomic (`CheckoutService.checkout()`): one `Order` **per seller** (multi-seller
  cart → multiple orders linked by `checkoutGroupId`), `OrderItem` price snapshots, first `OrderStatusLog`,
  COD `Transaction{provider:COD, PENDING}`, cart cleared. Block-on-no-zone — no partial/unpriceable orders.
- **Stock** is decremented at checkout and **restored on any cancellation** (buyer / seller-reject /
  admin / forced) and on an **approved or forced return** — exactly once per order. See
  "Inventory hold" below.

## Inventory hold — taken once, released once (I1, 2026-10)

Single source: `apps/api/src/orders/order-inventory.ts`.

- **Take (checkout).** Every line is a *conditional* decrement inside the order transaction
  (`quantity >= requested`, product still `ACTIVE`, not deleted), in productId order. A line that
  does not fit rolls back the whole checkout (« Stock insuffisant pour … »); two buyers can never get
  the last unit. The pending COD `Transaction` is created **in the same transaction** as its order.
- **Release.** Only on an order's **first** entry into `CANCELLED` or `RETURNED`, whatever the
  path. The proof is the audit log: every release ever written (before and after this change) wrote
  an `OrderStatusLog` into CANCELLED/RETURNED in the same transaction, so an order whose history
  already has one is never restocked again (`releaseOrderStockHold`). No schema column was needed.
- **CANCELLED and RETURNED are final.** No path — forced included — leaves them, so a released order
  can never look like it holds stock again. To undo a wrong cancellation, the buyer re-orders.
- **Every transition locks the order row first** (`lockOrderForUpdate`, `SELECT … FOR UPDATE`) and
  re-validates against the locked row; the pre-read each service keeps is only a fast path. Racing
  cancellations, fulfillment steps (seller confirm/process/ready, admin received/out/delivered) and
  return reviews therefore have exactly one winner; the losers get the same French 400 a sequential
  retry would. Notifications and analytics fire only after the winning commit.
- **Not cancellable:** DELIVERED (use the return flow), RETURNED, CANCELLED, and any order whose
  payment is `COMPLETED`/`REFUNDED` (a cancelled order must never hide cash — reachable only after a
  legacy forced rewind). Admin may cancel from every pre-delivery status including
  OUT_FOR_DELIVERY/SHIPPED (parcel refused at the door).
- **Legacy rows** are never restocked on a guess: before I1 a forced CANCELLED wrote the log without
  restocking, forced rewinds could leave terminal states, and cancellations served before the
  restock code (commit 4058842, 2026-06-29 — a *commit* date, not a deploy date) restored nothing.
  Such orders are reported, not fixed, by the read-only
  `apps/api/prisma/reports/inventory-hold-candidates.sql`: it takes **verified** rollout instants as
  parameters and classifies any normal-looking cancellation without a verified boundary as
  *unproven*, never as restored; actor/note-based labels are estimates. **Measured once, 2026-10-17**
  (reviewed aggregate SELECT, verified READ ONLY transaction, Codex): **2 cancelled orders / 9 units
  restoration-unproven**, with every rollout boundary unknown — a candidate count, **not proof**
  that stock is missing; no correction was made. Current `Product.quantity` is not evidence of a
  missing or duplicate restore. Any correction is a separate, authorised decision after a physical
  count.
- **Seller stock edits are absolute, guarded by a snapshot.** `PATCH /v1/sellers/products/:id`
  `quantity` *sets* the number. The write is conditional (inside the edit's transaction, first) on
  the stored stock still equalling a snapshot: the optional **`expectedQuantity`** the form was
  loaded with (seller-web and seller-mobile send it), else — installed older clients — the value
  the server read at the start of the same request. A mismatch is a French **409** (« Le stock de ce
  produit a changé pendant votre modification (N disponible(s) maintenant)… ») and rolls back the
  whole edit, characteristics included; both clients then show the current stock and keep the
  other fields, so saving again is a deliberate absolute reset. `quantity === expectedQuantity`
  means "stock not edited" and writes no stock, so a price-only save never clobbers a restock.
  **Limitation:** a client that sends no `expectedQuantity` is protected only within its own
  request — a sale or cancellation between *opening* that old form and saving is still overwritten
  (last write wins).
- **Real-database proof:** `apps/api/test/inventory-concurrency.pg-spec.ts` (opt-in, `pnpm test:pg`,
  local throwaway PostgreSQL only — the guard refuses any other host).

## The `deliveredAt` invariant (2026-09-03)

**`status = DELIVERED` ⇒ `deliveredAt IS NOT NULL`**, for every new write.

`deliveredAt` is not decoration on a delivered order — it is the column every downstream reader treats
as *the* delivery date:

| Reader | Uses it for |
|---|---|
| `isWithinReturnWindow` (`order-workflow.constants.ts`) | the buyer's 2-day return window |
| `EarningsService.eligibleEarningWhere` | payout eligibility (`deliveredAt + 2d ≤ now`) |
| `AdminStatsService` | the delivered-today dashboard count |
| Sales analytics | the time axis for every windowed report |

A DELIVERED order with a NULL `deliveredAt` therefore looks delivered in the UI while being invisible
to every date-windowed query **and** un-returnable by the buyer, since `isWithinReturnWindow(null)`
is `false`.

### The two paths that write DELIVERED

| Path | Route | `deliveredAt` | Side effects |
|---|---|---|---|
| `AdminOrdersService.markDelivered()` | `PATCH /v1/admin/orders/:id/deliver` | set | COD `paymentStatus → COMPLETED`, `unitsSold` incremented, `SellerEarning` created, COD transaction completed, buyer + seller notified, analytics |
| `AdminOrdersService.forceStatusChange()` | `PATCH /v1/admin/orders/:id/status` | **filled only when NULL** | **none** — audit log only |

`forceStatusChange` is an **administrative repair tool, not a delivery workflow.** It bypasses
`canTransition` on purpose and deliberately runs *no* delivery side effects: replaying them would
double-book money and stock on an order that already went through the real flow. Stamping
`deliveredAt` is not a side effect — it is what keeps the row internally consistent — and it only ever
**fills a gap**, never overwrites, so a `DELIVERED → X → DELIVERED` round trip keeps the original
timestamp and does not restart a return window.

> It is reachable from the admin UI: the force-status modal offers « Livrées » among all statuses.

Since I1 (2026-10) the escape hatch can no longer bypass inventory or payment: a forced
**CANCELLED** *is* the admin cancellation (same eligibility, once-only stock release, unpaid COD →
FAILED, `cancelledBy`/`cancellationReason` set, `payment_failed` when flipped); a forced
**RETURNED** is accepted only from DELIVERED and releases the stock once (it still records no
REFUND — that is the return flow's job); and an order in CANCELLED or RETURNED cannot be forced
anywhere.

### Historical rows are left alone

`deliveredAt` was added by `manual/2026-06-29_managed-order-workflow.sql` as a **nullable column with
no backfill**, so any order delivered before that date legitimately has NULL. Those are legacy rows
and **no timestamp is invented for them**. Sales analytics keeps them visible in its unfiltered
summary and reports them as `deliveredWithoutDate` rather than silently dropping them.

Where a reconstruction is ever wanted, the defensible evidence is the `OrderStatusLog` row recording
the transition **into** `DELIVERED` — a real recorded event. That is a separate, deliberate decision;
it is not done automatically.

**Production carried 0 such rows** when assessed read-only on 2026-09-03 (6 DELIVERED, none NULL).

## Buyer cancellation rules

Buyer may self-cancel only **before the parcel enters Teka custody** — `{PENDING, CONFIRMED, PROCESSING}`
(`BUYER_CANCELLABLE_STATUSES`). From READY_FOR_TEKA_PICKUP onward only an admin can cancel.
`POST /v1/orders/:id/cancel`.

## Payment & cash collection (COD)

`paymentStatus` is **separate** from order `status`. At creation it is `PENDING`
(*en attente d'encaissement*) — there is **no fake "paid"**. The Teka delivery agent collects the cash at
delivery, so `AdminOrdersService.markDelivered()` flips it to `COMPLETED` (*encaissé*), stamps
`Order.deliveredAt`, completes the COD `Transaction`, and triggers `EarningsService.createEarning()`.
(Cash collection is combined with delivery for COD; it can be split into a separate admin step later.)

## Returns (2-day window)

- **Buyer requests** `POST /v1/orders/:id/return` — allowed only when the order is `DELIVERED`, owned by
  the buyer, within `deliveredAt + 2 days`, and no active request exists (`ReturnsService.createReturnRequest`).
- **Admin reviews** at `/dashboard/returns` (`GET /v1/admin/returns`, `POST :id/approve|reject`).
  **Approve** (atomic): order → `RETURNED` (+ `returnedAt` + log) → **restock** → `reverseEarning`
  (stamps `reversedAt`/`reversalReason=RETURN_APPROVED` on the earning — never deleted; stamps
  `clawbackRequiredAt` if already reserved in a payout) → records a **REFUND** `Transaction`.
  **Reject**: order stays `DELIVERED`, payout proceeds.
- Model: `ReturnRequest` (status `REQUESTED|APPROVED|REJECTED`; `buyerId`/`reviewedById` are plain uuids).

## Financials — commission, payout hold (lazy eligibility)

Single source of truth: `EarningsService` (`apps/api/src/payments/earnings.service.ts`); full model in
`docs/payouts.md`. Since 2026-09-04 (PR 2 of `docs/payouts-commission-action-center.md`):

- `resolveCommission(sellerProfileId, categoryId)` — seller override → leaf category → global
  (`CommissionNotConfiguredError` when none; no hardcoded rate).
- `computeBreakdown(sellerProfileId, items)` — **per item** on the line totals (delivery fee excluded),
  integer half-up arithmetic; returns totals, an exact-or-blended rate, `commissionSource` and the per-line
  snapshot.
- `createEarning(orderId, tx)` — runs **inside** `markDelivered`'s transaction together with the COD
  `Transaction` completion; persists the earning + per-`OrderItem` commission snapshot. Idempotent.
- **Return-window hold.** Eligible only when `deliveredAt + 2 days ≤ now` AND the order is still
  `DELIVERED` AND `reversedAt IS NULL` AND not reserved. Reversals (return approved, forced exit from
  `DELIVERED`) keep the row and stamp it; reversed rows are excluded from balances, totals, stats and reports.
- `GET /v1/sellers/wallet` → `{ balanceCDF (=available), availableCDF, pendingCDF, totalEarnedCDF,
  totalCommissionCDF, pendingPayoutCDF }` — field names frozen for installed mobile builds.
- `GET /v1/sellers/earnings` rows carry an API-derived `state` (`REVERSED` | `PAID` | `RESERVED` |
  `HELD` | `AVAILABLE`, PR 7) so the clients never infer payability themselves.
- Seller/admin order-detail endpoints return `financials` `{ grossCDF, commissionCDF, netCDF,
  commissionRate, isFinal }` — the persisted earning once delivered, else a per-item projection at today's
  rules (`isFinal:false`; zero commission if unconfigured).
- `forceStatusChange` runs no delivery side effects when forcing **into** `DELIVERED` (use
  `markDelivered`), but forcing **out of** `DELIVERED` reverses the earning (`ORDER_STATUS_FORCED`).

### Cancellation of an unpaid COD order (D7, 2026-09-04)

Every authoritative cancellation path — buyer cancel (before pickup), seller reject, admin cancel,
forced CANCELLED — calls `PaymentsService.failUnpaidCodPayment(orderId, tx)` inside its
cancellation transaction, on the locked row (since I1; it replaced the pre-read
`codPaymentWillFail`/`codPaymentFailureData` pair): a COD order whose `paymentStatus` is still
`PENDING` becomes **`FAILED`** and its COD `PAYMENT` transaction `PENDING`/`PROCESSING` → `FAILED`
(`failureReason: 'order_cancelled'`). The three cancellation transactions run with an explicit 15 s
timeout (the remote dev DB exceeded Prisma's 5 s default once). `FAILED` here means « the
payment did not and will not happen » (no money was collected — no refund is created; `REFUNDED` is
reserved for money that actually moved). A payment already `COMPLETED`, `REFUNDED` or `FAILED`, and
any non-COD order, is never touched; the update is conditional, so a retry or a concurrent
cancellation cannot flip twice. `payment_failed` (PostHog, `distinctId` = buyer) fires exactly when
the flip happened, on all three paths (`actor: buyer | seller | admin`). Status logs, cancellation
reason/actor and stock restoration are unchanged. No earning, commission, balance or payout is
involved: nothing financial exists before delivery.

## Notifications & analytics

- **Notifications** (`OrderNotificationService`):
  - *Buyer* = push (FCM) primary, **email fallback** (Resend) for confirmed / shipped / delivered /
    cancelled; **push-only** for the intermediate managed states (ready / received-at-Teka / out-for-delivery)
    and returns (approved / rejected).
  - *Seller* **new order** = **push + email** (`seller-new-order` template) + **in-app `UserNotification`**
    (type `ORDER`, `entityType:'order'` → deep-links to the order detail). Return-requested = seller in-app + push.
- **Analytics** (PostHog, `distinctId = user.id`): `order_created` / `payment_attempted` (checkout);
  per-transition events incl. `order_ready_for_pickup` / `order_received_at_teka` / `order_out_for_delivery`
  / `order_delivered` + `payment_completed`; `return_requested`.

## Response-shape contract (important)

Order **LIST** endpoints (`/v1/orders`, `/v1/sellers/orders`, `/v1/admin/orders`) return
`{ data: Order[], pagination }`, wrapped once by `ResponseInterceptor` → **`{ success, data: { data,
pagination } }`**. Clients read **`res.data.data`** + **`res.data.pagination`**. Order **DETAIL** endpoints
return the single object at `res.data`.

## Delivery address — snapshot, not the live row (2026-09-01)

`Order.deliveryAddressId` is kept for provenance, but it is **not** the read source. Buyers hold a single
editable address, so reading through the FK meant every edit retroactively rewrote the delivery address of
every past order pointing at that row — production already had two addresses each referenced by more than
one order. Orders now carry their own snapshot (`deliveryLabel`, `deliveryProvince`, `deliveryTown`,
`deliveryNeighborhood`, `deliveryAvenue`, `deliveryReference`, `deliveryRecipientName`,
`deliveryRecipientPhone`), written at checkout — the same thing `OrderItem` already does for
`productTitle`/`unitPriceCDF`.

**The response shape is unchanged.** All three read paths funnel through `resolveDeliveryAddress()`
(`apps/api/src/orders/delivery-address.util.ts`), which serves the snapshot under the existing
`deliveryAddress` key and strips the flat `delivery*` columns. It falls back to the Address relation when
the snapshot is null — orders predating the backfill, and any created during a deploy window while the
previous container was still serving. **Read the snapshot; never join to `addresses` for a historical
value.**

## Surfaces

| Surface | List | Detail | Actions |
|---|---|---|---|
| buyer-web `/commandes` | ✓ | items, totals, address, timeline, payment method+status | cancel ({PENDING,CONFIRMED,PROCESSING}) · **return** (DELIVERED, in-window) |
| seller-web `/dashboard/orders` | ✓ + dashboard status summary | + buyer, **Votre rémunération** | confirm / reject / préparer / **prête pour collecte** |
| admin-web `/dashboard/orders` + `/dashboard/returns` | ✓ | + **Répartition financière**, **Livraison & encaissement** | **reçue par Teka / en livraison / livrée+encaissement**, force-status, cancel, **approve/reject returns** |
| buyer-mobile | ✓ | full (payment, timeline) | cancel · **return** (in-window) |
| seller-mobile | ✓ + home buckets | + **Votre rémunération** | confirm / reject / préparer / **prête pour collecte** |

Seller product lists (web + mobile) show the product **town** (`Product.city`).

## Printable « Bon de livraison » (admin, P1 2026-10)

Admin order detail → **Bon de livraison** opens `/documents/bon-de-livraison/:id` (admin-web), an
A4 preview printed by the browser (Imprimer → Enregistrer en PDF; no PDF library). It is an
**operational delivery document, not a tax invoice**: no invoice number, no tax line, no
registration identifiers — none are verified, none are invented.

- **Access:** the route is outside the dashboard layout (no sidebar/buttons on paper) but gated
  like it — middleware session redirect + `noindex` + `private, no-store`, page-level ADMIN role
  check — and its only data source is `GET /v1/admin/orders/:id` (`@Roles('ADMIN')`, `no-store`).
- **Read-only:** opening or printing writes nothing, allocates no number, never touches the COD
  payment.
- **Order data from snapshots:** item title, charged unit price (`unitPriceCDF`), list-price
  snapshot (`listUnitPriceCDF`, shown « au lieu de » only when higher), line totals, fee, totals
  and the `deliveryAddress` snapshot (incl. recipient name/phone) — never live catalogue prices or
  the buyer's current address. Identity labels (buyer account name/phone, seller business name)
  are the live account values the API serves — no identity snapshot exists. Money via `formatFC`
  (exact BigInt arithmetic on integer centimes).
- **Payment block:** COD unpaid → « Montant à encaisser à la livraison » + total; COD collected →
  « rien à encaisser »; historical non-COD → its own method/status, no cash-due amount.
- **Not issued** for CANCELLED / RETURNED orders, nor for a live COD order whose payment is
  FAILED/REFUNDED: a notice replaces the document and no amount is printed.
- **Print layout:** A4 (14/12/16 mm margins), table header repeated per page, line rows and the
  totals/payment/signature block never split. One seller per order (a multi-seller cart prints
  one document per order). Logic: `apps/admin-web/src/lib/delivery-document.ts`; view:
  `src/components/orders/delivery-document.tsx`; print CSS: `globals.css` `.bdl-*`.

## Order/product navigation & admin visibility (2026-06-30)

- **Order products are clickable** to the product page on **buyer-web** (city-first PDP via `productHref`),
  **buyer-mobile** (`/products/{shortCode}`), and the **admin** order detail (`/dashboard/products/:id`). The
  buyer order-detail items carry a live `product:{ id, slug, shortCode, status, city{slug} }` (snapshots stay
  authoritative); an inactive product shows "· Indisponible", isn't linked, and the order line is preserved.
- **Seller visibility (admin)**: the admin order detail shows the seller (clickable boutique link + contact /
  email / phone) and "Vendu par {seller}" per line; the admin product detail shows full seller info (boutique,
  contact, email, phone, status, rating). Both link to a new **`/dashboard/sellers/[id]`** seller-detail page
  (reuses `GET /v1/admin/users/:id` — no new endpoint).
- **Admin dashboard — Opérations commandes**: managed-workflow counters from `GET /v1/admin/stats` →
  `orderOps{ awaitingConfirmation, readyForPickup, receivedAtTeka, outForDelivery, deliveredToday,
  pendingReturns }`, each card deep-linking to the filtered order/return list (`?status=`).
