# CLAUDE.md — Teka RDC (teka.cd)

## Project Identity

**Platform:** Teka RDC — A full-featured online e-commerce marketplace for the Democratic Republic of Congo, modeled after Jumia (jumia.cd / jumia.com).
**Domain:** teka.cd
**Default Language:** French (fr) | Secondary: English (en)
**Launch Markets:** Haut-Katanga and Lualaba provinces — specifically Lubumbashi, Likasi, and Kolwezi. Architecture must support future expansion to other provinces and towns without structural refactoring.

---

## 1. CONTEXT & CONSTRAINTS (DR Congo Realities)

Before making ANY architectural or UX decision, internalize these constraints:

- **Unreliable internet:** Most users are on 2G/3G with frequent drops. Pages must be lightweight (<200KB initial payload ideally), images lazy-loaded and aggressively compressed, and API responses paginated and minimal. Consider offline-first patterns for the mobile app (queue actions, sync when online).
- **Low-end devices:** Target Android 8+ devices with 2GB RAM. Avoid heavy JS bundles on web. Flutter apps must be optimized for low memory.
- **Mobile Money is king:** Cash on delivery and Mobile Money (M-Pesa Vodacom, Airtel Money, Orange Money) are the primary payment methods. Card payments are nearly non-existent for the target market. Integrate a Mobile Money aggregation gateway (e.g., Flexpay, MaxiCash, or direct USSD integration). Structure the payment module to easily add new providers.
- **French-only UX (2026-04-25 update):** Teka RDC is monolingual — French only on the user-facing surface. Translation infrastructure is preserved for future re-internationalization: next-intl drives translations from `messages/fr.json`, the DB JSONB columns keep their `{ fr, en }` shape (API contract preserved), `flutter_localizations` infra stays. But: no language switcher, no `/en/` URLs, no hreflang, no `app_en.arb`. To re-add a locale later, bring back the EN message files / ARB and flip `routing.ts` `locales` back to `['fr', 'en']`.
- **Logistics are local:** No national postal system. Delivery is handled by local riders/drivers. Build a simple delivery zone system based on towns/neighborhoods, not postal codes. Support seller self-delivery + platform-managed delivery options.
- **Phone numbers as primary identity:** Most users don't have email. Support phone number (with country code +243) as the primary registration and login method, with email as optional. SMS OTP is the primary verification flow.
- **Power outages:** Users may lose connection mid-transaction. All critical flows (checkout, payment confirmation, order placement) must be idempotent and resumable. Use server-side state machines for order lifecycle.

---

## 2. TECH STACK

### Backend

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js + NestJS | Enterprise-grade, modular, TypeScript-native |
| Database | PostgreSQL | Cloud-hosted (Neon, Supabase, or Railway). Connection string in env files |
| ORM | Prisma | Type-safe queries, migrations, seeding |
| Cache & Queues | Redis | Cloud-hosted (Upstash or Railway). Used for sessions, caching, rate limiting, BullMQ job queues |
| Auth | JWT (access) + Refresh Tokens + SMS OTP | Phone-first auth. Optional email/password. Social login (Google) as stretch goal |
| Media Storage | Cloudinary | Image upload, transformation, CDN delivery. Enforce max upload size (5MB), auto-compress to WebP |
| Email Service | Resend.com | Transactional emails (order confirmations, password resets). Connection vars in env |
| SMS/OTP | Africa's Talking | SMS OTP for auth, order notifications. Connection vars in env |
| Payments | Mobile Money (M-Pesa, Airtel Money, Orange Money) + COD | Use aggregator API (Flexpay/MaxiCash). Abstract behind a PaymentProvider interface for extensibility |
| Reverse Proxy | NGINX | SSL termination, routing to services, rate limiting, gzip |
| Containerization | Docker + Docker Compose | All services containerized for dev. Production uses cloud DB/Redis |
| CI/CD | GitHub Actions | Lint → Test → Build → Deploy pipeline |
| Monitoring | Prometheus + Grafana | Health checks, API latency, error rates, queue depth |

### Frontend

| App | Stack | Port (Dev) |
|---|---|---|
| buyer-web | Next.js 14+ (App Router) + Tailwind CSS | 5000 |
| seller-web | Next.js 14+ (App Router) + Tailwind CSS | 5100 |
| admin-web | Next.js 14+ (App Router) + ShadCN UI + Tailwind CSS | 5200 |
| API | NestJS | 5050 |
| NGINX | Reverse proxy | 8080 |

> **IMPORTANT:** Ports 3000 and 4000 are already in use locally. Never use them.

### Mobile (Flutter)

| App | Notes |
|---|---|
| buyer-mobile | Consumer-facing app. Primary user interface for most customers |
| seller-mobile | Seller dashboard: manage products, orders, earnings |

Both apps target Android first (APK distribution + Play Store). iOS as future phase.

### Container / Folder Structure

```
teka-rdc/
├── CLAUDE.md                    # This file — project context for Claude Code
├── PROGRESS.md                  # Development progress tracker (auto-updated)
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.development
├── .env.production
├── .env.example                 # Template with all required vars documented
├── nginx/
│   └── nginx.conf
├── api/                         # NestJS backend
│   ├── src/
│   ├── prisma/
│   ├── test/
│   ├── Dockerfile
│   └── package.json
├── buyer-web/                   # Next.js buyer frontend
│   ├── src/
│   ├── public/
│   ├── messages/                # i18n: fr.json, en.json
│   ├── Dockerfile
│   └── package.json
├── seller-web/                  # Next.js seller frontend
│   ├── src/
│   ├── public/
│   ├── messages/
│   ├── Dockerfile
│   └── package.json
├── admin-web/                   # Next.js admin frontend
│   ├── src/
│   ├── public/
│   ├── messages/
│   ├── Dockerfile
│   └── package.json
├── buyer-mobile/                # Flutter buyer app
│   └── ...
├── seller-mobile/               # Flutter seller app
│   └── ...
├── shared/                      # Shared types, constants, validation schemas
│   ├── types/
│   ├── constants/
│   └── validators/
└── docs/                        # Architecture decisions, API docs, deployment guides
    ├── architecture.md
    ├── api-reference.md
    ├── deployment.md
    └── phases/                  # Phase-by-phase implementation plans
```

---

## 3. ENVIRONMENT CONFIGURATION

All `.env` files live at the project root:

```bash
# .env.example (document every variable)

# === Database ===
DATABASE_URL=postgresql://user:pass@host:5432/teka_rdc

# === Redis ===
REDIS_URL=redis://user:pass@host:6379

# === Auth ===
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
OTP_EXPIRY_MINUTES=5

# === Cloudinary ===
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# === Resend (Email) ===
RESEND_API_KEY=
EMAIL_FROM=noreply@teka.cd

# === Africa's Talking (SMS) ===
AT_API_KEY=
AT_USERNAME=
AT_SENDER_ID=TekaRDC

# === Payment (Mobile Money) ===
FLEXPAY_API_KEY=
FLEXPAY_MERCHANT_ID=
FLEXPAY_CALLBACK_URL=

# === App URLs ===
API_URL=http://localhost:5050
BUYER_WEB_URL=http://localhost:5000
SELLER_WEB_URL=http://localhost:5100
ADMIN_WEB_URL=http://localhost:5200

# === Misc ===
NODE_ENV=development
APP_NAME=Teka RDC
DEFAULT_LOCALE=fr
SUPPORTED_LOCALES=fr,en
DEFAULT_CURRENCY=CDF
SUPPORTED_CURRENCIES=CDF,USD
DEFAULT_COUNTRY_CODE=+243
```

---

## 4. CORE FEATURES (Jumia Feature Parity)

Implement ALL of the following, organized by user role. Reference Jumia.cd for exact UX flows.

### 4.1 Buyer Features
- **Registration/Login:** Phone (OTP) primary, email optional, Google OAuth optional
- **Homepage:** Featured products, flash deals, categories, banners (admin-managed)
- **Product Browsing:** Category tree navigation, search with filters (price range, category, location, condition, rating), sort (price, popularity, newest)
- **Product Detail Page:** Image gallery, description, specifications, seller info, ratings/reviews, related products, "Add to Cart" / "Buy Now"
- **Shopping Cart:** Add/remove/update quantities, persist cart (logged in = DB, guest = localStorage synced on login)
- **Checkout Flow:** Address selection/creation (town + neighborhood/avenue, no postal codes), delivery method selection, payment method selection (Mobile Money / COD), order summary, place order
- **Payment:** Mobile Money (USSD push or manual pay flow), Cash on Delivery. Idempotent payment confirmation with webhook handling
- **Order Tracking:** Real-time status (Pending → Confirmed → Shipped → Out for Delivery → Delivered / Cancelled / Returned). SMS notifications at each stage
- **Reviews & Ratings:** Post-delivery review with 1-5 stars + text. Only verified buyers can review
- **Wishlist / Saved Items**
- **Notifications:** In-app + SMS for order updates, promotions, price drops
- **User Profile:** Edit name, phone, email, addresses, language preference
- **Help/Support:** FAQ, contact form, WhatsApp link

### 4.2 Seller Features
- **Seller Registration:** Application form → admin approval. KYC: phone, name, ID, business info, location
- **Seller Dashboard:** Sales overview, revenue stats, pending orders, recent activity
- **Product Management:** CRUD products with: title (fr + en), description (fr + en), category, images (up to 8, first = cover), price (CDF and/or USD), stock quantity, condition (new/used), specifications (dynamic by category), delivery options
- **Order Management:** View incoming orders, accept/reject, mark as shipped, print packing slips
- **Earnings & Payouts:** View balance, request payout (to Mobile Money), transaction history
- **Shop Profile:** Public shop page with logo, description, ratings, product listing
- **Promotions:** Create discounts, flash deals (subject to admin approval)
- **Messaging:** Buyer-seller chat for product inquiries
- **Analytics:** Sales trends, top products, conversion metrics

### 4.3 Admin Features
- **Dashboard:** Platform KPIs (GMV, orders, users, sellers, revenue)
- **User Management:** View/search/block buyers and sellers. Role management (super admin, admin, support)
- **Seller Approval:** Review applications, approve/reject with reason
- **Product Moderation:** Review flagged products, approve/reject listings, enforce quality standards
- **Category Management:** CRUD category tree with attributes per category
- **Order Management:** View all orders, intervene in disputes, process refunds
- **Banner/Promotion Management:** Create/schedule homepage banners, platform-wide promotions, flash sales
- **Content Management:** FAQ, help pages, terms & conditions, privacy policy (multilingual)
- **Delivery Zone Management:** Define towns, neighborhoods, delivery fees by zone
- **Payment Management:** View transactions, reconcile Mobile Money callbacks, manage payouts to sellers
- **Commission Settings:** Set platform commission per category or seller
- **Reports:** Sales reports, seller performance, buyer activity, financial reconciliation
- **Notification Broadcast:** Send push/SMS to user segments
- **System Settings:** Site configuration, feature flags, maintenance mode

---

## 5. DATABASE DESIGN PRINCIPLES

- Use UUIDs for all primary keys (avoid sequential IDs for security)
- Implement soft deletes (deletedAt timestamp) for all major entities
- Every table has createdAt, updatedAt timestamps
- Multi-language fields: Use JSON columns for translatable text `{ "fr": "...", "en": "..." }`
- Location hierarchy: Country → Province → Town → Neighborhood (seeded for Haut-Katanga & Lualaba initially)
- Order state machine: Use an enum + transition log table for audit trail
- Monetary values: Store in smallest unit (centimes for CDF) as BigInt to avoid floating point issues. Always store currency code alongside amount
- Indexes: On all foreign keys, frequently filtered columns (status, categoryId, sellerId), and full-text search columns

---

## 6. API DESIGN PRINCIPLES

- RESTful with consistent naming: `GET /api/v1/products`, `POST /api/v1/orders`
- API versioning from day one (`/api/v1/`)
- Standard response envelope: `{ success: boolean, data: T, meta?: { page, limit, total }, error?: { code, message } }`
- Pagination: cursor-based for feeds, offset for admin tables
- Rate limiting: Per IP and per user, stricter on auth endpoints (OTP flood protection)
- Input validation: Use class-validator + class-transformer in NestJS, Zod schemas in shared/
- Error codes: Consistent error code enum shared between frontend and backend
- File uploads: Multipart to backend → backend uploads to Cloudinary → returns URL. Never store files locally
- Webhooks: Signed webhook endpoints for payment callbacks, with idempotency keys

---

## 7. DEVELOPMENT WORKFLOW & CONTINUITY SYSTEM

### 7.1 Progress Tracking (CRITICAL)

Maintain a `PROGRESS.md` file at the project root. Update it after completing each task.

### 7.2 Resumption Protocol

When resuming work (after interruption or new session):

1. **Read `CLAUDE.md`** (this file) for full project context
2. **Read `PROGRESS.md`** to know exactly where you stopped
3. **Check git log** (`git log --oneline -20`) for recent commits
4. **Run tests** (`npm test` in api/) to verify current state
5. **Continue from the next uncompleted sub-task**

### 7.3 Git Discipline

- Commit after every completed sub-task with descriptive messages
- Format: `feat(module): description` / `fix(module): description` / `chore: description`
- Never commit broken code. Run tests before committing
- Use feature branches for major features: `feature/auth`, `feature/products`, `feature/orders`

### 7.4 Testing Strategy

- **Unit tests:** For all service methods, utility functions, validators
- **Integration tests:** For all API endpoints (use NestJS testing module + test DB)
- **Test before moving on:** Every feature must have passing tests before starting the next task
- **Seed data:** Create a comprehensive seed script (`prisma/seed.ts`) with realistic Congolese data (French names, Lubumbashi addresses, CDF prices)

---

## 8. IMPLEMENTATION PHASES

Execute these phases in strict order. Each phase builds on the previous one. Do not skip ahead.

### Phase 1 — Foundation (Scaffolding & Infrastructure)
1.1. Initialize monorepo structure with all folders
1.2. Set up Docker Compose (api, buyer-web, seller-web, admin-web, nginx)
1.3. Configure NGINX reverse proxy (route /api → api, / → buyer-web, /seller → seller-web, /admin → admin-web)
1.4. Set up NestJS project with: config module (env validation), logger, CORS, helmet, compression
1.5. Set up Prisma with PostgreSQL connection, initial schema with User model
1.6. Set up Redis connection and caching module
1.7. Set up shared/ folder with common types, constants, and validators
1.8. Set up all three Next.js projects with: Tailwind, i18n (next-intl), layout with language switcher
1.9. Initialize Flutter projects (buyer-mobile, seller-mobile) with: localization, base navigation, HTTP client setup
1.10. Create `.env.example` with all variables documented
1.11. Verify all containers build and run correctly
1.12. Set up GitHub Actions: lint + type-check + test on PR

### Phase 2 — Authentication & Users
2.1. Database: User, SellerProfile, Address, OTP tables
2.2. SMS OTP flow: request OTP → verify → create account / login (Africa's Talking integration)
2.3. JWT auth: access token + refresh token + rotation
2.4. Auth guards and decorators (NestJS): @Public, @Roles, @CurrentUser
2.5. User profile CRUD (name, phone, email, language, avatar)
2.6. Address management CRUD (with town/neighborhood selection)
2.7. Seller registration application flow
2.8. Admin: user list, search, block/unblock, seller approval
2.9. Implement auth on all frontends (buyer-web, seller-web, admin-web)
2.10. Implement auth on both mobile apps
2.11. Email verification flow (optional, via Resend)
2.12. Tests for all auth endpoints and flows

### Phase 3 — Product Catalog
3.1. Database: Category, Product, ProductImage, ProductAttribute, ProductSpecification tables
3.2. Category tree CRUD (admin) with per-category attribute definitions
3.3. Product CRUD (seller): multilingual title/description, images (Cloudinary), pricing, stock, specs
3.4. Product listing API: search, filter, sort, paginate (cursor-based)
3.5. Product detail API with seller info, category breadcrumb
3.6. Admin: product moderation (approve/reject/flag)
3.7. Location seeding: Haut-Katanga & Lualaba provinces, towns, neighborhoods
3.8. Buyer-web: homepage, category pages, search results, product detail page
3.9. Seller-web: product management dashboard
3.10. Admin-web: category manager, product moderation queue
3.11. Mobile: product browsing, search, detail screens
3.12. Tests for all product endpoints

### Phase 4 — Shopping & Orders
4.1. Database: Cart, CartItem, Order, OrderItem, OrderStatusLog tables
4.2. Cart API: add, remove, update quantity, clear (persist for logged-in users)
4.3. Delivery zone system: zones, fees calculation based on buyer/seller locations
4.4. Checkout flow API: validate cart → create order → reserve stock → initiate payment
4.5. Order state machine: Pending → Confirmed → Processing → Shipped → Delivered / Cancelled / Returned
4.6. Order management API (seller): accept/reject, update status
4.7. Order management API (admin): view all, intervene, cancel
4.8. SMS notifications via Africa's Talking at each order status change
4.9. Buyer-web: cart page, checkout flow, order history, order detail
4.10. Seller-web: order management dashboard
4.11. Admin-web: order management panel
4.12. Mobile: cart, checkout, order tracking screens
4.13. Tests for all order flow endpoints

### Phase 5 — Payments
5.1. Payment provider abstraction layer (PaymentProvider interface)
5.2. Mobile Money integration (M-Pesa, Airtel Money, Orange Money via Flexpay/MaxiCash)
5.3. Cash on Delivery flow with confirmation mechanism
5.4. Payment webhook handler (idempotent, with signature verification)
5.5. Transaction logging and reconciliation
5.6. Seller earnings calculation (sale amount - platform commission)
5.7. Seller payout system (request payout → admin approval → process to Mobile Money)
5.8. Admin: transaction dashboard, payout management, commission settings
5.9. Integrate payment into checkout flow on all frontends
5.10. Tests for payment flows (use mock payment provider for tests)

### Phase 6 — Reviews, Wishlist & Messaging
6.1. Database: Review, Wishlist, Conversation, Message tables
6.2. Review system: post-delivery, 1-5 stars + text, verified buyer only
6.3. Seller rating aggregation
6.4. Wishlist / saved items CRUD
6.5. Buyer-seller messaging (simple real-time chat via WebSocket or polling)
6.6. All frontends: review components, wishlist pages, messaging UI
6.7. Mobile: reviews, wishlist, chat screens
6.8. Tests

### Phase 7 — Admin & Platform Operations
7.1. Admin dashboard: KPIs, charts (GMV, orders, users, revenue)
7.2. Banner/promotion management with scheduling
7.3. Flash deals system
7.4. Content management: FAQ, help pages, terms (multilingual, stored in DB)
7.5. Platform commission configuration (global + per-category + per-seller overrides)
7.6. Notification broadcast system (SMS/push to segments)
7.7. Reports: exportable CSV/PDF for sales, financial, seller performance
7.8. System settings: feature flags, maintenance mode
7.9. Tests

### Phase 8 — Optimization & Production Readiness
8.1. Performance audit: Lighthouse scores, API response times, bundle sizes
8.2. Image optimization pipeline (Cloudinary transforms, WebP, lazy loading)
8.3. API response caching strategy (Redis)
8.4. Database query optimization (indexes, N+1 prevention, connection pooling)
8.5. Security audit: rate limiting, input sanitization, SQL injection prevention, XSS, CSRF
8.6. SEO: meta tags, structured data, sitemap, robots.txt (buyer-web)
8.7. PWA capabilities for buyer-web (offline product browsing)
8.8. Error tracking setup (Sentry or similar free tier)
8.9. Docker production configs, health checks
8.10. Deployment documentation
8.11. Final end-to-end testing

---

## 9. DESIGN GUIDELINES

- Follow latest **Google Material Design 3** guidelines for mobile apps
- Web UI: Clean, modern, fast-loading. Reference Jumia's layout but make it feel premium
- **Color palette:** Define brand colors early (suggest warm red or blue for DRC market feel)
- **Typography:** Use system fonts + Google Fonts that support French characters (accents)
- **Responsive:** Mobile-first for buyer-web (most traffic will be mobile browser)
- **Accessibility:** WCAG 2.1 AA minimum. Proper contrast ratios, alt text, keyboard navigation
- **Image placeholders:** Always show skeleton loaders while images load (critical for slow connections)
- **Empty states:** Design meaningful empty states with CTAs (no products? → browse categories)
- **Error states:** User-friendly error messages in French, with retry actions

---

## 10. IMPORTANT RULES

1. **Never hardcode text.** Every user-facing string must go through i18n.
2. **Never use ports 3000 or 4000.**
3. **Always keep all platforms in sync.** If a feature is implemented on web, create the corresponding mobile screens (even if simplified). Update PROGRESS.md to track parity.
4. **French is default everywhere.** Default locale, default seed data, default error messages.
5. **Test before moving on.** No phase is complete without passing tests.
6. **Commit frequently.** After every meaningful sub-task.
7. **Update PROGRESS.md after every completed task.**
8. **Use CDF (Congolese Franc) as primary currency.** Support USD as secondary (many transactions in Katanga use USD informally). Always show both when possible.
9. **Phone number format:** Always store as international format (+243XXXXXXXXX). Display with local formatting.
10. **For anything not specified:** Reference Jumia.ug's implementation and follow e-commerce industry best practices. When in doubt, optimize for the DRC context (low bandwidth, French language, Mobile Money payments, phone-first UX).
11. **SMS uses a provider abstraction** at `apps/api/src/sms/interfaces/sms-provider.interface.ts` (mirrors the `PaymentProvider` pattern). Active provider is selected by the `SMS_PROVIDER` env var (`orange` | `africas_talking` | `mock`). To add a new provider, drop an implementation under `apps/api/src/sms/providers/` and wire it in the factory in `sms.module.ts`. **Never call an SMS vendor API directly** from application code — always go through `SmsService`.
12. **Auth providers — strict role boundaries (server-enforced).** Users carry an `authProvider` on the `User` model. Role-to-provider mapping is:
    - **Buyers → `PHONE_OTP` only.** No email/password. Non-buyer roles hitting `/v1/auth/login` are rejected (`ADMIN_PHONE_AUTH_DISABLED` 403, `SELLER_MIGRATION_REQUIRED` 409).
    - **Sellers → `EMAIL_PASSWORD` only.** Self-service registration at `/v1/auth/register/email` creates `role=SELLER`.
    - **Admins → `EMAIL_PASSWORD` only.** No phone OTP. Admins are seeded out-of-band (see `docs/deployment.md § 5b`).

    Google OAuth was removed in April 2026; the legacy `GOOGLE` value still exists on the `AuthProvider` enum for historical accounts but no code path creates new ones. Both remaining paths terminate in `generateTokens` so cookie semantics and refresh-token replay detection are identical. See `docs/architecture.md § Authentication — overview` for the full matrix and error codes.

13. **Buyer phone-input UX.** Users on `teka.cd` and the buyer mobile app type only their 9-digit local number (or 10 with leading `0`); the `+243` prefix is added by the system. Single source of truth: `normalizeDrcPhone()` in `packages/shared/src/utils/phone.ts` (web) and `apps/buyer-mobile/lib/core/utils/phone.dart` (Flutter). Backend DTOs continue to enforce `^\+243\d{9}$` so storage stays canonical.
