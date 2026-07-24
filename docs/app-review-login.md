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
APP_REVIEW_BUYER_OTP=123456
```

**The review phone must be a dedicated, Teka-controlled number** (never a real
customer). Pick/approve it out-of-band and store it as a production secret.

## Enable / disable procedure (per review window)

1. Set `APP_REVIEW_BUYER_PHONE_E164` to the approved number and
   `APP_REVIEW_LOGIN_ENABLED=true` in the production environment; redeploy the
   API (or restart so ConfigService re-reads).
2. Submit the app; provide the reviewer notes below.
3. When the review completes, set `APP_REVIEW_LOGIN_ENABLED=false` and redeploy.
   Recommended: keep it enabled **only** during an active review.

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
