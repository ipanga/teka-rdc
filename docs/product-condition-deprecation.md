# `Product.condition` — deprecated, not removed (2026-07-28)

Teka sells **new products only**. The Neuf / Occasion concept no longer means anything to a buyer or
a seller, so it is gone from every user surface. The **data and the API contract are unchanged.**

Owner confirmed 2026-07-28: **every product in production is `NEW`.** There are no `USED` rows to
preserve, relabel or delist, so hiding the field misrepresents nothing.

## What was decided

| | Decision |
|---|---|
| `ProductCondition` enum | **kept** (`NEW`, `USED`) |
| `Product.condition` column | **kept**, still `@default(NEW)`, index untouched |
| Migration | **none** — no destructive change, nothing to roll back |
| API request field | **kept**, now *optional*, defaults to `NEW` |
| API response field | **kept and still returned** |
| `?condition=` browse filter | **kept and still honoured** — no client sends it any more |
| Seller UI (web + mobile) | selector **removed**; `NEW` submitted implicitly |
| Buyer UI (web) | condition badge **removed**; État filter **removed** |
| Buyer UI (mobile) | **deferred** — see below |
| Admin UI | **left as-is** — see below |
| JSON-LD `itemCondition` | **kept** as `NewCondition` — see below |

Deliberately *not* done: dropping the column, dropping the enum, or writing a migration. A
destructive migration for what is a presentation change would risk production data for no gain, and
the brief explicitly rules it out.

## Why the field still exists

- **Backward compatibility.** Older mobile builds still send `condition` on create/update and still
  read it off the product payload. Removing it from the API would break them mid-rollout.
- **Reversibility.** If Teka ever accepts used goods (a plausible marketplace direction), the column,
  enum and filter are all still there; only UI has to come back.
- **SEO.** `schema.org/Product.itemCondition` is a genuinely useful signal and Google reads it. The
  PDP still emits `https://schema.org/NewCondition`. Hiding a badge from humans is not a reason to
  stop telling crawlers what the product is.

## Files changed

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | deprecation notes on the enum + field. **No structural change** |
| `apps/api/src/products/dto/create-product.dto.ts` | `condition` → `@IsOptional()`, documented |
| `apps/api/src/products/products.service.ts` | defaults to `ProductCondition.NEW` when omitted |
| `apps/api/src/browse/dto/browse-products-query.dto.ts` | marked deprecated; still accepted |
| `apps/seller-web/.../products/new/page.tsx` | selector removed; submits `NEW` |
| `apps/seller-web/.../products/[id]/page.tsx` | selector removed; submits `NEW`; dropped from the content-dirty check |
| `apps/seller-mobile/.../product_form_screen.dart` | selector + `_ConditionOption` widget removed; `_condition` is a constant |
| `apps/buyer-web/.../pages/product-detail-page.tsx` | condition badge removed |
| `apps/buyer-web/.../product/product-filters.tsx` | État filter removed; props retained |

### One behavioural subtlety worth knowing

seller-web's edit form re-submits an ACTIVE product for review when a *content* field changes. That
check included `condition`. Left in place, a legacy `USED` product would have compared `NEW !==
'USED'` on **every** save and silently re-entered moderation each time. `condition` is now excluded
from that comparison. Moot today (no `USED` rows), correct regardless.

## Not done yet — buyer-mobile

Buyer-mobile's condition display lives in `product_detail_screen.dart`, `product_card.dart`,
`category_screen.dart` and `wishlist_screen.dart` — **all four rewritten by PR #580**, which is open
and unreviewed. Touching them now would either conflict or silently revert that work.

`filter_bottom_sheet.dart` (the mobile condition filter) is *not* in #580 and could have been done
here, but shipping it alone would leave a half-state: filter gone, badge still showing. Deferred so
buyer-mobile lands as one coherent change.

**Follow-up once #580 is resolved:** remove the condition badge from the mobile PDP and cards, and
the condition filter from `filter_bottom_sheet.dart`.

## Not done — admin-web

`admin-web/.../products/[id]/page.tsx:312` still shows Neuf / Occasion on the moderation screen.
Left deliberately: it is an internal view of a stored value, it costs nothing, and it is the one
place where seeing the real column value is still useful while the field is in its deprecation
window. Remove it at final cleanup, not before.

## Rollback

Revert the commit. There is no migration and no data change, so rollback is pure code. Every removed
control can come back by reverting its file; the underlying field never stopped working.

## Final cleanup — the conditions to meet first

Do **not** drop the column or enum until all of these hold:

1. buyer-mobile follow-up shipped (above), so no client renders the field.
2. A full app release cycle has passed, so no in-the-wild build still sends `condition` on create.
3. `SELECT condition, COUNT(*) FROM products GROUP BY condition;` still returns `NEW` only.
4. A decision that Teka will not sell used goods — otherwise keep it indefinitely; it costs one
   nullable-free enum column.
5. `itemCondition` in JSON-LD gets a hardcoded `NewCondition` first, so SEO does not regress when the
   field goes.

## Tests

`condition` had no dedicated test coverage before this change and still has none — it is a field with
no branching logic left. What was verified: API **229 unit + 118 e2e** pass (the create/update paths
exercise the now-optional DTO), seller-mobile **31**, and `type-check` clean across api, seller-web
and buyer-web.
