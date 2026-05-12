# Teka RDC — System Architecture

## Overview

Teka RDC is a multi-tenant e-commerce marketplace for the Democratic Republic of Congo, built as a pnpm monorepo with 7 deployable services. The platform connects buyers and sellers in Haut-Katanga and Lualaba provinces, with architecture designed for expansion to other regions.

```
                    ┌──────────────────┐
                    │     Clients      │
                    │  (Browser, App)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │      NGINX       │
                    │  (Port 80/443)   │
                    │  SSL Termination │
                    │  Rate Limiting   │
                    │  Gzip + Headers  │
                    └──┬───┬───┬───┬──┘
                       │   │   │   │
         ┌─────────────┘   │   │   └─────────────┐
         │                 │   │                  │
    ┌────▼─────┐    ┌─────▼───▼───┐        ┌─────▼──────┐
    │buyer-web │    │ seller-web  │        │ admin-web  │
    │Port 5000 │    │ Port 5100   │        │ Port 5200  │
    │Next.js 15│    │ Next.js 15  │        │ Next.js 15 │
    │Tailwind  │    │ Tailwind    │        │ ShadCN UI  │
    └──────────┘    └─────────────┘        └────────────┘
                          │
                    ┌─────▼──────┐       ┌───────────────────────┐
                    │    API     │       │   External Services   │
                    │ Port 5050  │──────►│  Cloudinary (Images)  │
                    │ NestJS 11  │       │  Africa's Talking SMS │
                    │ Prisma 6   │       │  Flexpay (Mobile $)   │
                    └──────┬────┘       │  Resend (Email)       │
                           │            └───────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ PostgreSQL  │
                    │  (Cloud)    │
                    │  Prisma ORM │
                    │  Migrations │
                    └─────────────┘


    ┌─────────────────┐     ┌──────────────────┐
    │  buyer-mobile   │     │  seller-mobile   │
    │  Flutter/Dart   │     │  Flutter/Dart    │
    │  Riverpod       │────►│  Riverpod        │
    │  Android 8+     │     │  Android 8+      │
    └─────────────────┘     └──────────────────┘
            │                        │
            └────────────────────────┘
                         │
              Connects to API via HTTPS
```

## Monorepo Structure

```
teka-rdc/
├── apps/
│   ├── api/                 # NestJS 11 backend
│   ├── buyer-web/           # Next.js 15 buyer storefront
│   ├── seller-web/          # Next.js 15 seller dashboard
│   ├── admin-web/           # Next.js 15 admin panel
│   ├── buyer-mobile/        # Flutter consumer app
│   └── seller-mobile/       # Flutter seller app
├── packages/
│   └── shared/              # @teka/shared — types, constants, Zod validators
├── nginx/
│   ├── nginx.conf           # Development proxy config
│   └── nginx.prod.conf      # Production proxy with SSL + security headers
├── docker-compose.yml       # Development environment
├── docker-compose.prod.yml  # Production environment
├── pnpm-workspace.yaml      # Workspace definition
└── .env.development         # Development environment variables
```

## Service Architecture

| Service | Technology | Port (Dev) | Role |
|---------|-----------|------------|------|
| **NGINX** | nginx:alpine | 8080 (dev) / 80+443 (prod) | Reverse proxy, SSL termination, rate limiting, gzip, security headers |
| **API** | NestJS 11 + Prisma 6 | 5050 | REST API, business logic, authentication, payments, notifications |
| **buyer-web** | Next.js 15 + Tailwind v4 | 5000 | Consumer storefront with SSR, i18n, PWA support |
| **seller-web** | Next.js 15 + Tailwind v4 | 5100 | Seller dashboard (basePath: `/seller`) |
| **admin-web** | Next.js 15 + ShadCN UI | 5200 | Admin panel with charts and data tables (basePath: `/admin`) |
| **buyer-mobile** | Flutter + Riverpod + go_router | N/A | Android consumer app (primary user interface) |
| **seller-mobile** | Flutter + Riverpod + go_router | N/A | Android seller management app |
| **PostgreSQL** | Cloud-hosted (Neon/Supabase) | 5432 | Primary relational database (includes OTP storage) |

> **Port restrictions**: Ports 3000 and 4000 are never used (reserved for other local services).

## Data Flow

### Authentication — overview

Teka RDC uses **email + password for all roles** (buyers, sellers, admins) since the May 2026 refactor. `User.authProvider` is `EMAIL_PASSWORD` for all new accounts. The legacy `PHONE_OTP` and `GOOGLE` enum values still appear on existing accounts created before May 2026 (buyers) or April 2026 (Google), but no code path creates new ones.

| Role | Registration | Login |
|---|---|---|
| **Buyer** | `POST /v1/auth/register/buyer` | `POST /v1/auth/login/email` |
| **Seller** | `POST /v1/auth/register/email` | `POST /v1/auth/login/email` |
| **Admin** | Seeded out-of-band (see `docs/deployment.md § 5b`) | `POST /v1/auth/login/email` |

All three roles authenticate through the same email-login endpoint, the same password-reset flow (`/v1/auth/password-reset/{request, confirm}`), and the same `generateTokens` helper. Refresh-token replay detection and cookie semantics (`teka_access_token`, `teka_refresh_token`) are uniform across roles.

`User.phone` is `String? @unique`. Email-registered users have `phone = null` until they add one via the address / profile screen.

### Removed auth endpoints (all return 404)

The following were retired in earlier refactors and explicitly assert 404 in `apps/api/test/auth.e2e-spec.ts` so a regression that re-adds them is caught:

- `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify` — phone-OTP request/verify (May 2026).
- `POST /v1/auth/register` — phone+OTP buyer register (May 2026).
- `POST /v1/auth/login` — phone+OTP login (May 2026).
- `POST /v1/auth/login/google` — Google OAuth (April 2026).
- `POST /v1/auth/otp/request-email` — email-OTP fallback (April 2026).

### Authentication — Email + password flow

```
1. POST /v1/auth/register/buyer  (or /register/email for sellers)
     { email, password, firstName, lastName }
   → bcrypt hash (BCRYPT_ROUNDS=12 default), User created with role assigned
     server-side based on endpoint, authProvider=EMAIL_PASSWORD, phone=null
   → Verification email dispatched via Resend (fire-and-forget — soft
     verification, user is logged in immediately)

2. POST /v1/auth/login/email { email, password }
   → Generic error "Email ou mot de passe invalide" on any failure
     (constant-time, no user enumeration)
   → Suspended/banned accounts: 403

3. Forgot password:
   POST /v1/auth/password-reset/request { email } — always 200
   → PasswordResetToken row (sha256 hash of raw token) with 60min TTL
   → Reset link emailed (BUYER_WEB_URL / SELLER_WEB_URL / ADMIN_WEB_URL
     chosen by user.role)

4. POST /v1/auth/password-reset/confirm { token, newPassword }
   → Atomic: update hash + revoke all refresh tokens + consume reset token +
     flip authProvider to EMAIL_PASSWORD + emailVerified=true
```

### Authentication — Migration flows (legacy PHONE_OTP → EMAIL_PASSWORD)

Both buyer and seller migration use the same shape; the OTP step that existed in the original seller migration was removed when OTP infrastructure was deleted. The chosen email is stashed on `{Buyer,Seller}Migration.tempEmail` and only committed to `User.email` when the setup link is clicked (limits hijack risk for a stolen phone number).

```
Buyer migration:
1. POST /v1/auth/buyer/migrate-check { phone: "+243XXXXXXXXX" }
   → { migration: 'needs_email_setup' | 'already_migrated' | 'unknown' }
2. POST /v1/auth/buyer/migrate-link-email { phone, email }
   → BuyerMigration.tempEmail = email; sendBuyerSetupEmail(email, 24h JWT)
   → { migration: 'email_setup_sent' } (neutral 200 regardless of existence)
3. User clicks email → /setup-password?token=...
4. POST /v1/auth/buyer/setup-password { token, password }
   → Transaction: set User.email = tempEmail, passwordHash, passwordSetAt,
     authProvider=EMAIL_PASSWORD, emailVerified=true; clear tempEmail;
     mark BuyerMigration.setupCompleted; revoke all refresh tokens; issue cookies.

Seller migration mirrors this exactly with /v1/auth/seller/{migrate-check,
migrate-link-email, setup-password}.
```

### Phone-input UX (address + delivery contact)

Phone is no longer collected at registration. It is still collected on the **address / delivery-contact / seller-profile** surfaces. Users type 9 digits of their DRC number (or 10 with leading `0`); the `+243` prefix is added by the system before calling the API. Single source of truth: `normalizeDrcPhone()` in `packages/shared/src/utils/phone.ts` (web) and `apps/buyer-mobile/lib/core/utils/phone.dart` (Flutter). Backend DTOs that accept phone enforce `^\+243\d{9}$`.

### SMS provider abstraction (notification-only)

SMS is no longer used for authentication. The `SmsService` + provider abstraction stays alive for **order status notifications, payment confirmations, and admin broadcasts**.

```
apps/api/src/sms/
├── interfaces/sms-provider.interface.ts   (SmsProvider { sendSms(phone, msg) })
├── providers/
│   ├── orange-drc.provider.ts             (OAuth2 token cache, 401 → invalidate + retry once)
│   ├── africas-talking.provider.ts        (legacy, kept for rollback)
│   └── mock-sms.provider.ts               (dev + test — logs to console)
├── sms.service.ts                         (facade; builds French message, dispatches)
└── sms.module.ts                          (DI factory keyed on SMS_PROVIDER env)
```
Mirrors the existing `payments/interfaces/payment-provider.interface.ts` pattern.


### Product Lifecycle

```
1. Seller creates product → POST /api/v1/sellers/products
   - Status: DRAFT (not visible to buyers)
2. Seller uploads images → POST /api/v1/sellers/products/:id/images
   - Image sent to Cloudinary, URL stored in ProductImage table
3. Seller submits for review → PATCH /api/v1/sellers/products/:id/submit
   - Status: PENDING_REVIEW
4. Admin reviews → PATCH /api/v1/admin/products/:id/approve (or /reject)
   - Status: ACTIVE (visible) or REJECTED
5. Buyer browses → GET /api/v1/browse/products (only ACTIVE products returned)
```

### Checkout Flow

```
1. Buyer adds items to cart → POST /api/v1/cart/items
   - Cart persisted in DB for logged-in users
2. Buyer initiates checkout → POST /api/v1/checkout
   - Validates stock availability for all cart items
   - Calculates delivery fees per seller zone (from/to town matching)
   - Creates one Order per seller (multi-seller cart → multiple orders)
   - Decrements stock atomically in Prisma transaction
   - Returns order IDs + payment details
3. Payment:
   a. Mobile Money → POST /api/v1/payments/initiate { orderId, provider, payerPhone }
      - Flexpay USSD push sent to buyer's phone
   b. Cash on Delivery → Order marked as COD, no payment initiation needed
4. On payment confirmation (webhook or COD):
   - Order status → CONFIRMED
   - Seller notified via SMS (Africa's Talking)
   - Seller earnings calculated (sale amount - platform commission)
```

### Payment Webhook (Mobile Money)

```
1. Flexpay → POST /api/v1/payments/webhook/flexpay (public, rate-limit exempt)
2. API verifies webhook signature (x-flexpay-signature header)
3. Checks idempotency via Transaction.externalReference
4. Updates Transaction status and Order paymentStatus
5. On success:
   - Triggers SellerEarning creation (orderAmount - commission)
   - Updates SellerProfile.walletBalance
   - Sends SMS notification to seller
6. Returns { received: true, processed: true }
```

### Order State Machine

```
PENDING → CONFIRMED → PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
   │          │           │           │              │
   └──────────┴───────────┴───────────┴──────────────┘
                           │
                       CANCELLED
                           │
                       RETURNED
```

Each transition is logged in the `OrderStatusLog` table with timestamp, actor (buyer/seller/admin), and optional note. SMS notifications are sent at each stage via fire-and-forget pattern.

## Database Schema (Key Entities)

### Core Tables

| Table | Purpose |
|-------|---------|
| **User** | Phone (+243), email (optional), role (BUYER/SELLER/ADMIN/SUPPORT), status, passwordHash |
| **SellerProfile** | Shop name, description (JSON i18n), avgRating, totalReviews, walletBalance (BigInt) |
| **Category** | Tree structure via parentCategoryId, name (JSON i18n), emoji, slug |
| **CategoryAttribute** | Dynamic attributes per category (e.g., "Size", "Color") |
| **Product** | Title/description (JSON i18n), priceCDF/priceUSD (BigInt), stock, condition, status |
| **ProductImage** | Cloudinary URLs, position ordering, cover flag |
| **Address** | Town + neighborhood + avenue (no postal codes), isDefault flag |

### Commerce Tables

| Table | Purpose |
|-------|---------|
| **Cart / CartItem** | Persistent cart for logged-in users |
| **Order** | State machine, buyerId, sellerId, delivery address, payment method |
| **OrderItem** | Snapshot of product at time of purchase (price, quantity) |
| **OrderStatusLog** | Audit trail for every state transition |
| **Transaction** | Payment records with externalReference for idempotency |
| **SellerEarning** | Per-order earnings (saleAmount - commissionAmount) |
| **Payout** | Seller payout requests (PENDING → APPROVED → COMPLETED / REJECTED) |
| **CommissionSetting** | Global rate + category overrides |
| **DeliveryZone** | Town-to-town delivery fee configuration |

### Social Tables

| Table | Purpose |
|-------|---------|
| **Review** | 1-5 stars + text, verified buyer only, soft-deletable, hideable by admin |
| **Wishlist** | Buyer's saved products |
| **Conversation** | Buyer-seller messaging thread |
| **Message** | Individual messages within a conversation |

### Platform Tables

| Table | Purpose |
|-------|---------|
| **Banner** | Homepage banners with scheduling (SCHEDULED/ACTIVE/EXPIRED) |
| **Promotion** | Discount codes, flash deals with approval workflow |
| **ContentPage** | CMS pages (FAQ, terms, privacy) with multilingual content |
| **SystemSetting** | Key-value platform configuration |
| **Broadcast** | SMS/notification mass broadcasts |

### Data Conventions

- **Primary keys**: UUIDs (v4) for all tables
- **Soft deletes**: `deletedAt` timestamp on all major entities
- **Timestamps**: `createdAt` + `updatedAt` on every table
- **Multilingual fields**: JSON columns `{ "fr": "...", "en": "..." }`
- **Money**: BigInt in centimes (CDF) or cents (USD) — never floating point
- **Phone numbers**: International format `+243XXXXXXXXX`

### Seed UUID Ranges

Deterministic UUIDs are used in seed data for consistency:

| Range | Entity |
|-------|--------|
| `10000000-*` | Users |
| `20000000-*` | Categories |
| `30000000-*` | Products |
| `40000000-*` | Addresses |
| `50000000-*` | Seller profiles |
| `60000000-*` | Delivery zones |
| `70000000-*` | Orders / Carts |
| `80000000-*` | Order items |
| `90000000-*` | Status logs |
| `a0000000-*` | Commission settings |
| `b0000000-*` | Transactions |
| `c0000000-*` | Earnings |
| `d0000000-*` | Payouts |
| `e0000000-*` | Reviews |
| `e1000000-*` | Wishlists |
| `e2000000-*` | Conversations |
| `e3000000-*` | Messages |

## OTP Storage (PostgreSQL)

OTP codes and rate limiting are stored in PostgreSQL tables:

| Table | Purpose |
|-------|---------|
| `otps` | OTP code + attempt counter, with `expiresAt` for automatic expiry |
| `otp_rate_limits` | Rate limiting entries (max 3 per 10min window), with `expiresAt` |

Expired entries are cleaned up on each OTP request. This approach eliminates the need for Redis while maintaining the same security guarantees.

## Security Model

### Authentication
- **JWT Access Token**: 15-minute expiry, signed with `JWT_SECRET`
- **JWT Refresh Token**: 7-day expiry, signed with `JWT_REFRESH_SECRET`
- **Token Storage**: httpOnly cookies (`teka_access_token`, `teka_refresh_token`) + response body
- **Refresh Rotation**: Old refresh token hash is replaced on each refresh
- **Password Hashing**: bcrypt (for optional email+password auth)

### Authorization
- **Role-based guards**: `@Roles('ADMIN')`, `@Roles('SELLER')`, `@Roles('BUYER')`
- **Supported roles**: BUYER, SELLER, ADMIN, SUPPORT
- **Public endpoints**: Decorated with `@Public()` to bypass JWT guard
- **Resource ownership**: Verified at service level (e.g., seller can only modify own products)

### Rate Limiting

| Layer | Scope | Limit |
|-------|-------|-------|
| NGINX | General API per IP | 30 req/s (burst 20) |
| NGINX | Auth endpoints per IP | 5 req/s (burst 5) |
| NestJS ThrottlerModule | Per client | 100 req/60s |
| Application | OTP per phone | Max 3 per 10 minutes |

### Input Validation
- **DTOs**: `class-validator` + `class-transformer` with `whitelist: true` and `forbidNonWhitelisted: true`
- **Global pipe**: `ValidationPipe` on all endpoints
- **File uploads**: Max 5MB, validated MIME types, processed through Cloudinary

### Security Headers (Production NGINX)
- HSTS (2-year max-age, includeSubDomains, preload)
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Content-Security-Policy (restricts script, style, image, font, and connection sources)
- Referrer-Policy: strict-origin-when-cross-origin

### Additional Protections
- **Helmet.js**: Applied at NestJS application level
- **CORS**: Restricted to configured frontend origins
- **Payment webhooks**: Signature verification + idempotency keys
- **Sensitive data**: Password hashes, tokens, and internal IDs stripped from API responses

## API Design

### Response Envelope

All API responses follow a standard envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "status": 400,
    "message": "Description de l'erreur",
    "errors": ["field-specific errors"]
  }
}
```

### Pagination
- **Browse endpoints** (products, reviews): Cursor-based pagination (`cursor` + `limit`)
- **Admin endpoints** (users, orders, reports): Offset-based pagination (`page` + `limit`)

### Versioning
- All endpoints prefixed with `/api/v1/`
- Global prefix `api` set in NestJS, controllers use `v1/` prefix

## i18n (Internationalization)

**Note (2026-04-25):** Teka RDC is now **monolingual — French only**. The infrastructure is preserved for future re-introduction of additional locales: next-intl is still used for translation lookups (`messages/fr.json`), DB JSONB columns keep their `{ fr, en }` shape (API contract preserved), and `flutter_localizations` infra stays in place on mobile. The user-facing surface (URLs, language switcher, hreflang) is FR-only.

### Web Applications
- **Library**: next-intl (single locale)
- **Locales**: `['fr']` only; `localePrefix: 'never'`; `localeDetection: false`
- **URL structure**: no locale prefix. Routes look like `/products/<slug>`, `/categorie/<slug>`, `/a-propos`, etc.
- **Translation files**: `messages/fr.json` only in each web app
- **Language switcher**: removed
- **Hreflang**: not emitted (no alternate languages)

### Buyer-web static-page slugs
The 8 static info pages live in the DB under English **canonical** slugs but are exposed in the URL via French slugs for SEO:

| Canonical (DB) | URL |
|---|---|
| `about` | `/a-propos` |
| `help` | `/aide` |
| `faq` | `/faq` |
| `terms` | `/conditions-utilisation` |
| `privacy` | `/politique-confidentialite` |
| `how-to-buy` | `/comment-acheter` |
| `how-to-sell` | `/comment-vendre` |
| `contact` | `/contact` |

Mapping lives in `apps/buyer-web/src/lib/static-pages.ts` (`PAGE_DEFINITIONS`). All 8 pages are pre-rendered at build time via `generateStaticParams`. 301 redirects in `next.config.ts` cover legacy `/pages/<slug>` paths, English-canonical-slug typos, and a wildcard `/en/:path*` → `/:path*` for any old bilingual-era links. The content API (`GET /v1/content/:slug`) keys on the canonical slug only; URL-to-canonical resolution happens in the buyer-web route handler before any API call.

### Category URLs
Categories are served at `/categorie/<slug>` (e.g. `/categorie/smartphones`, `/categorie/maison-et-interieur`). Slugs are derived from the French category name at seed time (`frSlugify()` in `apps/api/prisma/seed.ts`) and stored in `Category.slug` (unique, indexed). The browse endpoint `GET /v1/browse/categories/:identifier` accepts either a UUID or a slug, so admin-stored category references (e.g. banner `linkTarget`) keep working.

The legacy `/categories/<id>` route is kept as a tiny server-side **308 redirect** to `/categorie/<slug>` — this preserves any external citations (Google index, social shares) from the pre-slug period.

### Sample product catalog (always-seeded)
Every fresh install gets a "**Teka RDC Officiel**" platform-owned seller plus **152 sample products** (38 active subcategories × 2 cities — Lubumbashi + Kolwezi — × 2 variants per slot). Both are upserted by the seed (idempotent) and exist in dev + prod. Purpose: SEO content (real product URLs to crawl) and first-time-user demo (the marketplace doesn't look empty on day 1). Seeded products use Cloudinary demo placeholder images; replace by uploading real assets to the `teka-rdc` Cloudinary cloud and updating `seedSampleProducts()`.

### SEO surface
- **Sitemap**: dynamic at `/sitemap.xml` (Next.js `app/sitemap.ts`). FR-only URLs: home, categories + subcategories (slug-based), cities, products (top 500 by recency), and the 8 static-page URLs.
- **robots.txt**: dynamic at `/robots.txt` (Next.js `app/robots.ts`). Disallows `/checkout`, `/cart`, `/orders`, `/messages`, `/login`, `/register`, `/profile`, `/wishlist`. Points crawlers at the sitemap.
- **hreflang**: not emitted (monolingual site).
- **JSON-LD**: Organization + WebSite (with SearchAction) on home; WebPage on each static page; BreadcrumbList on category + product detail pages.

### Mobile Applications
- **Library**: `flutter_localizations` + ARB files (FR only since 2026-04-25)
- **Locale**: hardcoded to `Locale('fr')` via `LocaleNotifier` (state never changes; `setLocale` is a no-op)

### API
- **Error messages**: French
- **Translatable content**: still stored as JSON `{ "fr": "...", "en": "..." }` in database (API contract preserved); the EN keys are dormant but kept for future re-internationalization
- **Content negotiation**: not used; clients read the `fr` key directly

## Messaging Architecture

Buyer-seller messaging uses a polling-based approach (more resilient for DRC's 2G/3G networks than WebSockets):

| Context | Poll Interval | Purpose |
|---------|---------------|---------|
| Active chat view | 10 seconds | New messages in current conversation |
| Badge/notification | 30 seconds | Unread message count across all conversations |

Messages are stored in `Conversation` + `Message` tables. Each conversation links one buyer and one seller. Read status is tracked per-conversation with `markAsRead` endpoint.

## External Service Integration

| Service | Purpose | Failure Handling |
|---------|---------|------------------|
| **Cloudinary** | Image upload, transformation (WebP, resize), CDN delivery | Upload fails gracefully; product saved without image |
| **Orange DRC SMS** | Default SMS provider for phone OTP + order notifications | OAuth2 token cache (in-memory), retry-once on 401, fire-and-forget. Selectable via `SMS_PROVIDER=orange\|africas_talking\|mock` env |
| **Africa's Talking** | Legacy SMS provider (rollback fallback) | Same interface as Orange; flip `SMS_PROVIDER=africas_talking` to cut over |
| **Flexpay** | Mobile Money payment (M-Pesa, Airtel Money, Orange Money) | Async webhook; payment status polled if webhook delayed |
| **Resend** | Transactional emails (verification, password reset, seller setup, receipts) | Fire-and-forget; dev mode logs to console instead of sending |

All external service calls use the fire-and-forget notification pattern with inner try-catch blocks and outer `.catch()` at call sites to prevent cascading failures.

## Development Ports

| Service | Port |
|---------|------|
| buyer-web | 5000 |
| seller-web | 5100 |
| admin-web | 5200 |
| API | 5050 |
| NGINX (dev proxy) | 8080 |

> **Never use ports 3000 or 4000** — they are reserved for other local services.

## Key Design Decisions

1. **Cloud PostgreSQL, no Redis**: All data (including OTPs and rate limits) is stored in cloud-hosted PostgreSQL. This simplifies infrastructure and eliminates a separate dependency.

2. **Polling over WebSocket for chat**: More resilient on unstable 2G/3G connections in DRC. Reconnection logic is simpler and more reliable.

3. **BigInt for money**: All CDF amounts stored in centimes as BigInt to avoid floating-point precision issues. Serialized as strings in API responses.

4. **JSON for translations**: Multilingual fields stored as JSON columns rather than separate translation tables, reducing query complexity.

5. **One Order per seller**: Multi-seller cart creates separate orders per seller, enabling independent fulfillment and seller-specific delivery fee calculation.

6. **Phone-first, email-optional**: Reflects DRC reality where most users lack email but all have phone numbers.

7. **Denormalized ratings**: `avgRating` and `totalReviews` stored directly on `Product` and `SellerProfile` tables, updated atomically in Prisma transactions on review create/delete/hide/unhide.

8. **Payment provider abstraction**: `PaymentProvider` interface allows swapping between mock (development) and real (Flexpay) providers via `PAYMENT_MOCK_MODE` config.
