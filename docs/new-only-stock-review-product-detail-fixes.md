# New-only catalog · stock · reviews · product detail (Jul 2026)

Umbrella tracker for the seven-priority initiative. Per-topic detail lives in
[`product-condition-deprecation.md`](./product-condition-deprecation.md) and
[`review-title-and-editing.md`](./review-title-and-editing.md); this file is the index, the status
board and the deployment/rollback reference.

**Status:** priorities 1–6 shipped to `develop`. Priority 7 (web parity) delivered inside 1–3 and 6.
Runtime regression partially blocked — see [Phase 8](#phase-8--regression-testing).
**Nothing has been merged to `main`.**

## Priorities → PRs

| # | Priority | PR | State |
|---|---|---|---|
| 5 | Product Detail cart icon opened a red error screen | [#581](https://github.com/ipanga/teka-rdc/pull/581) | **merged** |
| 1 | Remove the public New/Used condition | [#582](https://github.com/ipanga/teka-rdc/pull/582) (API/web/seller) + [#585](https://github.com/ipanga/teka-rdc/pull/585) (mobile) | **merged** |
| 2 | Hide exact stock, improve availability | [#583](https://github.com/ipanga/teka-rdc/pull/583) (web) + [#585](https://github.com/ipanga/teka-rdc/pull/585) (mobile) | **merged** |
| 3 | Review title + editing | [#584](https://github.com/ipanga/teka-rdc/pull/584) | **merged** |
| 6 | Normalise discounted price colour | [#586](https://github.com/ipanga/teka-rdc/pull/586) | open |
| 4 | Seller section before ratings/reviews | [#587](https://github.com/ipanga/teka-rdc/pull/587) | open |
| — | Codex commit that preceded the initiative | [#580](https://github.com/ipanga/teka-rdc/pull/580) | **merged** |

`#580` was pre-existing unpushed work found on local `develop`. It was raised as its own PR rather
than built on, because it rewrote the very files priorities 1, 2, 4 and 6 target — and it introduced
the Priority 5 regression, which is why #581 exists.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| `Product.condition` | **Deprecate, not remove** | Column, enum and API field stay; every product is `NEW`; no destructive migration for a presentation change |
| JSON-LD `itemCondition` | **Keep** `NewCondition` | Hiding a badge from humans is no reason to stop telling crawlers what the product is |
| Exact stock quantity | **Internal only** | Still drives the stepper ceiling and every server-side check; buyers see a coarse state |
| Low-stock threshold | **Keep ≤5, centralise** | Pre-existing rule, not invented. One TS constant + one Dart mirror |
| `Review.title` | **Nullable column** | Legacy reviews have none and are never backfilled |
| Review create | **title optional (compat window)** | Old mobile builds cannot send it; a 400 would be unfixable without updating the app |
| Review edit | **title required, update-in-place** | An edit can only come from a title-capable client |
| Moderation on edit | **Status untouched** | No pre-publish queue exists; resetting would let editing launder `HIDDEN` content |
| Price colour | **Unconditional per platform** | Web `text-primary`, mobile `foreground` — each already canonical on its own PDP |
| Seller section (web) | **Unchanged** | Two-column grid already puts it before reviews; moving it would be a redesign |

## What buyers and sellers actually see now

- No **Neuf / Occasion** badge anywhere buyer-facing; no État filter on web or mobile; no condition
  selector for sellers.
- Availability reads **En stock / Stock limité / Rupture de stock** — never a number. The stepper's
  cap message no longer leaks the count either.
- Reviews carry a **title**; buyers can **edit** their own review via `Modifier mon avis`, prefilled.
  Legacy reviews render with no empty title gap.
- The current price is one colour whether or not discounted; the promotion reads through the
  struck-through original, the `-X%` badge and the savings line.
- Seller info sits **immediately before** the ratings it contextualises (mobile).
- The product-detail cart icon opens the Panier tab instead of a red error screen.

## Deployment order

Only Priority 3 has a schema component. Everything else is code-only and order-independent.

1. **Apply** `manual/2026-07-28_review_title.sql` — additive, idempotent
   (`ADD COLUMN IF NOT EXISTS`), safe on its own. Registered in `auto-apply.list`, so `deploy.yml`
   runs it before the rolling swap.
2. **Deploy the API.** `title` accepted (optional on create, required on edit); `PATCH /v1/reviews/:id`
   goes live; specifications flattening and the condition default ship here.
3. **Deploy buyer-web + seller-web + admin-web.**
4. **Release buyer-mobile** (and seller-mobile for the condition selector removal).
5. **Monitor Sentry** for review-write errors, and track the share of creates arriving without a
   title — that ratio is the adoption metric.
6. **Later, only if approved:** make `title` required on create. Full preconditions and the exact
   edits are in `review-title-and-editing.md § Rollout`.

No step breaks the one before it, and 1–4 can be spread over days.

## Rollback

| Change | Rollback |
|---|---|
| Condition deprecation | Revert the commit. No migration, no data change |
| Public stock states | Revert. No API/schema change |
| Review title + editing | Revert both commits; optionally `DROP COLUMN "title"` (loses titles written meanwhile). The API tolerates the column being absent **only** if the code is reverted too |
| Price colour | Revert; two lines return to their conditional form |
| Seller placement | Revert; the block returns to its old position |
| Cart navigation | Revert — but that restores the red error screen, so only revert together with #580 |

Nothing here requires a coordinated client+server rollback except the review title, and even then the
column can be left in place harmlessly.

## Phase 8 — regression testing

### Automated — complete, all green

| Surface | Result |
|---|---|
| Backend API | **243 unit + 118 e2e** |
| buyer-mobile | **190** (192 with both open PRs merged together) |
| seller-mobile | **31** |
| buyer-web / seller-web / admin-web / shared | `type-check` clean, `lint` 0 errors |
| `flutter analyze` | 0 errors, 0 warnings in `lib/` + `test/` on both apps |

Both open PRs (#586, #587) were merged into a scratch branch and the suite re-run — **192 pass**, so
they are compatible with each other and with `develop`.

### Runtime — blocked by the emulator, not by the code

The Android emulator's **DNS resolution is broken**: `ping api.teka.cd` → `unknown host`, and
Android's own `NetworkMonitor` DNS probe times out after 10s. The host resolves the same domain fine
(`curl https://api.teka.cd/...` → 200), so this is the emulator's network stack. Every screen sits in
its loading skeleton, which makes a visual pass meaningless.

**Not attempted, therefore not claimed.** The following still need a working device or emulator:

| Area | What to verify |
|---|---|
| Cart navigation | The icon opens the Panier tab from all eight PDP entry points, no red screen, badge accurate |
| Product detail | Order: description → Caractéristiques → Vendeur → Avis → similaires |
| Stock status | En stock / Stock limité / Rupture de stock, never a number; stepper cap message carries no count |
| Condition | No Neuf badge, no État filter |
| Price colour | Discounted and undiscounted cards render the same price colour |
| Reviews | Create with title; edit → same review updates, no duplicate; legacy review shows no empty title gap |
| Ratings | Average and count update after a rating change, not after a text-only edit |
| Wishlist | Heart fills from a PDP opened via Order Detail (shortCode route) |
| Search · Favorites · Checkout · Notifications · Auth | Unchanged by this initiative, but worth a smoke pass |
| Seller mobile | Product form has no État selector; create + edit still work |

Review **creation and editing cannot be exercised against production** from the owner's personal
account (standing decision). It needs a test account with a delivered order, or a non-production
environment.

## Known gaps and recommendations

1. **The low-stock rule lives in two places** — `LOW_STOCK_THRESHOLD` (TS) and `kLowStockThreshold`
   (Dart) — because a TypeScript constant cannot reach Flutter. The real fix is an API-derived
   `stockStatus` field, after which both copies go. Tagged `TODO(stock-status-server-owned)`.
2. **Review title is absent from JSON-LD.** `Review.name` is a documented schema.org property and
   this is a genuine SEO opportunity.
3. **Comment length caps disagree**: API 1000, buyer-mobile field 500. Mobile is merely stricter, so
   nothing breaks.
4. **`condition` is still on `ProductFilters` and the browse query DTO** — unused by any client.
   Remove at final cleanup, together with the column decision.
5. **Web and mobile price colours differ** (red vs dark). Pre-existing; unifying is a brand decision,
   deliberately not taken inside a normalisation PR.
6. **buyer-web has no component-test harness**, so its review form and card rendering are covered
   only by type-check and manual testing.

## Test-coverage added by this initiative

| Suite | Pins |
|---|---|
| `reviews.service.spec.ts` (+7) | update-in-place, owner-only, status untouched, `productId`/`orderId` unwritable, conditional aggregate recalculation |
| `review-dto.spec.ts` (+7) | title optional on create / required on edit; a supplied title is still length-checked; smuggled `productId` rejected by the real ValidationPipe |
| `browse.service.spec.ts` (+3) | specification flattening, ordering, empty-row drop |
| `public_product_info_test.dart` (+8) | no stock label may contain a digit; threshold boundary; internal fields retained |
| `product_price_color_test.dart` (+2) | discounted and undiscounted price colours are equal; discount still signalled |
| `review_title_test.dart` (+6) | legacy review renders no title line; owner-only edit affordance |
| `commerce_cart_button_test.dart` (+3) | tab opens with no thrown exception; no duplicate Cart stacked |

Several of these exist because the review of #580 found that guarantees from earlier PRs were
protected **only by comments** — and a rewrite is exactly how such a guarantee disappears.
