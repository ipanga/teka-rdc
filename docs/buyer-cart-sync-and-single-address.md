# Buyer cart sync + single editable address — ✅ MERGED TO `develop` 2026-09-01

**Started:** 2026-09-01
**Merged into `develop`:** #603, #604, #605, #607, #608 (+ #606, this doc). **Not on `main`** — production is unchanged until a `develop → main` release PR.

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
- [x] **PR #607 — `feat(mobile)`: single editable address.** Convert `address_book_screen.dart` into "Mon adresse" (empty → « Ajouter mon adresse »; present → card + « Modifier »). Reuse `_AddAddressSheet` for create + edit, prefilled; lift it out of `checkout_screen.dart` so profile and checkout share one form. Drop set-default/delete/multi-card.
- [x] **PR #608 — `feat(buyer-web)`: single editable address.** Address section on `/profil` with add/edit; checkout step reduced from a radio list to the current address + edit.
- [x] **Runtime verification** — live API end-to-end done; iOS Simulator tap-through blocked (see above).
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

## Verification performed (2026-09-01)

### Live, against a running API + the dev database

All five PRs merged into a local `verify/integration` branch first: **buyer-mobile 218 · API 271 + 118 e2e · `flutter analyze` 7 · `pnpm type-check` clean.** They compose without conflict.

Then exercised end-to-end with a real buyer session (mock WhatsApp OTP):

| Check | Result |
|---|---|
| `POST /v1/addresses` with legacy `details` | **400** — `property details should not exist` |
| `POST` with `reference` + `recipientPhone` | Accepted and persisted |
| `POST` a second time | **Upserted the same row id**; address count stayed **1** |
| Cart after `POST /v1/checkout` | `totalItems: 0` |
| Address edited Lubumbashi → Kolwezi | Existing order still reads `Lubumbashi / Av. Lumumba 24` — **snapshot held** |

The last row is the data-integrity guarantee behind the snapshot migration, demonstrated rather than argued.

### iOS Simulator — partial

buyer-mobile **builds and runs** on iPhone 16 Pro / iOS 18.0 against the local API (dev flavor, `API_BASE_URL` overridden to `http://localhost:5050/api` — the committed `10.0.2.2` is the *Android* emulator alias and does not resolve on iOS). Screenshot confirms the French town picker rendering live API data.

**A tap-driven walkthrough was NOT performed.** No UI automation is available in this environment: `osascript` is denied assistive access, `idb` and `cliclick` are not installed, and the repo has no `integration_test/` harness. So the on-device sequence *place order → cart empties without pull-to-refresh → badge correct → navigate away and back → relaunch* is **unverified on a device**. What stands in for it: the `ProviderContainer` test in `test/cart/cart_clear_after_order_test.dart`, which drives the real `CheckoutNotifier` → `cartProvider` transition and was confirmed to fail (`Expected: empty, Actual: [CartItemModel]`) with only the `onOrderPlaced()` call removed.

To close this gap, either grant Accessibility permission to the terminal (enables `osascript` taps) or add an `integration_test/` suite.

## Pre-existing problems found (not caused by this work)

1. **The dev DB was missing `users.deletionRequestedAt`** — buyer login 500s with a Prisma error. `2026-07-24_account_deletion_pending.sql` is in `auto-apply.list` but had never been applied to dev. Applied it (idempotent, additive) to unblock local verification.
2. **The dev DB has significant schema drift.** `prisma migrate diff` shows `pnpm db:push` would **DROP** `products.search_vector`, `products_title_trgm_idx`, `search_synonyms_terms_idx` and three foreign keys — search infrastructure created by manual SQL that `schema.prisma` does not model. **Do not run `pnpm db:push` against dev.** Not run here.
3. **`flutter analyze` is not at 0 issues** (STATUS.md claimed it was): 8 pre-existing info-level SDK deprecations, now 7 after this work removed one `withOpacity` call.

## Caught at review / CI (2026-09-01)

Two defects in my own PRs, found after opening them:

1. **`unused_import` warning failed CI on #607.** Lifting the address form out of `checkout_screen.dart` orphaned *both* city model imports; I removed only `commune_model`. Reading `flutter analyze` by its tail and its total count (8 → 7), I took the remainder for the pre-existing infos — but one was a new **warning**, and CI runs `flutter analyze --no-fatal-infos`, which tolerates infos and fails on warnings. Now 6 issues, all infos. **Lesson: read analyze output by severity, not by count.**
2. **buyer-web would not re-price delivery after an address edit.** The quote effect keys on the address *id*, which was correct when the only way to change address was picking a different one. With one editable address an edit keeps the same id, so changing town would not re-quote — the buyer could be shown, and charged, a stale fee. Fixed with a revision counter in the effect deps. buyer-mobile already handled this (`clearDeliveryFee` + `_fetchQuote`); the web lacked the parity.

Neither was caught by the test suites: the first is analyzer-only, the second needs a quote-refetch assertion buyer-web does not have.

## Open questions / follow-ups

- Removing set-default + delete from the mobile address book is a **user-facing removal of shipped functionality**. It is what the brief asks for, but it is worth a second look at review time.
- `AddressesService.remove()` and `setDefault()` stay on the API (sellers still use them) but become unreachable from buyer surfaces after PR 4.
- The address form lives inside `checkout_screen.dart` as a private widget, so the create payload is not unit-testable today. PR 4 lifts it out — add a widget test for the payload keys then (P3 currently has no client-side regression guard on the write path).
- `addressesProvider` in `checkout_provider.dart` is declared "reusable" but nothing reads it — candidate for deletion in PR 4.
