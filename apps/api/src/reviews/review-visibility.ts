import { ReviewStatus } from '@prisma/client';

/**
 * The ONE definition of a review that exists for buyers.
 *
 * A review contributes to the public list, to the count and to the average
 * (both the live `/stats` aggregate and the denormalised
 * `Product.avgRating` / `Product.totalReviews` / `SellerProfile.*` caches)
 * if and only if it matches this predicate. Anything else — a review the
 * buyer deleted (`deletedAt` set) or one an admin hid (`status = HIDDEN`) —
 * contributes to NOTHING: it is neither listed nor counted nor averaged.
 *
 * Every read path (`ReviewsService.getProductReviews`, `getProductReviewStats`)
 * and every recalculation path (buyer create / edit / delete, admin hide /
 * unhide / delete) spreads this object rather than restating the two fields,
 * so the list, the count and the average can never disagree with each other
 * (pre-scale audit, 2026-09-06: "reviews invisible while still counted").
 *
 * Admin moderation lists deliberately do NOT use it — they must show HIDDEN
 * reviews so they can be unhidden.
 */
export const VISIBLE_REVIEW_WHERE = {
  deletedAt: null,
  status: ReviewStatus.ACTIVE,
} as const;
