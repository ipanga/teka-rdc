# Review titles + review editing (2026-07-28)

Reviews had a rating and an optional free-text comment. Buyers now also give a short **title**, and
can **edit** a review they already left instead of being stuck with it — previously the only remedy
was delete-and-rewrite, which loses the review's place and its created date.

## Data model

`Review.title` is **nullable**.

```prisma
rating    Int
title     String?      // nullable — legacy reviews have none
text      String?
status    ReviewStatus @default(ACTIVE)
```

Nullable serves two populations, not one: reviews written **before** 2026-07-28, and reviews created
**during the compatibility window** by a mobile build that predates the field (see
[Rollout](#rollout--backward-compatible-by-design)). Neither is ever backfilled — inventing a title
for someone else's review would put words in a buyer's mouth.

Migration `manual/2026-07-28_review_title.sql`:

- **additive** — `ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "title" TEXT`
- **idempotent** — safe to re-run
- **safe to apply before the API that writes it** — old code simply never sets the column
- registered in `auto-apply.list`, so `deploy.yml` runs it before the rolling swap
- no backfill, no default, no data migration

## Rollout — backward compatible by design

`title` is **optional on create, required on edit**. That asymmetry is the whole compatibility
story:

| | Server rule | Why |
|---|---|---|
| `POST /v1/reviews` | title **optional** | Mobile builds already on buyers' phones know nothing about the field. Rejecting them would 400 a review the buyer cannot fix without updating the app. |
| `PATCH /v1/reviews/:id` | title **required** | An edit can only come from a client new enough to offer the field, so there is no legacy case to protect. |
| buyer-web + buyer-mobile | title **required** | Both validate before submitting; no new client can create a title-less review. |

When a legacy request arrives without the field, the review is stored with **`title = null`** — the
same state as a pre-2026-07-28 review, and it renders the same way. The server **never invents a
title**: a fabricated one would put words in the buyer's mouth and would be indistinguishable from a
real one afterwards.

Absence is tolerated; rubbish is not. A title that *is* supplied is still validated (5–100 chars),
on create as well as edit.

### Sequence

1. **Apply the additive migration** (`manual/2026-07-28_review_title.sql`). Column exists, nothing
   writes it, no behaviour change. Safe on its own.
2. **Deploy the backward-compatible API.** New endpoint live; old clients keep posting successfully
   (title stored null); new clients send a title.
3. **Deploy buyer-web.** Title field + edit flow live on the web immediately.
4. **Release buyer-mobile.** Title field + edit flow reach phones as users update.
5. **Monitor.** Watch Sentry for review-write errors and track how many creates arrive without a
   title — that ratio *is* the adoption metric for step 6.
6. **Only later, and only if approved: tighten the API.** Make `title` required on create once the
   updated app has sufficient adoption or a forced-update mechanism is live.

Every step is independently safe, and steps 1–4 can be spread over days without a broken window.

### The later cleanup step (not now)

Making `title` strictly required server-side means:

- flip `@IsOptional()` off in `CreateReviewDto` and make the field non-optional,
- drop the `?? null` fallback in `ReviewsService.createReview`,
- update `review-dto.spec.ts` — the "accepts a legacy request with NO title" spec becomes the
  opposite assertion, which is the signal that the compatibility window has closed.

**Preconditions:** confirmed adoption of the title-capable mobile build (or a live forced-update
mechanism), and an explicit decision to accept that older builds can no longer post reviews. The
column stays nullable regardless — legacy rows keep their `null`.

### Rollback

`DROP COLUMN "title"` (loses titles written meanwhile) plus reverting the code. The API tolerates the
column being absent only if the code is reverted too.

## Editing

`PATCH /v1/reviews/:id` — **updates in place, never inserts.** The row is located by id and guarded
by ownership; `@@unique([buyerId, productId])` would reject a duplicate anyway, so the guarantee is
intentional rather than incidental.

Three decisions, each a security boundary:

**1. `UpdateReviewDto` is not `PartialType(CreateReviewDto)`.** `productId` and `orderId` are omitted
entirely. Letting an edit re-point a review at another product or order would bypass the
delivered-purchase eligibility check. A spec asserts they stay unwritten even when smuggled past the
DTO.

**2. Eligibility is not re-evaluated on edit.** It ran at creation and the link is now immutable per
(1). Re-running `canReview()` would in fact reject **every** edit, because it reports
`ALREADY_REVIEWED` once a review exists.

**3. Moderation status is untouched.** Preserved deliberately — see below.

Aggregates (`Product.avgRating`, `SellerProfile.avgRating`) are recalculated **only when the rating
changed**. Fixing a typo no longer triggers a product- and seller-wide recount.

## Moderation behaviour — unchanged

Teka has **no pre-publish moderation queue**. `ReviewStatus` is `{ ACTIVE, HIDDEN }` and reviews are
created `ACTIVE`; moderation is reactive — an admin sets `HIDDEN` after the fact.

Therefore an edit **does not** re-enter moderation, and **must not** reset status:

- An `ACTIVE` review stays `ACTIVE` — no re-approval, because there is no approval step to return to.
- A `HIDDEN` review **stays `HIDDEN`**. If an edit flipped it back to `ACTIVE`, editing would become
  a laundering route for moderated content: post something abusive, get hidden, edit, be visible
  again.
- `HIDDEN` reviews are never returned publicly (`getProductReviews` filters on
  `status: ACTIVE, deletedAt: null`), so a hidden review the buyer edits stays invisible to everyone
  else.

This matches the instruction to preserve current moderation behaviour unless the implementation
explicitly required re-moderation. It does not.

## Visibility — one predicate for the list, the count and the average (2026-09-06)

A review **exists for buyers** if and only if `deletedAt IS NULL AND status = ACTIVE`. That predicate
lives once, as `VISIBLE_REVIEW_WHERE` in `apps/api/src/reviews/review-visibility.ts`, and every read
and every recalculation spreads it:

| Surface | Reads / recalculates with | Consequence |
|---|---|---|
| `GET /v1/reviews/products/:id` (list + `meta.total`) | `VISIBLE_REVIEW_WHERE` | a hidden or deleted review is neither listed nor counted |
| `GET /v1/reviews/products/:id/stats` (avg, total, distribution) | `VISIBLE_REVIEW_WHERE` | same set as the list, so « N avis » = the rows a buyer can page through |
| `Product.avgRating` / `Product.totalReviews`, `SellerProfile.avgRating` / `totalReviews` (denormalised caches shown on cards, PDP header, seller page) | recalculated with `VISIBLE_REVIEW_WHERE` on **every** mutation: buyer create / rating edit / delete, admin hide / unhide / delete | a moderation action moves the review out of the count and the average at the same moment it leaves the list |
| Admin moderation list (`AdminReviewsService.listReviews`) | `deletedAt: null` only, `status` filterable | deliberately shows `HIDDEN` rows so they can be unhidden |

States and what they contribute to:

| State | Public list | Count / average | Admin list |
|---|---|---|---|
| `ACTIVE`, not deleted | yes | yes | yes |
| `HIDDEN`, not deleted | no | no | yes |
| deleted (`deletedAt` set), any status | no | no | no |

Two things that can still make « counted but invisible » **appear**, neither of which is a rule
divergence: (1) the denormalised caches are only recalculated on mutation, so anything that writes
reviews without going through the services (the seed, a manual SQL fix) must recalculate them — the
dev seed hand-writes `SellerProfile.totalReviews` and drifted (stored 2, live 3); (2) on a database
missing the `reviews.title` column (dev before `2026-07-28_review_title.sql` was applied) the list and
stats endpoints 500 while the cached `Product.totalReviews` still renders on cards. Pinned by
`reviews.service.spec.ts` (« Review visibility »), `admin-reviews.service.spec.ts` and
`test/reviews-authz.e2e-spec.ts`.

## Validation — identical across the three layers

| | Rule | French message |
|---|---|---|
| `title` | **clients: required.** API: required on edit, optional on create during the compatibility window. 5–100 chars when present, trimmed | `Le titre doit contenir au moins 5 caractères` / `Le titre ne peut pas dépasser 100 caractères` |
| `text` | optional, ≤1000 chars, trimmed; empty stored as `null` | `Le texte ne peut pas dépasser 1000 caractères` |
| `rating` | required, integer 1–5 | `La note minimum est 1` / `La note maximum est 5` |

The limits are duplicated in three places — `create-review.dto.ts` / `update-review.dto.ts`,
buyer-web's `TITLE_MIN`/`TITLE_MAX`, and buyer-mobile's `kReviewTitleMin`/`kReviewTitleMax`. The two
client constants exist because a TypeScript constant cannot reach Flutter. **Keep the three in
sync**; each carries a comment saying so.

> Note the comment limit differs by surface today: the API accepts 1000 characters while
> buyer-mobile's comment field caps input at 500 (`maxLength: 500`, pre-existing). Mobile is simply
> stricter, so nothing breaks — worth aligning at some point.

## Reviews with `title = null`

Two ways to get one: written before 2026-07-28, or created during the compatibility window by an old
mobile build. Both render identically — the clients show **nothing at all** where the title would
sit, not an empty line and not a placeholder:

- buyer-web: `{review.title && <p …>}`
- buyer-mobile: `if (review.title != null && review.title!.isNotEmpty) …`

Pinned by tests on both sides.

## Files changed

| Layer | File |
|---|---|
| Schema | `apps/api/prisma/schema.prisma` |
| Migration | `apps/api/prisma/migrations/manual/2026-07-28_review_title.sql` + `auto-apply.list` |
| API | `dto/create-review.dto.ts`, **new** `dto/update-review.dto.ts`, `reviews.service.ts`, `reviews.controller.ts` |
| buyer-web | `lib/types.ts`, `components/product-reviews.tsx` |
| buyer-mobile | `data/models/review_model.dart`, `data/reviews_repository.dart`, `presentation/providers/reviews_provider.dart`, `presentation/widgets/review_form_dialog.dart`, `presentation/widgets/review_tile.dart`, `presentation/screens/product_reviews_screen.dart` |
| Tests | `reviews.service.spec.ts` (+7), **new** `test/reviews/review_title_test.dart` (+6) |

## Tests

API **236 unit** (was 229) **+ 118 e2e**; buyer-mobile **170**; buyer-web type-check + lint clean.

| Scenario | Where |
|---|---|
| Create with rating + title + comment | API DTO validation + mobile/web forms |
| Edit title only / comment only | `updateReview` specs (update-in-place, trimming) |
| Edit rating → aggregates recalculated | `recalculates aggregates only when the rating actually changed` |
| Text-only edit → **no** recalculation | same spec |
| `productId`/`orderId` cannot be changed | `does not let an edit re-point productId or orderId` |
| Another buyer cannot edit | `refuses to edit another buyer's review` |
| Missing / soft-deleted review → 404 | `404s on a missing or soft-deleted review` |
| Moderation status untouched | `never touches moderation status — a HIDDEN review stays hidden` |
| Legacy review renders with no title gap | `review_title_test.dart` (mobile) |
| Edit affordance is owner-only | `review_title_test.dart` (mobile) |

**Not covered by automation:** the end-to-end create→edit round trip against a live API, and the
buyer-web form itself (buyer-web has no component-test harness). Those need the emulator/browser pass.

## Not done / follow-ups

- **Emulator + browser pass** — create a review, edit it, confirm the list updates and no duplicate
  appears; confirm a legacy review still renders. Requires a delivered order on a test account, and
  is blocked by the same policy as D2: no review writes against production from a personal account.
- The PDP's inline reviews section on buyer-mobile lives in `product_detail_screen.dart`, rewritten by
  the unreviewed **#580**. It needed no change here (it renders `ReviewTile`, which is updated), but
  verify it after #580 lands.
- Align the mobile comment cap (500) with the API's (1000).
- `title` is not exposed in JSON-LD `Review` structured data yet — a genuine SEO opportunity, since
  `Review.name` is a documented schema.org property.
