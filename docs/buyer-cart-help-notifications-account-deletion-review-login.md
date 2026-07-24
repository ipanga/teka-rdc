# Buyer cart nav · notifications · help pages · account deletion · app-review login

> Final tracker for the multi-priority buyer initiative (2026-07-24). Delivered as
> 7 independent, reviewable PRs into `develop` (#558–#563 + this docs wrap-up).
> Plan of record: `~/.claude/plans/claude-code-prompt-peppy-curry.md`.

## Decisions (locked with owner)

- **Account deletion** → 30-day pending-deletion grace (reactivate on login within the window; purge/anonymize after).
- **App-review login** → env-gated, enabled only during review windows; owner supplies/approves the dedicated `+243` review number as a secret. Ships **disabled** with a placeholder.
- **Contact-info fix** → seed + idempotent prod SQL migration.
- **Mobile Aide** → fix Markdown rendering + add missing pages (À propos, Comment acheter).

## Checklist — all shipped

- [x] **Phase 1** — Tracker doc.
- [x] **Phase 2** — Cart item opens Product Detail (mobile + web) — **PR #558**.
- [x] **Phase 3** — Help/static content (Markdown + canonical contact + accurate copy + prod migration) — **PR #559**.
- [x] **Phase 4** — Notification settings (dead toggle + OS-permission awareness) — **PR #560**.
- [x] **Phase 5** — Notification Center persistence + deep links + backfill — **PR #561**.
- [x] **Phase 6** — Account deletion (30-day pending, all 4 surfaces) — **PR #562**.
- [x] **Phase 7** — App-review login (env-gated, ships disabled) — **PR #563**.
- [x] **Phase 8** — Cross-platform verification (per-PR; see limitations).
- [x] **Phase 9** — Docs (this file + STATUS.md + PROGRESS.md).

## Root causes (confirmed) & fixes

| # | Issue | Root cause → fix |
|---|---|---|
| P1 | Cart doesn't open PDP | mobile tile inert; web linked to search (payload lacked slug/shortCode/city) → tap target + serializer fields + `productHref()` |
| P2 | Settings toggle no-op | "Annonces" sent retired `smsBroadcasts` → map to `pushBroadcasts`+`emailBroadcasts`; + OS-permission banner |
| P3 | Help pages | mobile rendered raw Markdown; wrong/stale copy → `MarkdownContent` widget + rewritten authoritative CMS pages + prod migration |
| P4 | Deletion | orphaned unsafe `DELETE /v1/users/profile` → full 30-day pending-deletion lifecycle |
| P5 | Notif Center empty | buyer order events never wrote a feed row → `recordBuyerFeed()` in all 10 events + backfill |
| P6 | Review login | needed a scoped bypass → env-gated allowlist in `verifyOtp` |

## Files changed (by PR)

- **#558:** buyer-mobile `cart_item_tile.dart`, `cart_screen.dart`, `product_detail_screen.dart`, `core/widgets/app_states.dart`; api `cart/cart.service.ts`; buyer-web `lib/types.ts`, `components/cart/cart-item-row.tsx`, `app/panier/page.tsx`.
- **#559:** buyer-mobile `core/widgets/markdown_content.dart` (+test), `content_page_screen.dart`, `profile_screen.dart`; buyer-web `components/pages/content-page-view.tsx`; api `prisma/seed.ts` + `migrations/manual/2026-07-24_content_contact_details.sql`.
- **#560:** buyer-mobile `core/push/push_service.dart`, `profile/data/profile_repository.dart`, `notification_settings_screen.dart`; seller-mobile same two; buyer-web `app/profil/page.tsx`.
- **#561:** api `notifications/order-notification.service.ts` (+`order-notification.service.spec.ts`), `prisma/backfill-buyer-order-notifications.ts`; buyer-mobile `notifications/data/models/notification_model.dart`; buyer-web `components/notifications/notification-types.ts`.
- **#562:** api `prisma/schema.prisma` (+`migrations/manual/2026-07-24_account_deletion_pending.sql`), `users/account-deletion.{service,controller}.ts` (+spec), `users/dto/account-deletion.dto.ts`, `users/{users.module,users.controller,users.service}.ts`, `auth/{auth.module,auth.service,buyer-otp.service}.ts`, `push/device-tokens.service.ts`, `email/email.service.ts`, `app.module.ts`; buyer-mobile + seller-mobile `account_deletion_screen.dart` + `security_screen.dart` + `profile_repository.dart` + router; buyer-web + seller-web `components/account/delete-account-section.tsx` + profile page.
- **#563:** api `auth/buyer-otp.service.ts` (+spec), `config/env.validation.ts`; `docs/app-review-login.md`; root `.env.*` (gitignored — placeholder, disabled).

## Verification

- **API:** 218 unit (30 suites) + 116 e2e — includes new specs: `order-notification` buyer-feed (×3), `account-deletion.service` (×9), buyer-otp review-login (×5).
- **Mobile:** buyer-mobile 139 tests (+3 Markdown), seller-mobile 12 — all green; `flutter analyze` clean on touched files.
- **Web:** buyer-web + seller-web `type-check` green (seller-web has pre-existing `@sentry/nextjs` config-file noise, unrelated).

**Limitations (honest):** not physical-device verified (no device available); the cloud dev DB was unreachable from the build environment, so no live integration/e2e-against-real-DB run and `db:push` for #562's columns was applied only to the schema/generated client, not the cloud DB. A device pass + running the suite on a merged `develop` remain for the reviewer.

## Historical-notification limitation

Past **pushes** were never persisted server-side and cannot be reconstructed from devices. #561 persists all **future** buyer notifications and backfills only the order-placed event, which is derivable from the `Order` row.

## Operator actions (post-merge / deploy)

1. **#559** — apply `manual/2026-07-24_content_contact_details.sql` (Apply prod migration workflow) — corrects existing content pages.
2. **#562** — apply `manual/2026-07-24_account_deletion_pending.sql` (adds the two columns + index) before/with deploy. Purge cron runs in-process daily at 03:00 (idempotent, multi-instance-safe).
3. **#561** — optionally run `prisma/backfill-buyer-order-notifications.ts --confirm` to seed order history into existing buyers' feeds.
4. **#563** — set `APP_REVIEW_BUYER_PHONE_E164` to the owner-approved dedicated number (secret) and `APP_REVIEW_LOGIN_ENABLED=true` **only** during an active store-review window; disable after. See `docs/app-review-login.md`.

## Known follow-up

- _None._ The notification-prefs dead-toggle fix now covers all four surfaces (buyer-mobile, seller-mobile, buyer-web, seller-web) — the seller-web fix was folded into #560.

## Resume instructions

All phases complete; 7 PRs open into `develop` for review (independent, any merge order). If reopening: the tracker above is the source of truth; the per-PR "Files changed" lists the surface area.
