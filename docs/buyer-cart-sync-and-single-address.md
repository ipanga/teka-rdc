# Buyer cart sync + single editable address — 🟡 IN PROGRESS

**Started:** 2026-09-01
**Branches/PRs:** #603, #604, #605 (all open into `develop`, none merged)

## Scope

Two reported buyer defects, plus one live defect found while tracing them.

1. **P1** — buyer-mobile cart still showed ordered products until a manual pull-to-refresh.
2. **P2** — no way to edit a delivery address; both clients exposed unbounded multi-address instead of the one current address the product wants.
3. **P3** (found, not reported) — address landmark + recipient phone were broken end-to-end on both clients.

Out of scope, deliberately: seller/admin address behaviour (they keep multi-address), payment model, SEO.

## Root causes

**P1 — client-side only.** The API was never at fault: `checkout.service.ts:289-293` deletes all `CartItem` rows inside the order transaction. But `cartProvider` is a **non-`autoDispose`** StateNotifier that fetches once at construction, `placeOrder()` never touched it, and `POST /v1/checkout` returns no cart (unlike every cart mutation). The cart is also persisted to SharedPreferences with a **30-day TTL**, so stale items survived an app relaunch. buyer-web never had the bug — it does `await clearCart()` before `router.push`.

**P2 — no rule, and no history protection.** `Address` has no `@@unique` on `userId`; `AddressesService.create()` had no cap. `Order.deliveryAddressId` was a bare FK with **no snapshot**, so editing an address rewrites the delivery address of every past order pointing at it. UI was backwards from expectation: **mobile** had a full address book (list/set-default/delete, but no add and no edit); **web** had no address page at all, only create-and-pick inside checkout. Neither client had ever called `PATCH /v1/addresses/:id`.

**P3 — field-name mismatch, both directions.** Clients sent `details`/`phone`; the DTO accepts `reference`/`recipientPhone`. With `forbidNonWhitelisted: true` that is a hard **400**, not a silent drop — masked because both clients omit blank fields, so it only failed once a buyer actually filled in "Point de repère" or "Téléphone du destinataire". Same mismatch on read: the landmark never rendered on mobile, and the recipient phone rendered blank on every buyer-web checkout address and order detail.

## Production measurements (read-only, 2026-09-01)

| | prod | dev |
|---|---|---|
| buyers with >1 active address | **1 of 1** (2 addresses) | 1 of 2 |
| seller addresses | none | 2 (1 each) |
| orders | 9 | 7 |
| addresses reused by >1 order | **2** | 1 |

Both hazards are real in production, which is what justified the snapshot + the archive migration.

## Phases

- [x] **PR #603 — `fix(mobile)`: clear cart on checkout success.** `CartNotifier.onOrderPlaced()` (empty → evict cache → authoritative refetch); `CheckoutNotifier` holds a `Ref` and runs it before flipping to `success`. Deliberately not `clearCart()` (redundant DELETE + rolls back on failure). Covers the idempotent-replay response. **7 tests, 202 → 209.** Verified to fail without the wiring.
- [x] **PR #604 — `fix(api,buyer-mobile,buyer-web)`: address field names.** Both clients aligned to `reference`/`recipientPhone`, read and write. No API change. **8 API + 2 mobile tests.**
- [x] **PR #605 — `feat(api)`: one address per buyer + order snapshot.** Upsert with row lock (buyers only); snapshot columns + `resolveDeliveryAddress()` at all 6 read paths; 2 migrations. **18 tests, 245 → 263.**
- [ ] **PR 4 — `feat(mobile)`: single editable address.** Convert `address_book_screen.dart` into "Mon adresse" (empty → « Ajouter mon adresse »; present → card + « Modifier »). Reuse `_AddAddressSheet` for create + edit, prefilled; lift it out of `checkout_screen.dart` so profile and checkout share one form. Drop set-default/delete/multi-card.
- [ ] **PR 5 — `feat(buyer-web)`: single editable address.** Address section on `/profil` with add/edit; checkout step reduced from a radio list to the current address + edit.
- [ ] **Runtime verification on iOS Simulator** (see below).
- [ ] Close out: STATUS.md + PROGRESS.md.

## Migrations

| File | Applied by | Notes |
|---|---|---|
| `2026-09-01_order_delivery_address_snapshot.sql` | **auto** (in `auto-apply.list`) | Additive + idempotent. Nullable columns, backfill only where NULL. Runs before the rolling swap. |
| `2026-09-01_archive_duplicate_buyer_addresses.sql` | **manual** (`Apply prod migration`) | Data-mutating. Run only after the above is live and the detection query reviewed. Soft delete, BUYER only, reversible. |

**Deploy order:** detection query → #603 (independent) → #604 + #605 (snapshot auto-applies pre-swap) → verify → archive migration by hand → #4/#5.

Mobile UI reaches devices only on the next store build, which is why the one-address rule is enforced server-side.

## Gates

Baseline re-verified green 2026-08-31: API 245 + 118 e2e · buyer-mobile 202 · seller-mobile 42 · buyer-web 63.
Current: **API 263 + 118 · buyer-mobile 209 (#603) / 204 (#604) · buyer-web 63 · `pnpm type-check` clean.**

`flutter analyze` reports **8 pre-existing info-level SDK deprecations** in untouched files (`secure_storage.dart`, `filter_bottom_sheet.dart`, `checkout_screen.dart` `withOpacity`). STATUS.md's "0 issues" claim is stale — these predate this work.

## Open questions / follow-ups

- Removing set-default + delete from the mobile address book is a **user-facing removal of shipped functionality**. It is what the brief asks for, but it is worth a second look at review time.
- `AddressesService.remove()` and `setDefault()` stay on the API (sellers still use them) but become unreachable from buyer surfaces after PR 4.
- The address form lives inside `checkout_screen.dart` as a private widget, so the create payload is not unit-testable today. PR 4 lifts it out — add a widget test for the payload keys then (P3 currently has no client-side regression guard on the write path).
- `addressesProvider` in `checkout_provider.dart` is declared "reusable" but nothing reads it — candidate for deletion in PR 4.
