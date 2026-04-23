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

All endpoints require a valid JWT access token via `Authorization: Bearer <token>` header or `teka_access_token` httpOnly cookie, unless marked as **Public**.

Token lifecycle:
- Access token: 15-minute expiry
- Refresh token: 7-day expiry (stored as httpOnly cookie `teka_refresh_token`)
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

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/auth/otp/request` | Public | Request SMS OTP for a phone number (via Orange DRC SMS) |
| POST | `/v1/auth/otp/request-email` | Public | **User-initiated** email OTP fallback for buyers |
| POST | `/v1/auth/otp/verify` | Public | Verify OTP code |
| POST | `/v1/auth/register` | Public | Register buyer account via phone OTP + name |
| POST | `/v1/auth/login` | Public | Login buyer/admin with phone + OTP code. Returns `409 SELLER_MIGRATION_REQUIRED` for phone-only sellers |
| POST | `/v1/auth/register/email` | Public | Register with email + password |
| POST | `/v1/auth/login/email` | Public | Login with email + password (sellers, admins, optional buyers) |
| POST | `/v1/auth/login/google` | Public | Exchange a Google `idToken` for cookies (upsert/link by email or googleId) |
| POST | `/v1/auth/password-reset/request` | Public | Always 200 — no enumeration. Sends reset link if account exists |
| POST | `/v1/auth/password-reset/confirm` | Public | Consume reset token + set new password; revokes all refresh tokens |
| POST | `/v1/auth/seller/migrate-check` | Public | Step 1 of seller migration. Returns `email_setup_sent` / `email_required` / `already_migrated` |
| POST | `/v1/auth/seller/migrate-link-email` | Public | Seller with no email on file verifies via phone OTP and associates an email |
| POST | `/v1/auth/seller/setup-password` | Public | Consume 24h setup JWT, sets hash, issues cookies |
| POST | `/v1/auth/refresh` | Public | Refresh tokens. Replay-safe: revokes all tokens on replay |
| POST | `/v1/auth/logout` | Bearer | Logout and invalidate refresh token |
| GET | `/v1/auth/me` | Bearer | Get current user profile |
| POST | `/v1/auth/email/send-verification` | Bearer | Send email verification link |
| GET | `/v1/auth/email/verify?token=...` | Public | Verify email from link |

### Request OTP
```json
POST /v1/auth/otp/request
{
  "phone": "+243XXXXXXXXX"
}
```
Rate limited: max 3 requests per phone per 10 minutes.

### Verify OTP
```json
POST /v1/auth/otp/verify
{
  "phone": "+243XXXXXXXXX",
  "code": "123456"
}
```

### Register
```json
POST /v1/auth/register
{
  "phone": "+243XXXXXXXXX",
  "firstName": "Jean",
  "lastName": "Mukendi",
  "otpCode": "123456"
}
```

### Refresh Token
```json
POST /v1/auth/refresh
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```
Also accepts refresh token from `teka_refresh_token` cookie.

### Email OTP fallback (buyers)
```json
POST /v1/auth/otp/request-email
{ "phone": "+243XXXXXXXXX" }
```
User-initiated from the OTP waiting screen when SMS delivery is unreliable.
Requires an email to be on file. Returns `400 { error: { code: "NO_EMAIL_ON_FILE" } }` otherwise.

### Email + password
```json
POST /v1/auth/register/email
{ "email": "vendeur@example.com", "password": "Secret123", "firstName": "Jean", "lastName": "Mukendi" }

POST /v1/auth/login/email
{ "email": "vendeur@example.com", "password": "Secret123" }
```
Password rules: min 8 / max 72 characters, at least one letter + one digit.
Error messages are generic to avoid user enumeration (`"Email ou mot de passe invalide"`).

### Password reset
```json
POST /v1/auth/password-reset/request
{ "email": "vendeur@example.com" }
// Response: always 200 — "Si un compte existe, un email de réinitialisation a été envoyé."

POST /v1/auth/password-reset/confirm
{ "token": "<raw token from email link>", "newPassword": "NewSecret123" }
```
Token TTL controlled by `PASSWORD_RESET_EXPIRY_MINUTES` (default 60).
On confirm, all of the user's refresh tokens are revoked and `authProvider` is set to `EMAIL_PASSWORD`.

### Google OAuth
```json
POST /v1/auth/login/google
{ "idToken": "<Google id_token>" }
```
Backend verifies via `google-auth-library` against `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`.
Upsert order: match by `googleId` → link by `email` (only if Google marks `email_verified=true`) → create new user with `authProvider=GOOGLE`, `role=BUYER`.

### Seller migration (existing phone-only sellers)
```json
POST /v1/auth/seller/migrate-check
{ "email": "vendeur@example.com" }
// → { "migration": "email_setup_sent" }
// or { "migration": "email_required", "maskedPhone": "+243*******23" }
// or { "migration": "already_migrated" }

// If email_required — seller verifies phone + attaches email
POST /v1/auth/seller/migrate-link-email
{ "phone": "+243XXXXXXXXX", "code": "123456", "email": "vendeur@example.com" }
// → { "migration": "email_setup_sent" }

// User clicks the email link and lands on the password-setup page
POST /v1/auth/seller/setup-password
{ "token": "<24h seller_password_setup JWT>", "password": "NewSecret123" }
// → { "user": {...}, "tokens": {...} } (also sets httpOnly cookies)
```
Setup token TTL controlled by `SELLER_SETUP_EXPIRY_HOURS` (default 24).

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

## Browse (Public) — `/v1/browse`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/browse/categories` | Public | Category tree (cached 1hr) |
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
  "paymentMethod": "MOBILE_MONEY",
  "notes": "Appelez avant la livraison"
}
```

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
| POST | `/v1/payments/initiate` | Buyer | Initiate Mobile Money payment |
| GET | `/v1/payments/orders/:orderId/transactions` | Bearer | Get transactions for an order |
| GET | `/v1/payments/transactions` | Admin | List all transactions (paginated) |
| POST | `/v1/payments/webhook/flexpay` | Public | Flexpay webhook callback (signature verified) |

### Initiate Payment
```json
POST /v1/payments/initiate
{
  "orderId": "70000000-...",
  "mobileMoneyProvider": "MPESA",
  "payerPhone": "+243XXXXXXXXX"
}
```

Supported providers: `MPESA`, `AIRTEL_MONEY`, `ORANGE_MONEY`

The webhook endpoint (`/v1/payments/webhook/flexpay`) is:
- Public (no JWT required)
- Rate-limit exempt (`@SkipThrottle()`)
- Verifies `x-flexpay-signature` header
- Idempotent (checks `externalReference` to prevent duplicate processing)

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

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/v1/sellers/wallet` | Seller | Get wallet summary (balance, pending, paid) |
| GET | `/v1/sellers/earnings` | Seller | List earnings history (paginated) |
| GET | `/v1/sellers/payouts` | Seller | List payout history (paginated) |
| POST | `/v1/sellers/payouts` | Seller | Request a payout to Mobile Money |

### Request Payout
```json
POST /v1/sellers/payouts
{
  "amount": "5000000",
  "currency": "CDF",
  "mobileMoneyProvider": "MPESA",
  "mobileMoneyPhone": "+243XXXXXXXXX"
}
```

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
| GET | `/v1/wishlist` | Buyer | Get wishlist (paginated) |
| POST | `/v1/wishlist/:productId` | Buyer | Add to wishlist (idempotent) |
| DELETE | `/v1/wishlist/:productId` | Buyer | Remove from wishlist (idempotent) |
| GET | `/v1/wishlist/check?productIds=id1,id2` | Buyer | Batch check which products are wishlisted |
| GET | `/v1/wishlist/:productId/status` | Buyer | Check if specific product is in wishlist |

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
| GET | `/v1/admin/sellers/applications` | ADMIN | List seller applications (status filter) |
| GET | `/v1/admin/sellers/applications/:id` | ADMIN | Get application detail |
| PATCH | `/v1/admin/sellers/applications/:id` | ADMIN | Approve or reject application |

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
| GET | `/v1/admin/stats` | ADMIN | Dashboard KPIs (GMV, orders, users, revenue) |
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
| PUT | `/v1/admin/commission-settings` | ADMIN | Set/update global commission rate |
| PUT | `/v1/admin/commission-settings/:categoryId` | ADMIN | Set/update category-specific commission |
| DELETE | `/v1/admin/commission-settings/:categoryId` | ADMIN | Remove category commission override |

### Admin Payouts — `/v1/admin/payouts`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/v1/admin/payouts` | ADMIN | List all payouts (paginated) |
| GET | `/v1/admin/payouts/:id` | ADMIN | Get payout detail |
| POST | `/v1/admin/payouts/:id/approve` | ADMIN | Approve payout |
| POST | `/v1/admin/payouts/:id/reject` | ADMIN | Reject payout (reason required) |

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
