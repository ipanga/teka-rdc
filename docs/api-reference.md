# Teka RDC — API Reference

Base URL: `https://teka.cd/api`

## Response Format

All responses follow a standard envelope format.

**Success response:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 100 }
}
```

**Error response:**
```json
{
  "success": false,
  "error": {
    "status": 400,
    "message": "Description de l'erreur",
    "errors": ["field-specific validation errors"]
  }
}
```

## Authentication

All endpoints require a valid JWT access token via `Authorization: Bearer <token>` header or the surface's httpOnly access cookie (`teka_{admin,seller,buyer}_access`, selected by the `X-Teka-Surface` header), unless marked as **Public**.

Token lifecycle:
- Access token: 15-minute expiry
- Refresh token: 7-day expiry (stored as the per-surface httpOnly cookie `teka_{admin,seller,buyer}_refresh`)
- Tokens are also returned in the response body for mobile app usage

---

## Health Check

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/health` | Public | Full health check (database + Redis status) |
| GET | `/v1/health/ready` | Public | Readiness probe (503 if dependencies down) |
| GET | `/v1/health/live` | Public | Liveness probe (always 200) |

All health endpoints are exempt from rate limiting.

---

## Auth — `/v1/auth`

Authentication is role-specific since 2026-05-15: **sellers + admins use email + password**, **buyers use WhatsApp OTP via Gupshup**. Sellers register at `/v1/auth/register/email`; admins are seeded out-of-band; buyers register implicitly on first WhatsApp OTP verify. Login: `/v1/auth/login/email` for sellers + admins, `/v1/auth/buyer/otp/*` for buyers. See `docs/architecture.md § Authentication` for the full flow.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/auth/buyer/otp/request` | Public | Issue 6-digit OTP, deliver via WhatsApp (Gupshup template). sha256-hashed in DB. Rate-limited 3 / 600s. |
| POST | `/v1/auth/buyer/otp/verify` | Public | Verify OTP → find-or-create User by phone, issue tokens + cookies. Optional `firstName/lastName` on first verify. |
| POST | `/v1/auth/buyer/otp/resend` | Public | Re-issue OTP. 30s minimum cooldown between resends. Returns `{ expiresInSeconds, cooldownSeconds }`. |
| POST | `/v1/auth/buyer/claim/request` | Public | Step 1 of email-only legacy claim. Always neutral 200. Emails a 24h magic link if a matching email-only buyer exists. |
| POST | `/v1/auth/buyer/claim/verify` | Public | Step 2 — verify magic-link JWT + fresh OTP, attach phone to existing User, revoke refresh tokens, issue new ones. |
| POST | `/v1/auth/register/email` | Public | Register a seller account with email + password. Server assigns `role=SELLER`. |
| POST | `/v1/auth/login/email` | Public | Login with email + password (sellers + admins; soft-deprecated edge case for legacy email-buyer cohort 2026-05-12 → 2026-05-15). |
| POST | `/v1/auth/password-reset/request` | Public | Always 200. Sends reset link only for ADMIN/SELLER; buyers have no password to reset (use `/v1/auth/buyer/claim/request` instead). |
| POST | `/v1/auth/password-reset/confirm` | Public | Consume reset token + set new password; revokes all refresh tokens. |
| POST | `/v1/auth/password/change` | Bearer | Change password for the signed-in user (sellers + admins). |
| POST | `/v1/auth/refresh` | Public | Rotate tokens. A replay inside the 15s grace window is treated as a benign race; outside it, all sessions are revoked. |
| POST | `/v1/auth/logout` | Bearer | Logout and invalidate refresh token. |
| GET | `/v1/auth/me` | Bearer | Get current user profile. |
| POST | `/v1/auth/email/send-verification` | Bearer | Send email verification link. |
| GET | `/v1/auth/email/verify?token=...` | Public | Verify email from link. |

> **Removed endpoints (return 404)** — covered by 404-assertion tests in `auth.e2e-spec.ts`:
> - `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify` — original phone-OTP (May 2026; the new buyer OTP lives under `/v1/auth/buyer/otp/*`).
> - `POST /v1/auth/register` — phone-OTP buyer register (May 2026).
> - `POST /v1/auth/login` — phone-OTP login (May 2026).
> - `POST /v1/auth/login/google` — Google OAuth (April 2026).
> - `POST /v1/auth/otp/request-email` — email-OTP fallback (April 2026).
> - `POST /v1/auth/register/buyer` — email+password buyer register (2026-05-15; replaced by WhatsApp OTP).
> - `POST /v1/auth/buyer/migrate-check`, `POST /v1/auth/buyer/migrate-link-email`, `POST /v1/auth/buyer/setup-password` — phone→email migration (2026-05-15; replaced by `/v1/auth/buyer/claim/*`).
> - `POST /v1/auth/seller/migrate-check`, `POST /v1/auth/seller/migrate-link-email`, `POST /v1/auth/seller/setup-password` — legacy seller phone→email migration (**retired 2026-05-18**). The only seller account that ever existed was data-migrated directly. `SellerMigration` (schema), `SELLER_SETUP_EXPIRY_HOURS`, and the seller-setup email template are residual — leaving the routes unregistered *is* the deprecation signal.

### Buyer WhatsApp OTP (since 2026-05-15)
```json
POST /v1/auth/buyer/otp/request
{ "phone": "+243990000001" }
// → 200 { "expiresInSeconds": 300, "cooldownSeconds": 30 }
// → 400 if phone shape !~ /^\+243\d{9}$/
// → 429 if rate-limited (3 requests / 600s window per phone)

POST /v1/auth/buyer/otp/verify
{
  "phone": "+243990000001",
  "code": "123456",
  "firstName": "Jean",     // optional — captured only if creating a new buyer
  "lastName":  "Mukendi"    // optional
}
// → 200 { "user": {...}, "tokens": {...} } (also sets httpOnly cookies)
// → 401 on wrong/expired code
// Behavior:
//   - phone matches an existing User (any role): log in. If role=SELLER,
//     buyer-web redirects to SELLER_WEB_URL (global phone uniqueness).
//   - no User with phone: create role=BUYER, authProvider=PHONE_OTP,
//     phoneVerified=true, status=ACTIVE.

POST /v1/auth/buyer/otp/resend
{ "phone": "+243990000001" }
// → 200 { "expiresInSeconds": 300, "cooldownSeconds": 30 }
// → 429 if within the 30s cooldown since last issue
```
OTP delivery uses Gupshup's WhatsApp Business template API. Code is generated locally (`crypto.randomInt`, 6 digits zero-padded) and stored as **sha256** hex; the plaintext code never touches the database. In dev with `WHATSAPP_PROVIDER=mock`, the code is the constant `123456` (also written to API stdout as `[MOCK WHATSAPP OTP] phone=... code=...`).

### Buyer claim flow (legacy email-only buyers)
The 2026-05-12 → 2026-05-15 email+password buyer cohort has `User.phone IS NULL`. They attach a phone via this two-step flow:
```json
POST /v1/auth/buyer/claim/request
{ "email": "orphan@example.com" }
// → 200 { "message": "Si un compte correspond, un email vous a été envoyé." }
// Enumeration-safe: returns identical response whether or not the email exists.
// If a match exists (BUYER + phone=null): emails a 24h JWT magic link to
// ${BUYER_WEB_URL}/reclamer-compte/confirmer?token=<jwt>

POST /v1/auth/buyer/claim/verify
{
  "token":  "<24h buyer_phone_claim JWT>",
  "phone":  "+243990000001",
  "code":   "123456"
}
// → 200 { "user": {...}, "tokens": {...} }  (sets httpOnly cookies)
// → 400 if token invalid/expired/wrong-type
// → 401 if OTP wrong
// → 409 if another user already holds this phone (user is directed to
//        WhatsApp OTP login for the conflicting account).
// Atomic: User.phone = phone, phoneVerified=true; BuyerMigration.tempPhone
// cleared + setupCompleted set; all refresh tokens revoked.
```

### Email + password (sellers + admins)
```json
POST /v1/auth/register/email
{ "email": "vendeur@example.com", "password": "Secret123", "firstName": "Jean", "lastName": "Mukendi" }
// Creates role=SELLER. Admins are seeded out-of-band — there is no public admin registration endpoint.

POST /v1/auth/login/email
{ "email": "anyone@example.com", "password": "Secret123" }
// Accepts SELLER, ADMIN. The 2026-05-12 → 2026-05-15 email-buyer cohort
// can also log in here as a soft-deprecated path while they remain
// unclaimed.
```
Password rules: min 8 / max 72 characters, at least one letter + one digit.
Error messages are generic to avoid user enumeration (`"Email ou mot de passe invalide"`).
On registration, a verification email is sent in the background; the user is logged in immediately (soft verification).

### Password reset
```json
POST /v1/auth/password-reset/request
{ "email": "anyone@example.com" }
// Response: always 200 — "Si un compte existe, un email de réinitialisation a été envoyé."

POST /v1/auth/password-reset/confirm
{ "token": "<raw token from email link>", "newPassword": "NewSecret123" }
```
Token TTL controlled by `PASSWORD_RESET_EXPIRY_MINUTES` (default 60).
On confirm, all of the user's refresh tokens are revoked and `authProvider` is set to `EMAIL_PASSWORD`.

### Refresh Token
```json
POST /v1/auth/refresh
{ "refreshToken": "eyJhbGciOiJIUzI1NiIs..." }
```
Also accepts the refresh token from the per-surface cookie chosen by the `X-Teka-Surface` header — `teka_{admin,seller,buyer}_refresh` (see `docs/session-management.md`).

---

## Users — `/v1/users`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/users/profile` | Bearer | Get own profile |
| PATCH | `/v1/users/profile` | Bearer | Update own profile |
| DELETE | `/v1/users/profile` | Bearer | Soft-delete own account |

### Update Profile
```json
PATCH /v1/users/profile
{
  "firstName": "Jean",
  "lastName": "Mukendi",
  "email": "jean@example.com",
  "preferredLocale": "fr"
}
```

---

## Addresses — `/v1/addresses`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/addresses` | Bearer | List own addresses |
| POST | `/v1/addresses` | Bearer | Create new address |
| PATCH | `/v1/addresses/:id` | Bearer | Update address |
| DELETE | `/v1/addresses/:id` | Bearer | Remove address |
| PATCH | `/v1/addresses/:id/default` | Bearer | Set as default address |
| GET | `/v1/addresses/locations/towns` | Public | List available towns |
| GET | `/v1/addresses/locations/neighborhoods?town=...` | Public | List neighborhoods for a town |

### Create Address
```json
POST /v1/addresses
{
  "label": "Domicile",
  "recipientName": "Jean Mukendi",
  "phone": "+243XXXXXXXXX",
  "town": "Lubumbashi",
  "neighborhood": "Kampemba",
  "avenue": "Avenue Lomami, No 45",
  "isDefault": true
}
```

---

## Contact — `/v1/contact`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/contact` | Public | Forward a contact-form submission to the support inbox |

Rate-limited to 5 submissions per IP per hour (on top of the global 100/min). A hidden `website` honeypot field traps bots — any non-empty value is silently dropped server-side (still returns 200, so bots can't probe).

```json
POST /v1/contact
{
  "name": "Jean Mukendi",
  "email": "jean@example.com",
  "phone": "+243999000001",     // optional
  "subject": "Question sur ma commande",
  "message": "Bonjour, ma commande TK-12345 ...",
  "website": ""                  // honeypot — leave empty
}
// → 200 { success: true, data: { ok: true } }
```

The email is sent via Resend to `CONTACT_FORM_RECIPIENT` (defaults to `EMAIL_FROM`). Reply-to is set to the submitter's email, so the support agent can reply directly from their inbox.

---

## Browse (Public) — `/v1/browse`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/browse/categories` | Public | Category tree (each node includes `slug`) |
| GET | `/v1/browse/categories/:identifier` | Public | Category detail by **UUID or slug**. Used by `/categorie/<slug>` on buyer-web |
| GET | `/v1/browse/products` | Public | Product listing with filters |
| GET | `/v1/browse/products/:id` | Public | Product detail (cached 5min) |
| GET | `/v1/browse/banners` | Public | Active homepage banners (cached 5min) |
| GET | `/v1/browse/promotions` | Public | Active promotions (cached 5min) |
| GET | `/v1/browse/promotions/:id` | Public | Single active promotion detail |
| GET | `/v1/browse/flash-deals` | Public | Active flash deals (cached 2min) |

### Browse Products — Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Text search in product title/description (max 200 chars) |
| `categoryId` | UUID | Filter by category |
| `condition` | enum | `NEW` or `USED` |
| `minPrice` | string | Minimum price in CDF (centimes) |
| `maxPrice` | string | Maximum price in CDF (centimes) |
| `minRating` | number | Minimum average rating (1-5) |
| `sortBy` | enum | `popularity`, `price_low`, `price_high`, `newest`, `rating` |
| `cursor` | UUID | Pagination cursor (product ID from previous response) |
| `limit` | number | Results per page (1-100, default 20) |

**Example:**
```
GET /v1/browse/products?categoryId=20000000-...&sortBy=newest&limit=20
```

---

## Cart — `/v1/cart`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/cart` | Bearer | Get current cart with items |
| POST | `/v1/cart/items` | Bearer | Add item to cart |
| PATCH | `/v1/cart/items/:productId` | Bearer | Update item quantity |
| DELETE | `/v1/cart/items/:productId` | Bearer | Remove item from cart |
| DELETE | `/v1/cart` | Bearer | Clear entire cart |
| POST | `/v1/cart/merge` | Bearer | Merge guest cart items on login |

### Add to Cart
```json
POST /v1/cart/items
{
  "productId": "30000000-...",
  "quantity": 2
}
```

### Update Quantity
```json
PATCH /v1/cart/items/30000000-...
{
  "quantity": 3
}
```

### Merge Guest Cart
```json
POST /v1/cart/merge
{
  "items": [
    { "productId": "30000000-...", "quantity": 1 },
    { "productId": "30000001-...", "quantity": 2 }
  ]
}
```

---

## Checkout — `/v1/checkout`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/checkout` | Buyer | Create order(s) from cart |

Creates one order per seller. Validates stock, calculates delivery fees, decrements stock atomically.

### Checkout Request
```json
POST /v1/checkout
{
  "addressId": "40000000-...",
  "paymentMethod": "COD",
  "notes": "Appelez avant la livraison"
}
```

`paymentMethod` only accepts `"COD"` since 2026-05-26 (PR B2 of the Orange/AT/Flexpay removal initiative). Legacy clients posting `"MOBILE_MONEY"` get a 400 with a French error prompting an app update. The `Order.paymentMethod` enum still carries `MOBILE_MONEY` on the read side for historical-row rendering.

---

## Orders (Buyer) — `/v1/orders`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/orders` | Bearer | List buyer's orders (paginated) |
| GET | `/v1/orders/:id` | Bearer | Get order detail |
| POST | `/v1/orders/:id/cancel` | Bearer | Cancel a pending order |

### Cancel Order
```json
POST /v1/orders/70000000-.../cancel
{
  "reason": "J'ai change d'avis"
}
```

---

## Seller Orders — `/v1/sellers/orders`

All endpoints require `SELLER` role.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/sellers/orders` | Seller | List seller's orders (paginated) |
| GET | `/v1/sellers/orders/:id` | Seller | Get order detail |
| PATCH | `/v1/sellers/orders/:id/confirm` | Seller | Confirm order |
| PATCH | `/v1/sellers/orders/:id/reject` | Seller | Reject order (with reason) |
| PATCH | `/v1/sellers/orders/:id/process` | Seller | Mark as processing |
| PATCH | `/v1/sellers/orders/:id/ship` | Seller | Mark as shipped |
| PATCH | `/v1/sellers/orders/:id/out-for-delivery` | Seller | Mark as out for delivery |
| PATCH | `/v1/sellers/orders/:id/deliver` | Seller | Mark as delivered |

### Reject Order
```json
PATCH /v1/sellers/orders/70000000-.../reject
{
  "reason": "Produit en rupture de stock"
}
```

---

## Payments — `/v1/payments`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/payments/orders/:orderId/transactions` | Bearer | Get transactions for an order |
| GET | `/v1/payments/transactions` | Admin | List all transactions (paginated) |

**Removed endpoints (now 404, since 2026-05-26 PR B2):**

| Method | Endpoint | Removed by |
|--------|----------|------------|
| POST | `/v1/payments/initiate` | Mobile Money payment initiation — gone with Flexpay |
| POST | `/v1/payments/webhook/flexpay` | Flexpay callback — provider deleted |

COD is the only payment method. `CheckoutService` writes a `Transaction` row with `provider = COD` and `status = PENDING` synchronously on order creation; `SellerOrdersService.markDelivered()` flips it to `COMPLETED`. No external provider call, no webhook handshake, no `PaymentProvider` interface in the codebase anymore.

---

## Seller Profile — `/v1/sellers`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/sellers/apply` | Buyer | Submit seller application |
| GET | `/v1/sellers/application` | Bearer | Check application status |
| GET | `/v1/sellers/profile` | Seller | Get seller profile |
| PATCH | `/v1/sellers/profile` | Seller | Update seller profile |

### Apply as Seller
```json
POST /v1/sellers/apply
{
  "shopName": "Boutique Katanga",
  "description": { "fr": "Meilleure boutique de Lubumbashi", "en": "Best shop in Lubumbashi" },
  "town": "Lubumbashi",
  "businessType": "individual",
  "idNumber": "XXXXXXXX"
}
```

---

## Seller Products — `/v1/sellers/products`

All endpoints require `SELLER` role.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/sellers/products` | Seller | List own products (paginated) |
| POST | `/v1/sellers/products` | Seller | Create new product (DRAFT) |
| GET | `/v1/sellers/products/:id` | Seller | Get own product detail |
| PATCH | `/v1/sellers/products/:id` | Seller | Update product |
| DELETE | `/v1/sellers/products/:id` | Seller | Archive (soft-delete) product |
| PATCH | `/v1/sellers/products/:id/submit` | Seller | Submit for admin review |
| POST | `/v1/sellers/products/:id/images` | Seller | Upload product image (multipart) |
| DELETE | `/v1/sellers/products/:id/images/:imageId` | Seller | Delete product image |

### Create Product
```json
POST /v1/sellers/products
{
  "title": { "fr": "Smartphone Samsung Galaxy A15", "en": "Samsung Galaxy A15 Smartphone" },
  "description": { "fr": "Nouveau, sous emballage...", "en": "Brand new, sealed..." },
  "categoryId": "20000000-...",
  "priceCDF": "15000000",
  "priceUSD": "5000",
  "stock": 10,
  "condition": "NEW",
  "specifications": [
    { "attributeId": "...", "value": "128GB" }
  ]
}
```

Note: Prices are BigInt in centimes. `15000000` CDF centimes = 150,000 CDF.

### Upload Image
```
POST /v1/sellers/products/:id/images
Content-Type: multipart/form-data

image: <file> (max 5MB, JPEG/PNG/WebP)
```

---

## Seller Earnings & Payouts — `/v1/sellers`

Full reference + ops runbook: **`docs/payouts.md`**.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/sellers/wallet` | Seller | Get wallet summary (balance, total earned, total commission, pending) |
| GET | `/v1/sellers/earnings` | Seller | List earnings history (paginated); each row carries an API-derived `state` (`HELD` \| `AVAILABLE` \| `RESERVED` \| `PAID` \| `REVERSED`) |
| GET | `/v1/sellers/payouts` | Seller | List payout history (paginated) |
| GET | `/v1/sellers/payouts/:id` | Seller | One of the seller's own payouts (owner-scoped: a foreign, deleted or malformed id → French 404). Target of payout notifications / deep links |
| POST | `/v1/sellers/payouts` | Seller | Request a payout (whole available balance) |
| GET | `/v1/sellers/payout-method` | Seller | Read the saved reusable payout destination |
| PATCH | `/v1/sellers/payout-method` | Seller | Set/update the payout destination |

### Request Payout
```json
POST /v1/sellers/payouts
{
  "payoutMethod": "M_PESA",       // optional — falls back to saved destination
  "payoutPhone": "+243XXXXXXXXX"  // optional — falls back to saved destination
}
```

Requests the **entire available balance**. Guards: balance ≥ 5 000 FC, only one
open payout (`REQUESTED`/`APPROVED`/`PROCESSING`) at a time (`409`), and a destination must exist
(body or saved profile) — else `400`. The request runs under a row lock on the seller profile and
reserves the exact earnings it read (see `docs/payouts.md`). `payoutMethod` ∈ `M_PESA` | `AIRTEL_MONEY`
| `ORANGE_MONEY`; `payoutPhone` matches `^\+243\d{9}$`.

> **COD-only:** there is no automated disbursement. The platform holds the COD
> cash (couriers collect on Teka's behalf) and settles sellers manually; an admin
> marks the payout paid with an external transfer reference. See `docs/payouts.md`
> for the settlement model + lifecycle.

---

## Seller Notifications — `/v1/seller/notifications`

Per-user in-app feed (`UserNotification`), every read/write scoped to the authenticated seller.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/seller/notifications?page&limit` | Seller | List the feed (`type` ∈ `PRODUCT_APPROVED` \| `PRODUCT_REJECTED` \| `ORDER` \| `PAYOUT` \| `BROADCAST` \| `PRODUCT_PROMO`; `entityType`/`entityId` deep-link: product, order, **payout**) |
| GET | `/v1/seller/notifications/unread-count` | Seller | Unread badge |
| PATCH | `/v1/seller/notifications/:id/read` | Seller | Mark one read (ownership-scoped, no-op for a foreign id) |
| PATCH | `/v1/seller/notifications/read-all` | Seller | Mark all read |

---

## Seller Promotions — `/v1/sellers/promotions`

All endpoints require `SELLER` role.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/sellers/promotions` | Seller | List own promotions |
| POST | `/v1/sellers/promotions` | Seller | Create promotion (PENDING_APPROVAL) |
| GET | `/v1/sellers/promotions/:id` | Seller | Get own promotion detail |
| DELETE | `/v1/sellers/promotions/:id` | Seller | Cancel own promotion (PENDING/DRAFT only) |

---

## Reviews — `/v1/reviews`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/reviews` | Buyer | Create a review (must have DELIVERED order) |
| GET | `/v1/reviews/products/:productId` | Public | Product reviews (cursor-paginated) |
| GET | `/v1/reviews/products/:productId/stats` | Public | Rating distribution (1-5 star counts) |
| GET | `/v1/reviews/products/:productId/mine` | Buyer | Get own review for a product |
| GET | `/v1/reviews/products/:productId/can-review` | Buyer | Check if eligible to review |
| DELETE | `/v1/reviews/:id` | Buyer | Delete own review |

### Create Review
```json
POST /v1/reviews
{
  "productId": "30000000-...",
  "rating": 4,
  "comment": "Tres bon produit, livraison rapide!"
}
```

---

## Wishlist — `/v1/wishlist`

All endpoints require `BUYER` role.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/wishlist` | Buyer | Get wishlist (paginated; only ACTIVE, non-deleted products) |
| GET | `/v1/wishlist/count` | Buyer | Count of active wishlist items (for the header badge) |
| POST | `/v1/wishlist/:productId` | Buyer | Add to wishlist (idempotent; **rejects non-ACTIVE / deleted products → 404**) |
| DELETE | `/v1/wishlist/:productId` | Buyer | Remove from wishlist (idempotent) |
| GET | `/v1/wishlist/check?productIds=id1,id2` | Buyer | Batch check which products are wishlisted (non-UUID ids ignored) |
| GET | `/v1/wishlist/:productId/status` | Buyer | Check if specific product is in wishlist |

Notes:
- Every endpoint is scoped to the authenticated buyer (`@CurrentUser`) — a user
  can only read/modify their own wishlist (no IDOR). Dedup is enforced by a
  `@@unique([userId, productId])` constraint; add is an idempotent upsert.
- `count` uses the same `status = ACTIVE && deletedAt = null` filter as the list,
  so the badge matches the number of items shown.
- `add` only accepts publicly-listed products: DRAFT / PENDING_REVIEW / REJECTED /
  ARCHIVED / soft-deleted all return `404 Produit non trouvé`.

---

## Messaging — `/v1/messages` & `/v1/conversations`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/messages` | Bearer | Send message (creates conversation if needed) |
| GET | `/v1/messages/unread-count` | Bearer | Get total unread message count |
| GET | `/v1/conversations` | Bearer | List conversations (paginated) |
| GET | `/v1/conversations/:id/messages` | Bearer | Get messages in conversation (cursor-paginated) |
| POST | `/v1/conversations/:id/read` | Bearer | Mark conversation as read |

### Send Message
```json
POST /v1/messages
{
  "conversationId": "e2000000-...",
  "content": "Bonjour, est-ce que ce produit est disponible?"
}
```

Or to create a new conversation:
```json
POST /v1/messages
{
  "sellerId": "10000001-...",
  "content": "Bonjour, j'ai une question sur votre produit..."
}
```

---

## Delivery Zones — `/v1/delivery-zones`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/delivery-zones/estimate?fromTown=...&toTown=...` | Public | Estimate delivery fee between two towns |

---

## Content (Public) — `/v1/content`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/content` | Public | List published content page slugs |
| GET | `/v1/content/:slug` | Public | Get published content page by slug (cached 15min) |

Available slugs typically include: `faq`, `terms-of-service`, `privacy-policy`, `about-us`, `contact`.

---

## Settings (Public) — `/v1/settings`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/settings/public` | Public | Get public settings (maintenance mode, announcements) |

---

## Admin Endpoints

All admin endpoints require `ADMIN` role unless otherwise specified.

### Admin Users — `/v1/admin/users`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/users` | ADMIN, SUPPORT | List users with search/filter (paginated) |
| GET | `/v1/admin/users/:id` | ADMIN, SUPPORT | Get user detail |
| PATCH | `/v1/admin/users/:id/status` | ADMIN | Block/unblock user |

### Admin Sellers — `/v1/admin/sellers`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/sellers/applications?status=` | ADMIN | List seller applications (server-side status filter + pagination) |
| GET | `/v1/admin/sellers/applications/:id` | ADMIN | Get application detail |
| PATCH | `/v1/admin/sellers/applications/:id` | ADMIN | Approve or reject application |
| GET | `/v1/admin/sellers/:sellerProfileId/commission` | ADMIN | Effective commission context: override, platform default, effective rate + source, active category rates, last change |
| PUT | `/v1/admin/sellers/:sellerProfileId/commission` | ADMIN | Set the seller override `{ rate, expectedPreviousRate? }` (fraction 0…1, ≤ 4 decimals; `0` = real 0 %); 404 / 400 / **409** on a stale `expectedPreviousRate` |
| DELETE | `/v1/admin/sellers/:sellerProfileId/commission` | ADMIN | Clear the override (`{ expectedPreviousRate? }`), idempotent; the seller follows category / platform rates again |

### Admin Products — `/v1/admin/products`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/products` | ADMIN | List products pending review |
| GET | `/v1/admin/products/:id` | ADMIN | Get product for review |
| PATCH | `/v1/admin/products/:id/approve` | ADMIN | Approve product |
| PATCH | `/v1/admin/products/:id/reject` | ADMIN | Reject product (with reason) |

### Admin Orders — `/v1/admin/orders`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/orders` | ADMIN | List all orders (filterable, paginated) |
| GET | `/v1/admin/orders/:id` | ADMIN | Get order detail |
| PATCH | `/v1/admin/orders/:id/status` | ADMIN | Force status change (with note) |
| POST | `/v1/admin/orders/:id/cancel` | ADMIN | Admin cancel order |

### Admin Dashboard — `/v1/admin/stats`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/stats` | ADMIN | Dashboard KPIs (GMV, orders, users, revenue) + `actionCenter` (sellers / products / returns / pickup / dispatch counts, `payoutsAwaitingReview` and `payoutsAwaitingPayment` with amounts — same `where` as the filtered queues) |
| GET | `/v1/admin/stats/trends?period=30d` | ADMIN | Trend data for charts |

Trend periods: `7d`, `30d`, `90d` (default: `30d`).

### Admin Banners — `/v1/admin/banners`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/banners` | ADMIN | List all banners (status filter) |
| POST | `/v1/admin/banners` | ADMIN | Create banner |
| GET | `/v1/admin/banners/:id` | ADMIN | Get banner detail |
| PUT | `/v1/admin/banners/:id` | ADMIN | Update banner |
| DELETE | `/v1/admin/banners/:id` | ADMIN | Soft-delete banner |

### Admin Promotions — `/v1/admin/promotions`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/promotions` | ADMIN | List all promotions (filterable) |
| POST | `/v1/admin/promotions` | ADMIN | Create promotion |
| GET | `/v1/admin/promotions/:id` | ADMIN | Get promotion detail |
| PUT | `/v1/admin/promotions/:id` | ADMIN | Update promotion |
| POST | `/v1/admin/promotions/:id/approve` | ADMIN | Approve promotion |
| POST | `/v1/admin/promotions/:id/reject` | ADMIN | Reject promotion (reason required) |
| DELETE | `/v1/admin/promotions/:id` | ADMIN | Soft-delete promotion |

### Admin Content — `/v1/admin/content`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/content` | ADMIN | List all content pages (all statuses) |
| POST | `/v1/admin/content` | ADMIN | Create content page |
| GET | `/v1/admin/content/:id` | ADMIN | Get content page |
| PUT | `/v1/admin/content/:id` | ADMIN | Update content page |
| DELETE | `/v1/admin/content/:id` | ADMIN | Delete content page |

### Admin Categories — `/v1/admin/categories`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/categories` | ADMIN | Get category tree |
| POST | `/v1/admin/categories` | ADMIN | Create category |
| GET | `/v1/admin/categories/:id` | ADMIN | Get category detail |
| PATCH | `/v1/admin/categories/:id` | ADMIN | Update category |
| DELETE | `/v1/admin/categories/:id` | ADMIN | Soft-delete category |
| POST | `/v1/admin/categories/:id/attributes` | ADMIN | Add attribute to category |
| PATCH | `/v1/admin/categories/:id/attributes/:attrId` | ADMIN | Update attribute |
| DELETE | `/v1/admin/categories/:id/attributes/:attrId` | ADMIN | Delete attribute |

### Admin Delivery Zones — `/v1/admin/delivery-zones`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/delivery-zones` | ADMIN | List all delivery zones |
| POST | `/v1/admin/delivery-zones` | ADMIN | Create delivery zone |
| PATCH | `/v1/admin/delivery-zones/:id` | ADMIN | Update delivery zone |
| DELETE | `/v1/admin/delivery-zones/:id` | ADMIN | Delete delivery zone |

### Admin Settings — `/v1/admin/settings`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/settings` | ADMIN | List all system settings |
| PUT | `/v1/admin/settings/:key` | ADMIN | Update a setting by key |

### Admin Commission — `/v1/admin/commission-settings`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/commission-settings` | ADMIN | List all commission settings |
| GET | `/v1/admin/commission-settings/history?limit=` | ADMIN | Audit history of platform, category and seller-override changes (actor, target, before → after) |
| PUT | `/v1/admin/commission-settings` | ADMIN | Set/update the platform default `{ rate, isActive?, expectedPreviousRate? }` — **409** when the stored rate differs from `expectedPreviousRate` |
| PUT | `/v1/admin/commission-settings/:categoryId` | ADMIN | Set/update a category rate (same body) |
| DELETE | `/v1/admin/commission-settings/:categoryId` | ADMIN | Remove a category rate |

Precedence at delivery: seller override → leaf category → platform default; rates are snapshotted
on every earning and order item, so a change never rewrites history. Every mutation is audited. See
`docs/payouts.md` → « Commission administration ».

### Admin Payouts — `/v1/admin/payouts`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/payouts` | ADMIN | List all payouts (paginated) |
| GET | `/v1/admin/payouts/:id` | ADMIN | Payout detail: row + reserved earnings + `balances` (seller's available / pending / totals) + `actors` (names for approved / processing / completed / rejected) + `auditTrail` |
| POST | `/v1/admin/payouts/:id/approve` | ADMIN | Authorise (`REQUESTED → APPROVED`) — no money moves; seller notified « Paiement approuvé » |
| POST | `/v1/admin/payouts/:id/process` | ADMIN | Transfer started (`APPROVED → PROCESSING`); no notification |
| POST | `/v1/admin/payouts/:id/complete` | ADMIN | Mark paid (`APPROVED\|PROCESSING → COMPLETED`); `externalReference` (1–200) required; seller notified « Paiement effectué » |
| POST | `/v1/admin/payouts/:id/reject` | ADMIN | Reject (`REQUESTED\|APPROVED\|PROCESSING → REJECTED`); `reason` 5–500 chars, shown to the seller; releases the reserved earnings in the same transaction |

Transitions are conditional updates + an `admin_audit_logs` row in one transaction: a wrong state,
a retry or a concurrent call answers **409** with the current status and never re-notifies.

See **`docs/payouts.md`** for the lifecycle state machine + ops runbook.

### Admin Reviews — `/v1/admin/reviews`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/reviews` | ADMIN | List reviews (filterable by status, product, buyer, rating) |
| POST | `/v1/admin/reviews/:id/hide` | ADMIN | Hide a review (set status HIDDEN) |
| POST | `/v1/admin/reviews/:id/unhide` | ADMIN | Unhide a review (set status ACTIVE) |
| DELETE | `/v1/admin/reviews/:id` | ADMIN | Soft-delete a review |

### Admin Broadcasts — `/v1/admin/broadcasts`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/broadcasts` | ADMIN | List all broadcasts (paginated) |
| POST | `/v1/admin/broadcasts` | ADMIN | Create broadcast |
| GET | `/v1/admin/broadcasts/:id` | ADMIN | Get broadcast detail |
| POST | `/v1/admin/broadcasts/:id/send` | ADMIN | Trigger broadcast sending |
| DELETE | `/v1/admin/broadcasts/:id` | ADMIN | Delete broadcast (DRAFT only) |

### Admin Reports — `/v1/admin/reports`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/reports/sales` | ADMIN | Sales report (JSON) |
| GET | `/v1/admin/reports/sales/csv` | ADMIN | Sales report (CSV download) |
| GET | `/v1/admin/reports/financial` | ADMIN | Financial report (JSON) |
| GET | `/v1/admin/reports/financial/csv` | ADMIN | Financial report (CSV download) |
| GET | `/v1/admin/reports/sellers` | ADMIN | Seller performance report (JSON) |
| GET | `/v1/admin/reports/sellers/csv` | ADMIN | Seller performance report (CSV download) |
| GET | `/v1/admin/reports/payouts` | ADMIN | Payouts reconciliation report (JSON) |
| GET | `/v1/admin/reports/payouts/csv` | ADMIN | Payouts report (CSV download) |

#### Report Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO date | Start of reporting period |
| `endDate` | ISO date | End of reporting period |
| `period` | enum | Grouping period (`daily`, `weekly`, `monthly`) |

---

## Rate Limiting

| Layer | Scope | Limit |
|-------|-------|-------|
| NGINX | General API (per IP) | 30 requests/second (burst 20) |
| NGINX | Auth endpoints (per IP) | 5 requests/second (burst 5) |
| NestJS | Per client | 100 requests per 60 seconds |
| Application | OTP per phone | Max 3 requests per 10 minutes |

Rate-limited responses return HTTP `429 Too Many Requests`.

Exempt endpoints: health checks, payment webhooks.

---

## Error Codes

| HTTP Status | Meaning |
|-------------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request — validation error (check `errors` array) |
| 401 | Unauthorized — missing or invalid token |
| 403 | Forbidden — insufficient role for this endpoint |
| 404 | Not Found — resource does not exist |
| 409 | Conflict — duplicate resource (e.g., existing review, duplicate OTP) |
| 429 | Too Many Requests — rate limited |
| 500 | Internal Server Error |
| 503 | Service Unavailable — dependency down (readiness check) |

---

## Data Types

### Currency Values
All monetary amounts are transmitted as **strings** representing BigInt values in the smallest currency unit:
- **CDF**: centimes (1 CDF = 100 centimes). Example: `"15000000"` = 150,000 CDF
- **USD**: cents (1 USD = 100 cents). Example: `"5000"` = 50.00 USD

### Multilingual Fields
Translatable text fields use JSON format:
```json
{
  "fr": "Texte en francais",
  "en": "Text in English"
}
```

### UUIDs
All entity IDs are UUIDs v4. Example: `"30000000-0000-0000-0000-000000000001"`

### Phone Numbers
International format with country code: `"+243XXXXXXXXX"`

### Dates
ISO 8601 format: `"2026-02-28T12:00:00.000Z"`
