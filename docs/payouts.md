# Seller Payouts & Settlement

Authoritative reference for how sellers earn money and get paid on Teka RDC.
Built in Initiative #3 (Seller Payouts Operationalization, 2026-06-08) and hardened by the
payouts / commission / action-center initiative (2026-09-04, `docs/payouts-commission-action-center.md`
— decisions D1–D7). For the endpoint catalogue see `api-reference.md`; for the wider service map
see `architecture.md`.

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

**Seller-facing state (since PR 7, 2026-09-04).** `GET /v1/sellers/earnings` adds an API-derived
`state` to every row — `REVERSED` → `PAID` → `RESERVED` (in an open payout) → `HELD` (inside the
window, or the order is no longer `DELIVERED`) → `AVAILABLE` — so both seller clients label from the
source of truth (« En attente (retour possible) · Disponible · Réservé (virement en cours) · Payé ·
Annulé »). Older clients ignore the field and keep their `isPaid` split.

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
concurrent call finds `count = 0`, gets a **409** naming the current status (validation failures stay
400), and never re-notifies. `reject` records whether the payout was `PROCESSING` (a failed transfer)
so the seller reads « Virement échoué » rather than « refusée ».

`GET /v1/admin/payouts/:id` returns, on top of the row and its reserved earnings, the operator's
decision context: `balances` (the seller's available / pending / total earned / total commission as
centime strings), `actors` (approved / processing / completed / rejected resolved to id + names),
and `auditTrail` (the payout's `admin_audit_logs`, newest first).

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

`SellerNotificationService` fires after a **committed** admin transition (a retry that finds
`count = 0` threw 409 first and never notifies). Each event writes a durable in-app feed row first
(`UserNotification` type `PAYOUT`, `entityType 'payout'`, `entityId` = payout id, deduplicated by
`createIfAbsent` on user + type + payout + title), then **push primary + email fallback** — money
events, and sellers always have an email. No pref gate (operational notification about the
seller's money). Notification failures never touch the transition; a crash between the commit and
the notifier loses that notification (no outbox — pre-existing pattern for every notification).

| Transition | Seller sees | Why |
|---|---|---|
| seller → `REQUESTED` | nothing | the seller's own action; the UI confirms it |
| `REQUESTED → APPROVED` | « Paiement approuvé » — *approuvée, virement en préparation* | never worded as paid |
| `APPROVED → PROCESSING` | nothing | internal operator step |
| → `COMPLETED` | « Paiement effectué » — *Votre demande de paiement de 63.000 FC a été marquée comme payée.* | the event that matters; the reference lives in the payout detail / email |
| `REQUESTED\|APPROVED → REJECTED` | « Demande de paiement refusée » + the admin reason + *Le montant est de nouveau disponible sur votre solde.* | the reason is authored for the seller (the admin dialog says so) |
| `PROCESSING → REJECTED` | « Virement échoué » + reason + balance note | a failed transfer is not a refusal |

Push `data` carries routing keys only — `{ screen: 'earnings', event: 'payout-approved' |
'payout-paid' | 'payout-rejected' | 'payout-failed', payoutId }` — never the destination phone,
method, reference or email. French email templates: `payout-approved`, `payout-paid` (with
reference), `payout-rejected` (with the full reason).

**Not a seller action.** No payout state requires anything from the seller (a request is
voluntary; approval and payment need nothing; a rejection returns the funds), so payout events
stay information / history in the feed — nothing is added to the seller action centers.

## Surfaces

- **seller-web** `/dashboard/earnings`, **seller-mobile** Revenus tab — wallet, earnings (with the
  API `state` labels and the commission shown as a percent, e.g. « 8,25 % ») + payout history,
  request form (saved destination, « 5.000 FC » minimum + single-pending guards). Payout status
  vocabulary is shared by both clients and never calls an approval a payment: « Demande reçue ·
  Approuvé — virement en préparation · Virement en cours · Payé · Refusé / échec ».
- **Payout detail** — `GET /v1/sellers/payouts/:id` is owner-scoped (another seller's, a deleted or
  a garbage id all answer one French 404). seller-web opens it as a « Détail du virement » card on
  `/dashboard/earnings?tab=payouts&payout=<id>`; seller-mobile as `/earnings/payouts/:id`
  (`/earnings?tab=payouts` opens the Virements tab). A payout id from a notification is a hint,
  never an authorization.
- **Deep links** — the feed bell (web) and the feed screen / push taps (mobile) route `PAYOUT`
  items there. An unauthenticated open survives login on both clients (web: middleware keeps
  `path?query` in `redirect`, login honours internal `/dashboard` paths only; mobile:
  `/auth/login?from=…` → `PostLoginTarget`, internal non-auth paths only). Mobile tab roots are
  reached with `go`, details with `push` (back returns).
- **admin-web** `/dashboard/payouts` — tabs À approuver / À payer / En cours / Payés / Rejetés
  (URL-backed `?status=`), per-state actions only, a confirmation dialog per action (« Marquer
  payé » requires the payment reference; reject requires a 5–500 character reason and reads
  « Transfert échoué » from `PROCESSING`), double-submit lock, 409 → the dialog closes and the
  authoritative state is reloaded; detail drawer with status hint, financial context, snapshotted
  destination, timeline with actors, reserved earnings (clawback flag) and audit history.
- **admin-web** `/dashboard` — « À traiter maintenant » tiles (`/v1/admin/stats.actionCenter`)
  including payouts awaiting review (`REQUESTED`) and awaiting payment (`APPROVED` + `PROCESSING`)
  with amounts, each deep-linking to the filtered queue. Counts and queues share the same `where`
  builders (`admin/admin-queues.ts`), spec-pinned.
- **admin-web** `/dashboard/reports` → "Virements" — payouts CSV for finance
  reconciliation (`GET /v1/admin/reports/payouts[/csv]`, date + sellerId filters).

## Commission administration

Precedence (D3): **seller override → active leaf-category rate → platform default**, resolved at
delivery and snapshotted (see above), so a change only affects orders delivered after it — never a
persisted earning. Fractions are `Decimal(5,4)` (0…1, ≤ 4 decimals = 0,01 % steps); operators type
percentages and the clients convert by integer math; the API re-validates everything.

- Platform default + category rates: `GET/PUT /v1/admin/commission-settings[/:categoryId]`,
  `DELETE /v1/admin/commission-settings/:categoryId`. A single global row is guaranteed (the PR 2
  migration materialised 10 % where none existed).
- Seller override: `GET/PUT/DELETE /v1/admin/sellers/:sellerProfileId/commission` —
  `SellerProfile.commissionRate`, **NULL = follow the category / platform rates, `0` = a real 0 %**.
  `GET` returns the override, the platform default, the effective rate + source (`SELLER` |
  `GLOBAL` | `null` when nothing is configured), how many active category rates could still precede
  the default, and the last audited change.
- **Optimistic concurrency:** every mutation accepts `expectedPreviousRate` (the value the operator
  saw, `null` = none) and answers **409** naming the current value when it differs; omitted →
  previous behaviour (older clients). Unchanged values are no-ops with no audit row.
- Every change writes `admin_audit_logs` in the same transaction
  (`COMMISSION_SETTING_UPSERTED/REMOVED`, `SELLER_COMMISSION_OVERRIDE_SET/CLEARED`);
  `GET /v1/admin/commission-settings/history` lists them with actor and before → after.
- admin-web: `/dashboard/commission` (default in force + last change, category rates, history) and
  the « Commission » card on the seller page (applied / specific / default side by side, radio
  « Utiliser le taux par défaut de la plateforme » vs « Taux spécifique à ce vendeur »).

## Ops runbook — paying a seller

1. Seller requests a payout (seller-web/mobile). Status `REQUESTED`.
2. Finance opens **admin-web → Virements**, reviews amount + seller + destination.
3. **Approve** (`REQUESTED → APPROVED`) — the seller is told the transfer is being prepared, not
   that it is paid. (Reject with a reason to release the funds back to the seller's balance
   instead; from `PROCESSING` the same action reads « Transfert échoué ».)
4. Send the funds out-of-band to the seller's `payoutPhone` via the chosen
   mobile-money operator (or cash). Optionally **Marquer en traitement**
   (`PROCESSING`) while doing so.
5. **Marquer payé** — enter the transfer **reference** (mobile-money transaction
   id / cash slip). Status `COMPLETED`, `processedAt` set, seller notified « Paiement effectué ».
   A second « Marquer payé » (retry, double click, another admin) is refused with 409.
6. Reconcile periodically via **Reports → Virements → Export CSV**.

## Out of scope (decided)

Automated payment-provider disbursement (none exists — COD only), multi-currency
payouts, and a per-order rider cash-reconciliation ledger (the platform-collects
model + the admin approve→mark-paid control point cover launch; a per-order
remittance ledger would be a later phase if rider float becomes a problem).
