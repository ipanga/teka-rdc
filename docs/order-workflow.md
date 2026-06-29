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
  admin) and on an **approved return**.

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
  (deletes the not-yet-paid earning; flags if already in a payout) → records a **REFUND** `Transaction`.
  **Reject**: order stays `DELIVERED`, payout proceeds.
- Model: `ReturnRequest` (status `REQUESTED|APPROVED|REJECTED`; `buyerId`/`reviewedById` are plain uuids).

## Financials — commission, payout hold (lazy eligibility)

Single source of truth: `EarningsService` (`apps/api/src/payments/earnings.service.ts`).

- `computeBreakdown(grossCDF, categoryId)` — commission is on the **subtotal** (excludes delivery fee),
  at the primary category's rate (cascade category → global → **10% default**), `Math.round`;
  `net = gross − commission`.
- `createEarning(orderId)` — on delivery, persists a `SellerEarning` snapshot (idempotent). It does
  **not** credit `walletBalanceCDF` — the seller's available balance is **computed lazily on read**.
- **Return-window hold.** An earning is **payout-eligible** only when its order's `deliveredAt + 2 days
  ≤ now` AND the order is not `RETURNED` (and it's unpaid / not in a payout). Until then it's **pending**
  (held). No cron — `eligibleEarningWhere` / `pendingEarningWhere` filter on the order relation at query
  time. `getBalances()` returns `{ availableCDF, pendingCDF, totalEarnedCDF, totalCommissionCDF }`.
- `GET /v1/sellers/wallet` → `{ balanceCDF (=available), availableCDF, pendingCDF, totalEarnedCDF,
  totalCommissionCDF, pendingPayoutCDF }`. Seller earnings UI shows *Solde disponible* + a
  "*+ X en attente (fenêtre de retour de 2 jours)*" line.
- **Payout** (`PayoutsService.requestPayout`) reserves only **eligible** earnings and checks the 5 000 FC
  minimum against the **available** balance; **reject** just unlinks earnings (back to the eligible pool).
  `walletBalanceCDF` is retained on the schema but **non-authoritative**.
- Seller/admin order-detail endpoints still return a `financials` object
  `{ grossCDF, commissionCDF, netCDF, commissionRate, isFinal }` (persisted earning once delivered, else a
  `computeBreakdown` projection).

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

## Surfaces

| Surface | List | Detail | Actions |
|---|---|---|---|
| buyer-web `/commandes` | ✓ | items, totals, address, timeline, payment method+status | cancel ({PENDING,CONFIRMED,PROCESSING}) · **return** (DELIVERED, in-window) |
| seller-web `/dashboard/orders` | ✓ + dashboard status summary | + buyer, **Votre rémunération** | confirm / reject / préparer / **prête pour collecte** |
| admin-web `/dashboard/orders` + `/dashboard/returns` | ✓ | + **Répartition financière**, **Livraison & encaissement** | **reçue par Teka / en livraison / livrée+encaissement**, force-status, cancel, **approve/reject returns** |
| buyer-mobile | ✓ | full (payment, timeline) | cancel · **return** (in-window) |
| seller-mobile | ✓ + home buckets | + **Votre rémunération** | confirm / reject / préparer / **prête pour collecte** |

Seller product lists (web + mobile) show the product **town** (`Product.city`).
