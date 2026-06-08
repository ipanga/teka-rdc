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

Money is held as **BigInt centimes** end to end (`amountCDF`, `walletBalanceCDF`).

## How earnings accrue

On delivery (`SellerOrdersService.deliverOrder`, fire-and-forget):
`EarningsService.createEarning(orderId)` writes one `SellerEarning`
(idempotent, keyed on `orderId`):

- `grossAmountCDF` = `order.subtotalCDF` (goods only — **delivery fee excluded**)
- `commissionRate` = category-specific `CommissionSetting` → global setting → 10% default
- `commissionCDF` = round(gross × rate); `netAmountCDF` = gross − commission
- `SellerProfile.walletBalanceCDF` is incremented by the net

## Payout lifecycle (state machine)

`PayoutStatus`: `REQUESTED → APPROVED → PROCESSING → COMPLETED`, with `REJECTED`
reachable from `REQUESTED`/`APPROVED`.

```
                 reject (restores wallet+earnings)
        ┌──────────────────────────────┐
        ▼                              │
   REQUESTED ──approve──► APPROVED ──process──► PROCESSING ──complete──► COMPLETED
                            │  └──────────────complete───────────────►   (terminal)
                            └──reject──► REJECTED
```

| Transition | Endpoint | Effect |
|---|---|---|
| request | `POST /v1/sellers/payouts` | Creates `REQUESTED` payout for the full wallet balance; marks all unpaid earnings `isPaid=true` + links `payoutId`; **decrements** the wallet. Guards: ≥ 5 000 CDF, one pending payout at a time, a destination must be set. |
| approve | `POST /v1/admin/payouts/:id/approve` | `REQUESTED → APPROVED`; records `approvedAt`/`approvedById`. |
| process | `POST /v1/admin/payouts/:id/process` | `APPROVED → PROCESSING` (optional — operator started the transfer). |
| complete | `POST /v1/admin/payouts/:id/complete` | `APPROVED\|PROCESSING → COMPLETED`; requires `externalReference`; sets `processedAt`. **Terminal.** |
| reject | `POST /v1/admin/payouts/:id/reject` | `REQUESTED\|APPROVED → REJECTED`; **restores** earnings (`isPaid=false`, `payoutId=null`) and **re-credits** the wallet. |

**Wallet integrity:** the wallet is debited at *request* time and the earnings
linked to the payout; only `reject` reverses that. `complete` does **not** touch
the wallet/earnings — it only flips the payout to its final state. There is no
automated provider: completion is a **manual mark-paid** with a transfer
reference (e.g. an M-Pesa transaction id), and the admin approve→complete step
is the finance control point (mark paid only once the cash is actually sent).

> **No `Transaction{PAYOUT}` row.** `Transaction.orderId` is required, so a payout
> (not tied to one order) isn't written as a transaction. The `Payout` row +
> `externalReference` are the payout ledger.

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
