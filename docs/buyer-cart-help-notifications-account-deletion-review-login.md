# Buyer cart nav · notifications · help pages · account deletion · app-review login

> Living tracker for the multi-priority buyer initiative (started 2026-07-24). Delivered as phased,
> reviewable PRs into `develop`. Update the checklist + "Files changed" at the end of every phase.
> Plan of record: `~/.claude/plans/claude-code-prompt-peppy-curry.md`.

## Decisions (locked with owner)

- **Account deletion** → 30-day pending-deletion grace period (reactivate on login within window; purge/anonymize after).
- **App-review login** → env-gated, enabled only during review windows (`APP_REVIEW_LOGIN_ENABLED` defaults `false`). Owner supplies/approves the dedicated `+243` review number as a secret — not chosen in code.
- **Contact-info fix** → seed + idempotent prod SQL migration.
- **Mobile Aide** → fix Markdown rendering + add missing pages (À propos, Comment acheter).

## Confirmed root causes

| # | Issue | Root cause |
|---|---|---|
| P1 | Cart item doesn't open PDP | mobile `CartItemTile` has no `onTap`; web `CartItemRow` links to `/recherche?q=<title>` because the cart `product` payload lacks `slug`/`shortCode`/`city` |
| P2 | Notification settings | "Annonces et promotions" toggle sends dead key `smsBroadcasts` (backend live keys: `pushBroadcasts`/`emailBroadcasts`); OS permission never checked in settings |
| P3 | Help pages | mobile `ContentPageScreen` renders raw Markdown; seeded contact info wrong (`+243 999 000 000` / `support@teka.cd`) |
| P4 | Account deletion | orphaned `DELETE /v1/users/profile` — stamps `deletedAt` only, no re-auth/revocation/anonymization; no client calls it |
| P5 | Notification Center empty | `order-notification.service.ts` sends push/email to buyers but never writes a buyer `UserNotification` feed row (only sellers + broadcasts persist) |
| P6 | App-review login | needs scoped, env-gated allowlist branch in `buyer-otp.service.ts` verify |

## Checklist

- [x] **Phase 1** — Tracker doc created.
- [x] **Phase 2** — Cart item opens Product Detail (mobile + web).
- [ ] **Phase 3** — Help/static content (mobile Markdown + canonical contact + missing pages).
- [ ] **Phase 4** — Notification settings audit (dead toggle + OS permission).
- [ ] **Phase 5** — Notification Center persistence (buyer order-event feed rows + backfill).
- [ ] **Phase 6** — Account deletion (30-day pending-deletion, 4 surfaces).
- [ ] **Phase 7** — App-review login (env-gated allowlist).
- [ ] **Phase 8** — Cross-platform regression testing.
- [ ] **Phase 9** — Documentation & final report.

## Files changed (per phase)

_Phase 1:_ `docs/buyer-cart-help-notifications-account-deletion-review-login.md` (this file).

_Phase 2:_
- **buyer-mobile:** `cart_item_tile.dart` (image + title/price area now open PDP via `onOpenProduct`, stepper/remove stay independent); `cart_screen.dart` (wires `onOpenProduct` → `context.push('/products/:id')`); `product_detail_screen.dart` (404 → "Ce produit n'est plus disponible." + Retour); `core/widgets/app_states.dart` (`AppErrorState.actionLabel`).
- **API:** `cart/cart.service.ts` — cart product select + serializer now include `slug`/`shortCode`/`city.slug`.
- **buyer-web:** `lib/types.ts` (`CartItem.product` + link fields); `components/cart/cart-item-row.tsx` (uses `productHref`; unavailable product → non-link text); `app/panier/page.tsx` (guest-cart hydration maps the new fields).
- Verified: API 209 tests, buyer-mobile 136 tests, buyer-web + api type-check, flutter analyze — all green.

## Historical-notification limitation

Past **pushes** were never persisted server-side; they cannot be reconstructed from devices. Phase 5 persists all **future** buyer notifications and backfills only order-derived events reconstructable from `Order`/status logs.

## Resume instructions

Work proceeds phase-by-phase, one branch/PR per phase into `develop`. Current branch:
`fix/buyer-cart-open-product-detail` (Phase 1 + 2). Next uncompleted item is the top unchecked box above.
