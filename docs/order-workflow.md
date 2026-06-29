# Order workflow (buyer / seller / admin × web + mobile)

Authoritative reference for the end-to-end order lifecycle. COD-only; extensible.
See also `delivery-fees-and-currency.md` (fees + FC), `payouts.md` (settlement),
`push-notifications.md` (FCM), `analytics.md` (PostHog).

## Lifecycle

```
checkout ──► PENDING ──► CONFIRMED ──► PROCESSING ──► SHIPPED ──► OUT_FOR_DELIVERY ──► DELIVERED
                │                                                                          │
                └────────────────► CANCELLED  (buyer while PENDING, or seller "reject")    └─► RETURNED
```

- **Order creation** is atomic. `CheckoutService.checkout()` runs one `$transaction`
  that creates an `Order` **per seller** (multi-seller cart → multiple orders linked
  by `checkoutGroupId`), nested `OrderItem`s (price snapshots), the first
  `OrderStatusLog`, a COD `Transaction{provider:COD, PENDING}`, and clears the cart.
  If a seller's town has **no delivery zone** to the buyer, the whole txn rolls back
  (block-on-no-zone — never create an order we can't price). No partial orders.
- **Status transitions** are a server-side state machine in
  `SellerOrdersService` (`validateTransition`), each writing an `OrderStatusLog`
  (audit trail) and firing a buyer notification.

## Payment (COD)

`paymentStatus` is a **separate field** from order `status`. At creation it is
`PENDING` — there is **no fake "paid"**. On `markDelivered()` (cash collected) it
flips to `COMPLETED`, which then triggers `EarningsService.createEarning()`.
`PaymentMethod.MOBILE_MONEY` / `PaymentStatus` values other than PENDING/COMPLETED
remain only for historical rows.

## Financials (commission / payout)

Single source of truth: `EarningsService` (`apps/api/src/payments/earnings.service.ts`).

- `computeBreakdown(grossCDF, categoryId)` — commission is on the **subtotal**
  (excludes delivery fee), at the primary category's rate (cascade
  category → global → **10% default**), `Math.round`; `net = gross − commission`.
- `createEarning(orderId)` — on delivery, persists a `SellerEarning`
  (gross/commission/net/rate snapshot, idempotent) and credits the seller wallet
  by **net** atomically.
- The seller/admin order-detail endpoints return a `financials` object
  `{ grossCDF, commissionCDF, netCDF, commissionRate, isFinal }`: the persisted
  earning once delivered (`isFinal:true`), otherwise a **projection** via
  `computeBreakdown`. Seller sees "Montant à recevoir"; admin sees the same plus
  the commission as platform revenue.

## Notifications & analytics

- **Notifications** (`OrderNotificationService`): buyer = push (FCM) primary,
  **email fallback** (Resend templates `order-confirmed/shipped/delivered/cancelled`,
  `payment-confirmed`) when no active device token; seller = push. Events:
  placed / confirmed / shipped / delivered / cancelled.
- **Analytics** (PostHog, `distinctId = user.id`): `order_created` +
  `payment_attempted` (checkout); status changes + `payment_completed`
  (`SellerOrdersService.trackOrderStatus`).

## Response-shape contract (important)

The order **LIST** endpoints (`/v1/orders`, `/v1/sellers/orders`,
`/v1/admin/orders`) return `{ data: Order[], pagination }`, which the global
`ResponseInterceptor` wraps once → **`{ success, data: { data, pagination } }`**.
Clients must read **`res.data.data`** + **`res.data.pagination`**. Order **DETAIL**
endpoints return the single object at `res.data`. (A mismatch here was the
2026-06-29 "orders don't appear" bug — see `PROGRESS.md`.)

## Surfaces

| Surface | List | Detail | Actions |
|---|---|---|---|
| buyer-web `/commandes` | ✓ | items, totals, address, timeline, payment method+status | cancel (PENDING) |
| seller-web `/dashboard/orders` | ✓ | + buyer, **Votre rémunération** | confirm/reject/process/ship/out-for-delivery/deliver |
| admin-web `/dashboard/orders` | ✓ | + **Répartition financière** | view |
| buyer-mobile | ✓ | full (payment method + status, timeline) | cancel (PENDING) |
| seller-mobile | ✓ | + **Votre rémunération** | full status state machine |
