# App-store review login (buyer)

A tightly-scoped, server-side, env-gated mechanism that lets Apple App Review and
Google Play reviewers sign into buyer-mobile without receiving a live WhatsApp
OTP. **It is not a universal bypass** — the fixed code works only for a single
allowlisted phone, only while explicitly enabled.

## How it works

`BuyerOtpService.verifyOtp` (`apps/api/src/auth/buyer-otp.service.ts`) checks
`isReviewLogin(phone, code)` **before** the real OTP path. It returns true only
when **all** hold:

1. `APP_REVIEW_LOGIN_ENABLED` is `true`;
2. the submitted phone **exactly** equals `APP_REVIEW_BUYER_PHONE_E164`;
3. the submitted code **exactly** equals `APP_REVIEW_BUYER_OTP`.

Every other phone always uses a real Gupshup OTP. The bypass is **login-only**
(it does not touch account deletion re-auth, which calls `verifyOtpInternal`
directly). Normal rate-limiting/abuse controls still apply. The OTP value is
never logged; a match logs `[app-review] review login accepted…` only.

No client change: the reviewer uses the normal login screen — enter the review
phone, then the fixed code.

## Configuration

Env vars (root `.env.*`; **prod values are secrets — never commit real ones**):

```env
APP_REVIEW_LOGIN_ENABLED=false        # default OFF
APP_REVIEW_BUYER_PHONE_E164=+243XXXXXXXXX   # owner-provided/approved, NOT chosen in code
APP_REVIEW_BUYER_OTP=<6-digit code kept only in the secret manager>
```

**The review phone must be a dedicated, Teka-controlled number** (never a real
customer). Pick/approve it out-of-band and store it as a production secret.

## Enable / disable procedure (per review window)

The toggle is wired through **GitHub Secrets → `deploy.yml` export → the api
service `environment:` block in `docker-compose.prod.yml`** (same chain as
`POSTHOG_API_KEY`), so it flips with **no SSH** to the VPS-managed
`.env.production`. Secrets: `APP_REVIEW_LOGIN_ENABLED`, `APP_REVIEW_BUYER_PHONE_E164`,
`APP_REVIEW_BUYER_OTP`. Absent/empty → OFF by default.

**Enable (start of a review window):**
```bash
gh secret set APP_REVIEW_LOGIN_ENABLED   --body true
gh secret set APP_REVIEW_BUYER_PHONE_E164 --body <approved E.164 number>   # never commit it
gh secret set APP_REVIEW_BUYER_OTP       --body <fresh random 6-digit code>   # never reuse the dev code
gh workflow run deploy.yml               # or push to main; recreates the api container
```
Verify: `POST /v1/auth/buyer/otp/verify` with the allowlisted phone + code → 200;
any other phone with that code → 401. Since D1 the allowlisted phone must belong to a BUYER.

**Disable (review finished) — do this promptly:**
```bash
gh secret set APP_REVIEW_LOGIN_ENABLED --body false
gh workflow run deploy.yml             # redeploy to recreate the api container
```
Keep it enabled **only** during an active review. A container restart is required
for a secret change to take effect (env is read at container start) — a redeploy
does exactly that.

**Current status (2026-09-06):** DISABLED in production (`APP_REVIEW_LOGIN_ENABLED=false`, verified).
Enable only for an active review window, then disable. The API logs an error on every production
boot while the flag is on, and the phone/code comparison is constant-time. Never write the real phone
or code into this file or any commit — they live only in the GitHub secrets.

## Credential rotation

Rotate `APP_REVIEW_BUYER_OTP` (and, if needed, the phone) by updating the
secrets and redeploying. No code change.

## Demo data (safe review account)

On first login the account is auto-provisioned by `findOrCreateUserByPhone`
(an empty BUYER). For a richer review, once the phone is chosen, seed safe demo
data for that user id — a couple of clearly-marked test orders and a saved
address — via a one-off script or Prisma Studio. Keep it free of real
customer/seller PII and any real monetary balance; it is resettable for future
reviews. (Not seeded automatically because the phone is owner-provided.)

## Reviewer notes

**App Store review notes / Play Console test credentials:**

> Sign-in uses a phone number + a one-time code sent via WhatsApp. For review,
> use the demo account below — the code is fixed and does not require WhatsApp:
>
> - Phone: `<APP_REVIEW_BUYER_PHONE_E164>`
> - Code: `<APP_REVIEW_BUYER_OTP>`
>
> Enter the phone on the login screen, tap to receive the code, then enter the
> fixed code above.

## Security notes

- Server-side only; no client-side OTP bypass exists.
- Scoped to one allowlisted phone; empty config never matches.
- Attempts are rate-limited by the existing throttler + per-phone OTP limits.
- The OTP is never logged.
