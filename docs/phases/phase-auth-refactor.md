# Phase: Authentication Refactor (2026-04)

Replace phone-OTP-only authentication with a multi-provider system:

- **Buyers** — phone OTP primary, **user-initiated email OTP fallback** via Resend
- **Sellers** — email/password + Google OAuth (**replaces** phone OTP); migration flow for existing phone-only sellers
- **Admins** — email/password + Google **coexist** with phone OTP
- **SMS provider** — Africa's Talking → **Orange DRC** (with rollback fallback)

## Acceptance criteria

### Schema
- [x] `AuthProvider` enum (`PHONE_OTP`, `EMAIL_PASSWORD`, `GOOGLE`) on User with default `PHONE_OTP`.
- [x] `googleId` unique + `passwordSetAt` on User.
- [x] `PasswordResetToken` table (sha256-hashed tokens, usedAt, expiresAt, ipAddress).
- [x] `SellerMigration` table (setupEmailSent, setupCompleted, tempEmail).

### SMS
- [x] `SmsProvider` interface + 3 implementations (Orange DRC, Africa's Talking, Mock).
- [x] DI factory in `sms.module.ts` keyed on `SMS_PROVIDER` env.
- [x] Orange DRC provider uses in-memory OAuth2 token cache, refresh on 401.
- [x] Dev defaults to `mock`; prod defaults to `orange` (creds must be provisioned).

### Backend
- [x] `POST /v1/auth/register/email`, `/login/email`, `/password-reset/{request,confirm}`.
- [x] `POST /v1/auth/login/google` — verifies id_token against web/iOS/Android audiences.
- [x] `POST /v1/auth/otp/request-email` — user-initiated buyer email OTP fallback.
- [x] `POST /v1/auth/seller/{migrate-check,migrate-link-email,setup-password}`.
- [x] Legacy `/v1/auth/login` returns `409 SELLER_MIGRATION_REQUIRED` for phone-only sellers.
- [x] Password reset revokes all refresh tokens atomically.
- [x] `OtpService.requestOtp` accepts `channel?: 'sms' | 'email' | 'both'`.

### Web
- [x] buyer-web `/login` shows "Recevoir par email" link on OTP step.
- [x] seller-web `/login` rewritten to email+password; `/register`, `/forgot-password`, `/reset-password`, `/migrate`, `/setup-password` pages added.
- [x] admin-web `/login` tab switcher (email default / phone coexist); `/forgot-password`, `/reset-password` pages.
- [x] All new copy French-first + English mirrors.
- [x] No SEO regression on buyer-web (SSR preserved).

### Mobile
- [x] buyer-mobile OTP screen shows "Recevoir le code par email" button; repository has `requestEmailOtp` + `loginWithGoogle`.
- [x] seller-mobile `/auth/login` rewritten to email+password; `/auth/migrate`, `/auth/setup-password`, `/auth/forgot-password`, `/auth/reset-password` screens added; `/auth/otp` route retired.
- [ ] `google_sign_in` package wired in pubspec (deferred — needs Google client id + platform files).
- [ ] Deep link `teka-seller://setup-password` configured in Android manifest + iOS entitlement (deferred).

### Docs
- [x] `docs/api-reference.md` — all new endpoints + examples.
- [x] `docs/architecture.md` — 3-flow diagrams + seller migration + SMS provider pattern.
- [x] `docs/deployment.md` — Orange + Google + password env vars + external-service provisioning notes.
- [x] `PROGRESS.md` + `CLAUDE.md` updated.

## Deferred for next iteration

- **Google native SDK on Flutter** — add `google_sign_in`, drop `google-services.json` / iOS reversed client id, wire button in login screens.
- **Seller mobile deep link** — `teka-seller://setup-password` for Android/iOS.
- **E2E tests** — ~15 new cases covering email register/login/reset, Google upsert branches, seller migration happy path + edge cases, email OTP fallback, Orange token cache.
- **Buyer-web niceties** — email+password register tab, Google Sign-In button.
- **Admin + seller web Google buttons** — backend endpoint is ready; needs `@react-oauth/google` client id + UI.

## Rollout order

| Phase | Scope | Rollback |
|---|---|---|
| A | Schema migration + SMS provider deployed (`SMS_PROVIDER=mock` briefly) | Drop new columns/tables |
| B | Flip `SMS_PROVIDER=orange` in production | Flip back to `africas_talking`; AT creds retained |
| C | Ship M3+M4+M6 API + buyer-web + admin-web | Feature-flag seller UI unshipped |
| D | Ship seller-web + seller-mobile rewrite | Legacy seller login endpoint returns migration redirect |
| E | 30-day bake → remove AT creds, bump mobile minimum app version | — |

## Critical files

- `apps/api/prisma/schema.prisma` — `User` + `PasswordResetToken` + `SellerMigration`.
- `apps/api/src/auth/auth.service.ts` — all new methods (`registerWithEmail`, `loginWithEmail`, `loginWithGoogle`, `requestPasswordReset`, `confirmPasswordReset`, `requestEmailOtpFallback`, `migrateSellerCheck`, `migrateSellerLinkEmail`, `setupSellerPassword`).
- `apps/api/src/sms/` — provider abstraction.
- `apps/api/src/auth/utils/password.util.ts` — bcrypt wrapper + reset-token helpers.
- `apps/api/src/email/templates/{password-reset,welcome,seller-setup}.template.ts`.
- `packages/shared/src/{types,validators,constants}/auth.*` — DTOs + Zod + `AUTH_COOKIE_NAMES`.
- `apps/{buyer,seller,admin}-web/src/app/[locale]/` — new pages.
- `apps/{buyer,seller}-mobile/lib/features/auth/` — new screens + repository.
- `tasks/auth-refactor-progress.md` — resumable tracker.

## Session notes

- Email+password and Google users without a phone number get a synthetic placeholder (`+243EMAIL<ts>` / `+243GOOGLE<ts>`) to satisfy the existing `User.phone @unique` constraint. If this becomes a problem, the next schema step is to make `phone` nullable.
- Password rules (shared): min 8 / max 72 / ≥1 letter + ≥1 digit.
- Reset/verification email links derive base URL from `user.role` (`BUYER_WEB_URL` / `SELLER_WEB_URL` / `ADMIN_WEB_URL`).
