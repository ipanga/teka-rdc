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

Nullable is a **compatibility affordance, not a loophole**: the API requires a title for new *and*
edited reviews. Only reviews written before 2026-07-28 lack one, and they are never backfilled —
inventing a title for someone else's review would put words in a buyer's mouth.

Migration `manual/2026-07-28_review_title.sql`:

- **additive** — `ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "title" TEXT`
- **idempotent** — safe to re-run
- **safe to apply before the API that writes it** — old code simply never sets the column
- registered in `auto-apply.list`, so `deploy.yml` runs it before the rolling swap
- no backfill, no default, no data migration

## Deployment order

**migration → API → clients.**

Each step is independently safe:

| Step | If it lands alone |
|---|---|
| Migration | Column exists, nothing writes it. No behaviour change. |
| API | Accepts + returns `title`; `PATCH /v1/reviews/:id` goes live. Old clients keep POSTing without a title… |
| Clients | …**except** they can't: `title` is required on create. See the caveat below. |

> **Caveat worth planning around.** Making `title` required on `POST /v1/reviews` means an
> **in-the-wild mobile build that does not send it will get a 400** once the API ships. That is a
> deliberate trade (a title-less new review defeats the feature), but it means the client release
> should follow the API promptly, and a forced-update prompt is worth considering if adoption of the
> new build is slow. Reading reviews is unaffected; only *writing* one from an old build breaks.

Rollback: `DROP COLUMN "title"` (loses titles written in the meantime) plus reverting the code. The
API tolerates the column being absent only if the code is reverted too — the DTO requires it.

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

## Validation — identical across the three layers

| | Rule | French message |
|---|---|---|
| `title` | required (create + edit), 5–100 chars, trimmed | `Le titre doit contenir au moins 5 caractères` / `Le titre ne peut pas dépasser 100 caractères` |
| `text` | optional, ≤1000 chars, trimmed; empty stored as `null` | `Le texte ne peut pas dépasser 1000 caractères` |
| `rating` | required, integer 1–5 | `La note minimum est 1` / `La note maximum est 5` |

The limits are duplicated in three places — `create-review.dto.ts` / `update-review.dto.ts`,
buyer-web's `TITLE_MIN`/`TITLE_MAX`, and buyer-mobile's `kReviewTitleMin`/`kReviewTitleMax`. The two
client constants exist because a TypeScript constant cannot reach Flutter. **Keep the three in
sync**; each carries a comment saying so.

> Note the comment limit differs by surface today: the API accepts 1000 characters while
> buyer-mobile's comment field caps input at 500 (`maxLength: 500`, pre-existing). Mobile is simply
> stricter, so nothing breaks — worth aligning at some point.

## Legacy reviews (`title = null`)

Both clients render **nothing at all** where the title would sit — not an empty line, not a
placeholder:

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
