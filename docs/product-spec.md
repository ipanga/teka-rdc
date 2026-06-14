# Teka RDC — Product Spec & Implementation History (historical reference)

> **Status / how to read this.** This is the *original* Jumia-parity feature spec and the 8-phase
> build history, relocated out of `CLAUDE.md` (2026-06-07) to keep that file focused on active rules.
> **Some details below have since evolved** — most notably **auth** (buyers now use WhatsApp OTP, not
> email+password; sellers/admins use email+password), **payments** (COD-only; Flexpay removed), and
> **SMS** (removed; order events ride Push+Email). The **authoritative current behaviour** lives in:
> - `CLAUDE.md` §10 (Important Rules — the load-bearing operational contract)
> - `docs/architecture.md` (authoritative service architecture)
> - `PROGRESS.md` (chronological history) + `STATUS.md` (in-flight work)
>
> Read this for *original scope / intent*; read those for *what to do today*.
>
> **Catalog (2026-06-14):** the product catalog now uses a **strict 2-level taxonomy** (7 categories → 80
> subcategories), a first-class **Brand library** (replacing the old "Marque" attribute), per-subcategory
> **dynamic attributes** incl. BOOLEAN, and pre-launch **catalog-reset tooling**. The "category tree /
> dynamic attributes / brand filtering" features described below are current — see
> `docs/architecture.md` → "Marketplace taxonomy + brands" for the authoritative model.

---

## Core features (Jumia feature parity)

Organized by user role. Reference Jumia.cd for exact UX flows.

### Buyer features
- **Registration/Login:** *(superseded — see Rule 12: buyers now use WhatsApp OTP via Gupshup.)*
- **Homepage:** Featured products, flash deals, categories, banners (admin-managed).
- **Product Browsing:** Category tree navigation, search with filters (price range, category, location,
  condition, rating), sort (price, popularity, newest).
- **Product Detail Page:** Image gallery, description, specifications, seller info, ratings/reviews,
  related products, "Add to Cart" / "Buy Now".
- **Shopping Cart:** Add/remove/update quantities, persist cart (logged in = DB, guest = localStorage
  synced on login).
- **Checkout Flow:** Address selection/creation (town + neighborhood/avenue, no postal codes), delivery
  method selection, COD-only summary, place order.
- **Payment:** Cash on Delivery only (since 2026-05-26). `Transaction { provider: COD, status: PENDING }`
  written synchronously at checkout, marked `COMPLETED` when the seller marks the order delivered.
- **Order Tracking:** Real-time status (Pending → Confirmed → Shipped → Out for Delivery → Delivered /
  Cancelled / Returned). Notifications at each stage (Push primary + Email fallback; SMS removed).
- **Reviews & Ratings:** Post-delivery review with 1-5 stars + text. Only verified buyers can review.
- **Wishlist / Saved Items.**
- **Notifications:** In-app + Push/Email for order updates, promotions, price drops.
- **User Profile:** Edit name, email, phone (for delivery), addresses. *(Buyers have no password.)*
- **Help/Support:** FAQ, contact form, WhatsApp link.

### Seller features
- **Seller Registration:** Email + password (`POST /v1/auth/register/email`) → application form → admin
  approval. KYC: name, email, phone (for orders/rider contact), ID, business info, location.
- **Seller Dashboard:** Sales overview, revenue stats, pending orders, recent activity.
- **Product Management:** CRUD products with title, description, category, images (up to 8, first =
  cover), price (CDF and/or USD), stock, condition (new/used), specifications (dynamic by category),
  delivery options.
- **Order Management:** View incoming orders, accept/reject, mark as shipped, print packing slips.
- **Earnings & Payouts:** View balance, request payout (processed manually by ops via bank-transfer or
  cash since 2026-05-26; the request body still accepts `mobileMoneyPhone` for back-compat with older
  seller-app builds, treated as informational metadata only), transaction history.
- **Shop Profile:** Public shop page with logo, description, ratings, product listing.
- **Promotions:** Create discounts, flash deals (subject to admin approval).
- **Messaging:** *(retired 2026-05-17 — buyers reach "Contacter le support Teka RDC" instead.)*
- **Analytics:** Sales trends, top products, conversion metrics.

### Admin features
- **Dashboard:** Platform KPIs (GMV, orders, users, sellers, revenue).
- **User Management:** View/search/block buyers and sellers. Role management (super admin, admin, support).
- **Seller Approval:** Review applications, approve/reject with reason.
- **Product Moderation:** Review flagged products, approve/reject listings, enforce quality standards.
- **Category Management:** CRUD category tree with attributes per category.
- **Order Management:** View all orders, intervene in disputes, process refunds.
- **Banner/Promotion Management:** Create/schedule homepage banners, platform-wide promotions, flash sales.
- **Content Management:** FAQ, help pages, terms & conditions, privacy policy.
- **Delivery Zone Management:** Define towns, neighborhoods, delivery fees by zone.
- **Payment Management:** View transactions (all COD since 2026-05-26), reconcile manual operator-driven
  payouts to sellers.
- **Commission Settings:** Set platform commission per category or seller.
- **Reports:** Sales reports, seller performance, buyer activity, financial reconciliation.
- **Notification Broadcast:** Send Push/Email to user segments.
- **System Settings:** Site configuration, feature flags, maintenance mode.

---

## Implementation history (8 phases — all shipped)

The platform was built in 8 sequential phases — all complete. Historical scope, not a backlog.

| Phase | Scope | Notable code |
|---|---|---|
| 1 | Scaffolding, Docker, NestJS bootstrap, Prisma, Next.js x3, Flutter x2 | `docker-compose.yml`, `apps/api/src/app.module.ts` |
| 2 | Auth & Users — SMS OTP (later removed), JWT + refresh rotation, guards, profiles, addresses, seller reg + admin approval | `apps/api/src/auth/`, `apps/api/src/users/` |
| 3 | Product Catalog — categories, products, browse API, moderation, seed data | `apps/api/src/{products,categories,browse}/` |
| 4 | Cart, Checkout, Orders — state machine, delivery zones, notifications | `apps/api/src/{cart,checkout,orders,delivery-zones,notifications}/` |
| 5 | Payments — Flexpay Mobile Money + COD (Flexpay later removed), webhooks, earnings, payouts, commission | `apps/api/src/{payments,payouts,commission}/` |
| 6 | Reviews, Wishlist, Messaging (polling-based; messaging later retired) | `apps/api/src/{reviews,wishlist,messaging}/` |
| 7 | Admin Ops — dashboard charts, banners, promotions/flash deals, content CMS, settings, broadcasts, CSV reports | `apps/api/src/{banners,promotions,content,settings,broadcasts,reports}/` |
| 8 | Production hardening — composite indexes, health probes, throttling, SEO, error boundaries, PWA, Docker prod, e2e tests | `apps/api/src/health/`, `apps/buyer-web/public/sw.js`, `docker-compose.prod.yml` |

**Post-phase work** (Redis removal → city marketplace → buyer-auth churn → French-only refactor →
SMS/Flexpay removal → mobile connectivity → web analytics → wishlist → SEO/city-first URLs → mobile
parity) is recorded chronologically in **`PROGRESS.md`** ("Post-phase chronology — condensed index"),
with current/recent work in **`STATUS.md`**. The load-bearing constraints those initiatives created
live as **Rules in `CLAUDE.md` §10** — read those, not this history, for what to *do*.
