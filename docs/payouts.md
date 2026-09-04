# Seller Payouts & Settlement

Authoritative reference for how sellers earn money and get paid on Teka RDC.
Built in Initiative #3 (Seller Payouts Operationalization, 2026-06-08). For the
endpoint catalogue see `api-reference.md`; for the wider service map see
`architecture.md`.

## Settlement model — platform-collects (decided 2026-06-08)

Teka is **Cash-on-Delivery only** (no automated payment provider). The
load-bearing question for payouts is *who physically collects the buyer's cash*.
The operator's answer, which this whole system assumes:

> **Teka couriers collect goods from sellers, deliver to buyers, and collect the
> COD cash on Teka's behalf. The platform holds the cash and later settles the
> seller the net (gross − commission).**

So the direction is **platform → seller**: the platform owes the seller money,
and a "payout" moves that money out. (If sellers self-collected the cash this
would be inverted — the platform would instead *collect commission* from
sellers — which is why the seller payout UI was historically disabled until the
model was settled.)

Money is held as **BigInt centimes** end to end (`amountCDF`, `grossAmountCDF`, …);
rates are `Decimal(5,4)`. `SellerProfile.walletBalanceCDF` still exists on the schema but is
**dead** (seed-only, never read) — balances are computed from the ledger.

## How earnings accrue (COD invariant)

An earning exists only once Teka has **delivered** the order and collected the cash:
`AdminOrdersService.markDelivered` calls `EarningsService.createEarning(orderId, tx)` **inside the
delivery transaction** (since 2026-09-04 — a failure rolls the delivery back; before that it was
fire-and-forget). Nothing earlier in the lifecycle creates a withdrawable balance. One `SellerEarning`
per order (idempotent on `orderId`):

- `grossAmountCDF` = Σ `OrderItem.totalCDF` (goods only — **delivery fee excluded**)
- commission is computed **per item** (D5) at the rule resolved for that item, then summed:
  `SellerProfile.commissionRate` (seller override) → active leaf-category `CommissionSetting` →
  active global `CommissionSetting`. **No hardcoded fallback**: without a global setting delivery
  fails with `CommissionNotConfiguredError` (the 2026-09-04 migration guarantees one).
- arithmetic is integer (`payments/commission-math.ts`): rate as ten-thousandths, half-up rounding
  to the centime per line — never floats.
- snapshot at delivery (D4): the earning stores totals + `commissionRate` (exact when every line
  shares one rule, else blended for display) + `commissionSource`; every `OrderItem` stores its own
  `commissionRate / commissionCDF / commissionSource / commissionRuleId`. Changing a rate later never
  touches these rows.

**Reversal (D6).** A returned or forcibly cancelled sale is not deleted: `reverseEarning` stamps
`reversedAt` + `reversalReason` (`RETURN_APPROVED` | `ORDER_STATUS_FORCED`). Reversed rows are excluded
from every balance, total and report. If the earning is already reserved in a payout the row is
stamped `clawbackRequiredAt` instead (the cash is committed — finance settles it by hand).

**Payability.** `available` = window closed (`deliveredAt + 2 days ≤ now`) AND the order is **still
`DELIVERED`** AND not reversed AND not reserved. `pending` = same but inside the window.

## Payout lifecycle (state machine)

`PayoutStatus`: `REQUESTED → APPROVED → PROCESSING → COMPLETED`, with `REJECTED` reachable from
`REQUESTED` / `APPROVED` / `PROCESSING` (D1). **Approve = authorization only; COMPLETED = cash
actually sent** and confirmed with a reference — the seller is told "paid" only then.

```
        ┌──────────── reject (releases earnings) ────────────┐
        ▼                                                    │
   REQUESTED ──approve──► APPROVED ──process──► PROCESSING ──┼─complete──► COMPLETED (terminal)
                            │  └────────── complete ─────────┘
                            └──reject──► REJECTED (terminal)
```

| Transition | Endpoint | Effect |
|---|---|---|
| request | `POST /v1/sellers/payouts` | One transaction: `SELECT … FOR UPDATE` on the seller profile → open-payout check (`REQUESTED`/`APPROVED`/`PROCESSING` block, D2) → eligible earnings read under the lock → ≥ 5 000 FC → destination (body, else profile; snapshotted) → create `REQUESTED` payout for the whole available amount → reserve those earnings (`isPaid=true`, `payoutId`) with a `payoutId IS NULL` guard and a count check. A `payouts_one_open_per_seller` partial unique index backs it; `P2002` → 409. |
| approve | `POST /v1/admin/payouts/:id/approve` | `REQUESTED → APPROVED`; `approvedAt/approvedById`. Notifies (approved). |
| process | `POST /v1/admin/payouts/:id/process` | `APPROVED → PROCESSING`; `processingAt/processingById`. No notification. |
| complete | `POST /v1/admin/payouts/:id/complete` | `APPROVED\|PROCESSING → COMPLETED`; requires `externalReference`; `processedAt/completedById`. **Terminal.** Notifies (paid). |
| reject | `POST /v1/admin/payouts/:id/reject` | `REQUESTED\|APPROVED\|PROCESSING → REJECTED`; `rejectedAt/rejectedById/rejectionReason`; **releases** the earnings (`isPaid=false`, `payoutId=null`) in the same transaction. **Terminal.** Notifies (rejected). |

Every admin transition is a **conditional update** (`updateMany where { id, status ∈ allowed }`)
plus an `admin_audit_logs` row (actor, before/after, reason) in **one transaction**; a retry or a
concurrent call finds `count = 0`, gets a 400 naming the current status, and never re-notifies.

> **No `Transaction{PAYOUT}` row.** `Transaction.orderId` is required, so a payout
> (not tied to one order) isn't written as a transaction. The `Payout` row +
> `externalReference` + the audit trail are the payout ledger.

## Payout destination (reusable)

`SellerProfile.payoutMethod` + `payoutPhone` (nullable; mobile money:
`M_PESA` | `AIRTEL_MONEY` | `ORANGE_MONEY`, phone `+243XXXXXXXXX`). Saved once,
reused on every request.

- `GET /v1/sellers/payout-method` — read (prefill the request form)
- `PATCH /v1/sellers/payout-method` — set/update
- `POST /v1/sellers/payouts` — `payoutMethod`/`payoutPhone` are **optional**;
  they fall back to the saved destination, and the request is rejected if
  neither the body nor the profile has one.

## Notifications (Rule 14)

`SellerNotificationService` fires fire-and-forget on approve / complete / reject.
Unlike other seller events (push-only), payout events use **push primary +
email fallback** — money events, and sellers always have an email. French
templates: `payout-approved`, `payout-paid` (with reference), `payout-rejected`
(with reason). No pref gate (operational notification about the seller's money).

## Surfaces

- **seller-web** `/dashboard/earnings`, **seller-mobile** earnings tab — wallet,
  earnings + payout history, request form (saved destination, min-balance +
  single-pending guards), lifecycle display incl. reference (`COMPLETED`) /
  reason (`REJECTED`).
- **admin-web** `/dashboard/payouts` — approve / reject / process / **mark paid**
  (with reference); seller, method, phone shown so the operator knows who/where.
- **admin-web** `/dashboard/reports` → "Virements" — payouts CSV for finance
  reconciliation (`GET /v1/admin/reports/payouts[/csv]`, date + sellerId filters).

## Ops runbook — paying a seller

1. Seller requests a payout (seller-web/mobile). Status `REQUESTED`.
2. Finance opens **admin-web → Virements**, reviews amount + seller + destination.
3. **Approve** (`REQUESTED → APPROVED`). (Reject with a reason to refund the
   seller's wallet instead.)
4. Send the funds out-of-band to the seller's `payoutPhone` via the chosen
   mobile-money operator (or cash). Optionally **Marquer en traitement**
   (`PROCESSING`) while doing so.
5. **Marquer payé** — enter the transfer **reference** (mobile-money transaction
   id / cash slip). Status `COMPLETED`, `processedAt` set, seller notified.
6. Reconcile periodically via **Reports → Virements → Export CSV**.

## Out of scope (decided)

Automated payment-provider disbursement (none exists — COD only), multi-currency
payouts, and a per-order rider cash-reconciliation ledger (the platform-collects
model + the admin approve→mark-paid control point cover launch; a per-order
remittance ledger would be a later phase if rider float becomes a problem).
