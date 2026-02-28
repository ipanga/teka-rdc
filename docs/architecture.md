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
                    └──┬─────┬──┘       │  Resend (Email)       │
                       │     │          └───────────────────────┘
              ┌────────┘     └────────┐
              │                       │
       ┌──────▼──────┐       ┌────────▼───────┐
       │ PostgreSQL  │       │     Redis      │
       │  (Cloud)    │       │  (Docker)      │
       │  Prisma ORM │       │  Cache / OTP   │
       │  Migrations │       │  Rate Limits   │
       └─────────────┘       └────────────────┘


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
| **PostgreSQL** | Cloud-hosted (Neon/Supabase) | 5432 | Primary relational database |
| **Redis** | redis:7-alpine (Docker) | 6379 | Cache, OTP storage, rate limiting, session data |

> **Port restrictions**: Ports 3000 and 4000 are never used (reserved for other local services).

## Data Flow

### Authentication (Phone OTP — Primary Flow)

```
1. Client → POST /api/v1/auth/otp/request { phone: "+243XXXXXXXXX" }
2. API generates 6-digit OTP, stores in Redis (5min TTL, max 3 attempts)
3. API sends OTP via Africa's Talking SMS
4. Client → POST /api/v1/auth/otp/verify { phone, code }
5. API validates OTP against Redis, creates/finds User
6. API returns JWT access token (15min) + refresh token (7d)
7. Refresh token hash stored in DB for rotation/revocation
8. Tokens also set as httpOnly cookies (teka_access_token, teka_refresh_token)
```

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

## Caching Strategy (Redis)

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `otp:{phone}` | 5min | OTP code + attempt counter |
| `otp:rate:{phone}` | 10min | OTP rate limiting (max 3 per 10min) |
| `browse:categories` | 1hr | Category tree response |
| `browse:product:{id}` | 5min | Product detail response |
| `banners:active` | 5min | Active homepage banners |
| `settings:{key}` | 1min | Individual system settings |
| `settings:public` | 1min | Public-facing settings bundle |
| `content:{slug}` | 15min | Published content pages |
| `promotions:active` | 5min | Active promotions list |
| `flash_deals:active` | 2min | Active flash deals (shorter TTL for time-sensitivity) |
| `admin:stats` | 5min | Dashboard KPI aggregations |
| `admin:trends:{period}` | 10min | Dashboard trend chart data |

Cache invalidation is performed on write operations (create, update, delete) for the relevant entities.

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

### Web Applications
- **Library**: next-intl
- **Default locale**: French (`fr`)
- **Supported locales**: French (`fr`), English (`en`)
- **URL structure**: `/{locale}/...` (e.g., `/fr/products`, `/en/products`)
- **Translation files**: `messages/fr.json` and `messages/en.json` in each web app

### Mobile Applications
- **Library**: flutter_localizations + custom ARB files
- **Locale detection**: Device locale with fallback to French

### API
- **Error messages**: French by default
- **Translatable content**: Stored as JSON `{ "fr": "...", "en": "..." }` in database
- **Content negotiation**: Accept-Language header respected where applicable

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
| **Africa's Talking** | SMS OTP, order notifications | Fire-and-forget with inner try-catch; failures logged but don't block operations |
| **Flexpay** | Mobile Money payment (M-Pesa, Airtel Money, Orange Money) | Async webhook; payment status polled if webhook delayed |
| **Resend** | Transactional emails (verification, receipts) | Fire-and-forget; email is optional for most flows |

All external service calls use the fire-and-forget notification pattern with inner try-catch blocks and outer `.catch()` at call sites to prevent cascading failures.

## Development Ports

| Service | Port |
|---------|------|
| buyer-web | 5000 |
| seller-web | 5100 |
| admin-web | 5200 |
| API | 5050 |
| NGINX (dev proxy) | 8080 |
| Redis | 6379 |

> **Never use ports 3000 or 4000** — they are reserved for other local services.

## Key Design Decisions

1. **Cloud PostgreSQL, Dockerized Redis**: Database is too critical for local Docker volumes; Redis is ephemeral cache that rebuilds automatically.

2. **Polling over WebSocket for chat**: More resilient on unstable 2G/3G connections in DRC. Reconnection logic is simpler and more reliable.

3. **BigInt for money**: All CDF amounts stored in centimes as BigInt to avoid floating-point precision issues. Serialized as strings in API responses.

4. **JSON for translations**: Multilingual fields stored as JSON columns rather than separate translation tables, reducing query complexity.

5. **One Order per seller**: Multi-seller cart creates separate orders per seller, enabling independent fulfillment and seller-specific delivery fee calculation.

6. **Phone-first, email-optional**: Reflects DRC reality where most users lack email but all have phone numbers.

7. **Denormalized ratings**: `avgRating` and `totalReviews` stored directly on `Product` and `SellerProfile` tables, updated atomically in Prisma transactions on review create/delete/hide/unhide.

8. **Payment provider abstraction**: `PaymentProvider` interface allows swapping between mock (development) and real (Flexpay) providers via `PAYMENT_MOCK_MODE` config.
