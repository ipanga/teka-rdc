# Pre-scale readiness — Buyer Mobile · Buyer Web SEO · Tablet · Cross-platform security

> **Tracker for the 2026-09 pre-scale initiative.** Resumable: a new session reads `STATUS.md`, then this
> file top-to-bottom. Sections: current phase → findings per domain → decisions → PR plan → per-PR records
> (files, API/schema implications, tests, runtime verification) → unresolved risks → next exact step.
> Constraints in force: no regeneration, no global refactor, API is the source of truth, small PRs into
> `develop` (merge commits), no `db:push`, no destructive DB change, no auto-deploy/merge to `main`,
> Buyer Web SEO must not regress, seller/admin stay `noindex`, no Mobile Money/crypto now.

## Current phase

**Phase 0 audit complete (PR #671). Implementation started 2026-09-06 with D1 (`security/otp-buyer-only`).**

## Baseline (verified first-hand, 2026-09-06)

- API: global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, … })`, `helmet()`, CORS
  allow-list from `CORS_ORIGINS` with `credentials: true` and `allowedHeaders: Content-Type,
  Authorization, X-Teka-Surface`, `trust proxy 1`, `ThrottlerModule 100 req / 60 s` with 3 `@Throttle`
  overrides, **zero** `$queryRaw*` / `$executeRaw*` usages (`apps/api/src/main.ts`, `app.module.ts`).
- Web: CSP + HSTS (`max-age=63072000; includeSubDomains; preload`) + X-Frame-Options + Referrer-Policy
  set by nginx (`nginx/nginx.prod.conf`, `$tk_csp` map) — the default CSP still allows
  `'unsafe-inline' 'unsafe-eval'` and lists Google OAuth hosts that were retired in Apr 2026; buyer-web
  also has a `headers()` block in `next.config.ts`. Two `dangerouslySetInnerHTML` usages across the three
  web apps (JSON-LD).
- Test inventory: API 55 unit specs + 16 e2e files; buyer-web 13 vitest files; buyer-mobile 44 test
  files; seller-mobile 31; seller-web 5; admin-web 5. CI runs `flutter analyze` only for mobile.

## Findings — Workstream C: tablet support (audit complete)

**Platform config needs nothing.** Both apps: `TARGETED_DEVICE_FAMILY = "1,2"`, all iPad orientations
declared, `UIRequiresFullScreen` absent (iPad Split View / Slide Over are live today), no
`screenOrientation`, no `SystemChrome.setPreferredOrientations`. So every layout that reads window width
instead of local constraints is already wrong in Split View. No breakpoint helper exists in either app;
`core/widgets/adaptive_leading.dart` is navigation-only. The established idiom is `LayoutBuilder` with a
lower-bound guard (10 sites) — all lack an upper bound.

buyer-mobile (**HIGH**):
- `catalog/presentation/widgets/product_card.dart:41-50` `productCardGridExtent` divides
  `MediaQuery.sizeOf(context).width` by a hardcoded 2 → ~490 pt cells / ~634 pt rows on a 1024 pt
  tablet; every grid passes `crossAxisCount: 2` (`home_screen.dart:328`, `category_screen.dart:258`,
  `search_screen.dart:504`, `promotions_screen.dart:50`, `wishlist_screen.dart:92`,
  `core/widgets/product_skeletons.dart:208`). Coupled: a max-width wrapper cannot be added before this
  helper stops reading the window width. `productCardGridExtent` has zero test coverage.
- PDP gallery full-bleed at `kProductDetailGalleryAspectRatio = 1.25` (`product_skeletons.dart:5`,
  `image_gallery.dart:35,53,66`) → 819 pt-tall image on 1024 pt; decodes at full window width.
- Sheets/dialogs stretch edge-to-edge (no `bottomSheetTheme`/`dialogTheme` in `app_theme.dart`;
  `filter_bottom_sheet.dart:86`, `checkout_screen.dart:174`, `my_address_screen.dart:67`,
  `product_reviews_screen.dart:172`); sticky bottom bars span full width (`cart_screen.dart:122`,
  `checkout_screen.dart:235`); banner carousel fixed `height: 180` full width
  (`banner_carousel.dart:107,138`); hand-rolled 5-tab bar (`core/router/main_shell.dart:118-135`);
  single-column lists (`categories_screen.dart:37`, `orders_screen.dart:43`, `city_selection_screen.dart`).
- Text scaling is handled and is not a tablet risk. There is **no buyer-side seller storefront screen**
  (only the PDP seller block).

seller-mobile (**MEDIUM**): stock M3 `NavigationBar` (`seller_main_shell.dart:38`), six existing
`LayoutBuilder` breakpoints (`home_screen.dart:203` derives columns from constraints — correct). Gaps:
`product_form_screen.dart:235` full-width form (worst surface), `product_image_manager.dart:106`
`crossAxisCount: 3` → ~336 pt tiles, sheets without constraints (`category_selector.dart:65`,
`product_image_manager.dart:138`, `verification_screen.dart:165`), full-width lists
(`orders_list_screen.dart:110`, `products_list_screen.dart:162`, `verification_screen.dart:301`).
Do not touch the `maxWidth:` arguments in `seller_application_screen.dart:171`,
`verification_screen.dart:207`, `personal_info_screen.dart:68`, `product_image_manager.dart:186`,
buyer `personal_info_screen.dart:69` — those are `image_picker` capture sizes, not layout.

Tests: no golden tests anywhere; pinned widget-test surfaces are all phone-width except
`verification_screen_test.dart:111` (`1200×4000`, an overflow-dodging canvas, not tablet coverage).
seller-mobile already has width-parameterised harnesses (`seller_dashboard_screen_test.dart:29`,
`seller_lists_test.dart:29`).

Smallest safe approach (per app, mirroring the duplicated-file convention): new
`lib/core/layout/breakpoints.dart` (M3 600/840 thresholds, `MaxWidthBody` = Center + ConstrainedBox
720, `productGridColumns(width)` → 2/3/4); one-line `bottomSheetTheme` constraint (max 640) fixing every
sheet; `productCardGridExtent(columns, width)` fed from `LayoutBuilder`; PDP gallery `maxHeight`;
`MaxWidthBody` on forms/lists/detail. **Out of scope (risky):** replacing buyer's hand-rolled tab bar
with a `NavigationRail`; master/detail split view (every detail route is a top-level `GoRoute`).

## Findings — Workstream B: Buyer Web SEO (audit complete, live-verified 2026-09-06)

**What is strong:** URL architecture, redirect graph (www → apex 301; `/en/*`, `/fr`, legacy
`/categorie/:slug`, `/categories/:uuid`, `/search`, `/cart`, wrong-slug, wrong-town, flat legacy product
URLs all single-hop 308; unknown → 404), self-canonicals that strip query params and trailing slashes,
per-town metadata, truthful `aggregateRating` (gated on `totalReviews > 0`), no verification internals in
JSON-LD, `/recherche` `noindex, follow`, seller/admin triple-layer noindex (robots.txt `Disallow: /` +
meta + `X-Robots-Tag`, sitemaps 404). `urls.test.ts` (16) and `middleware.test.ts` (11) are solid.

**Root problem: almost nothing that ranks is in the HTML.** Every listing surface
(`components/pages/{home,city-landing,category,search,product-detail}-page.tsx`) is `'use client'` and
fetches in `useEffect`; initial HTML is skeletons with ~20 links, none to a product or category.

High (all confirmed live):
- **H1 — sitemap has 0 product URLs.** `src/app/sitemap.ts:71` requests `/v1/browse/products?limit=500`;
  the API DTO caps `limit` at 100 (`browse-products-query.dto.ts:97`) → 400, `fetchApi` swallows it to
  `null`. Live sitemap: 387 URLs = 1 home + `/categories` + `/recherche` + 8 static + 2 towns + 374
  town×category, **0 products** (catalog has 16). `sitemap.test.ts` mock returns `ok` for any query, so
  the test passes while production emits none.
- **H2 — no product/category/town links in any HTML** (town pages: 26 skeletons, 0 links; homepage
  HTML has no `/lubumbashi` or `/kolwezi` link because the footer towns are client-fetched).
- **H3 — PDP has no H1/price/availability/seller in HTML** (product is already fetched server-side in
  `[ville]/[product]/page.tsx` for metadata + JSON-LD, then discarded).
- **H4 — all 374 category pages ship `<h1>Catégories</h1>`** (`category-page.tsx` ~316 falls back until
  the client fetch resolves; the server route already has `category.name`).
- **H5 — homepage has no `<h1>`** (`banner-carousel.tsx:142-146` renders a skeleton while `loading`
  starts `true`, so the `StoreHero` fallback with `serverH1` never renders server-side).
- **H6 — 374 town×category URLs, most empty** (sampled `farine`, `pates`, `cereales` → 0 products);
  indexable and in the sitemap; no `productCount` gate (`ApiCategoryDetail.productCount` exists unused).
- **H7 — `Organization.logo` → 404** (`app/page.tsx:42` `icons/icon-512.png`); Organization + WebSite
  JSON-LD only on the homepage.

Medium: M1 meta/OG/JSON-LD product descriptions contain raw markdown + newlines
(`[ville]/[product]/page.tsx:108-118`; stripping regex exists in `[ville]/page.tsx:86-93`); M2 PDP
`og:type: website`, no `product:price:*`/`og:availability`; M3 `skipTrailingSlashRedirect: true`
(`next.config.ts:50`, for the PostHog `/ingest` proxy) makes every page 200 at both `/x` and `/x/`; M4
cursor-only « Charger plus » → products 13+ uncrawlable; M5 no BreadcrumbList/LocalBusiness on town
pages; M6 PDP category link uses legacy global `/categorie/:slug` → 308 to the default town
(`product-detail-page.tsx:455`; `categoryHref(citySlug, cat)` exists); M7 sitemap `lastmod` identical
(generation time) on all 387 URLs; M8 "Likasi" still advertised in 5 metadata strings although
`/v1/cities` serves only Lubumbashi + Kolwezi; M9 category titles double the brand (`… sur Teka RDC |
Teka RDC`); M10 `/recherche` in sitemap while noindex, `/promotions` indexable but absent; M11 placeholder
brand « Autre » emitted as schema.org Brand; M12 343 KB compressed JS/CSS on an empty-HTML homepage
(115 KB chunk, 38.7 KB polyfills, PostHog inits in `useEffect` with autocapture + session recording).

Low: L1 `og-default.png` 3.7 KB (likely blank); L2 Cloudflare-managed robots block (AI crawlers
disallowed, `Content-Signal: ai-train=no`) unowned/undocumented; L3 dead malformed `Host:` line; L4
`alt=""` on category tiles; L5 Organization lacks `sameAs`/address; L6 no `ItemList`; L7 no `Review`
JSON-LD; L8 no `priceValidUntil`/return policy, inert `shippingDetails`; L9 homepage `og:updated_time`
frozen by 1-year static cache; L10 sitemap uncached (3 API calls per hit); L11 no tests for
canonical/metadata/JSON-LD/redirect table; L12 `keywords` meta in 4 files.

Content/intent: "acheter en ligne Lubumbashi" covered by the town H1; "marketplace RDC" absent (titles
say « supermarché en ligne »); "acheter téléphone Lubumbashi" lands on a category page with H1
« Catégories », no copy and 0 crawlable products. Town descriptions are one templated sentence.

Non-SEO but relevant: `cf-cache-status: DYNAMIC` on all HTML (Cloudflare does not cache HTML);
`skipTrailingSlashRedirect` and the SW inline script (`layout.tsx:88-109`) both rely on CSP
`'unsafe-inline'`.

## Findings — Workstream A: Buyer Mobile functional readiness (audit complete; Critical/High verified first-hand)

**What works:** single `GoRouter` with `refreshListenable`, 5-branch `StatefulShellRoute`, push-vs-replace
auth return, `AdaptiveLeading`; OTP request/verify/resend with server cooldown and centralised French
error mapping; seller-account guard; refresh interceptor distinguishes connectivity from rejection; Sentry
user = id + role, phone scrub, PostHog identity role-only (tested); reviews create / edit-in-place (PATCH)
/ delete with server-side ownership, DELIVERED-order eligibility, `@@unique(buyerId, productId)`; PDP
price formatting (FC, `.`), discount badge, coarse stock, Officiel/Vérifié from API flags, share with
failure paths; checkout idempotency (UUID v4 per intent, reused on retry, deduped server-side), COD-only
both sides, delivery quote per address with hard block when no zone; offline hard-block on order
placement; connectivity machine + interceptor chain fully tested (42 network tests, 32 connectivity).

Critical (verified):
- **A1 — Cart and checkout totals ignore promotional prices.** `cart_provider.dart:37-45` sums
  `product.priceCDF × qty` while `cart_model.dart:31-39,66-69` use `effectiveCDF`; the inflated figure
  feeds `cart_screen.dart:71,159`, checkout « Sous-total » (`checkout_screen.dart:858`) and « Total »
  (`:968`); the server charges the discounted price (`checkout.service.ts:188`). Line rows also mix
  undiscounted unit × qty (`checkout_screen.dart:786`) with a discounted row total (`:797`). No test
  covers `CartState.totalCDF` with a discounted item.
- **A2 — Offline cold start silently logs the buyer out.** `auth_repository.dart:98-105`
  `getCurrentUser()` returns `null` on *any* error; `auth_provider.dart:82-96` then `clearTokens()`.
  Defeats the interceptor's connectivity-vs-rejection distinction one layer up.

High:
- **A3 — Offline cold start hard-blocks the app on the city gate**: `city_provider.dart:63-107` fetches
  cities before restoring the stored town (same `try`), so `selectedCity` stays null and the router forces
  `/city-selection` (`app_router.dart:103-105`).
- **A4 — Cart state + disk cache survive logout and leak across accounts** (`CacheKeys.buyerCart`
  global, documented « cleared on logout » but `AuthNotifier.logout()` `auth_provider.dart:199-203` only
  clears tokens; `cartProvider` has no auth listener unlike wishlist/city). `ordersProvider` and
  `notificationsProvider` are likewise never reset.
- **A5 — Buyer avatar upload does not use `postMultipartWithAuthRetry`** (`profile_repository.dart:71-78`;
  the helper exists in the app, unused). Known from the seller release; now in scope.
- **A6 — API: previous Cloudinary avatar never destroyed on replace** (`apps/api/src/users/users.service.ts:106-124`
  uploads to `teka-rdc/avatars` and overwrites `user.avatar`; no `public_id` stored). API change: persist
  the public id (or derive it from the URL) and destroy the prior asset after the new one is committed.
- **A7 — Deep-linked category from a web URL is broken**: `deep_link_parser.dart:112-118` maps
  `/{ville}/categorie/{slug}` → `/categories/{slug}` but `category_screen.dart:53-56,221` passes the slug
  as `categoryId`, and `GET /v1/browse/products?categoryId=` and `/browse/categories/:id/attributes`
  are UUID-only → 400, generic title, broken filters. Fix client-side by resolving via
  `GET /v1/browse/categories/:identifier` (accepts slug or id).
- **A8 — Review submit/edit/delete failures are invisible and blow away the list**:
  `review_form_dialog.dart:66-68,192-243` never renders `reviewsState.error`; the shared error replaces
  the whole list behind the sheet (`product_reviews_screen.dart:40-46,286-322`).
- **A9 — iOS foreground notifications and their taps are dead**: `push_service.dart:97-99` initialises
  local notifications with Android settings only; `_local.show` passes Android details only (`:200-208`).
- **A10 — Address form**: recipient phone sent raw (`address_form_sheet.dart:166,175-177`; API requires
  `^\+243\d{9}$`) and errors bypass `friendlyErrorMessage` (`my_address_screen.dart:104-113`,
  `checkout_provider.dart:189-236` renders the error behind the modal); city-list failure leaves an empty
  disabled form (`address_form_sheet.dart:107-109`).

Medium: new buyers created nameless (`verifyOtp` supports first/last name but no screen passes them →
« Compte Teka » / « Acheteur » on reviews); Dio `LogInterceptor` logs full request URIs incl. `?q=` in
release (`api_client.dart:58-65`); no avatar removal; profile header stale after edit
(`profile_screen.dart:23-44` loads once, `authProvider.user` never updated); own review rendered twice;
review comment cannot be cleared (`reviews_repository.dart:170-176` omits empty `text`); cancel button
labelled « Reinitialiser » (`product_reviews_screen.dart:208`, `order_detail_screen.dart:85`); search has
no filters/sort; obsolete « Neuf / Occasion » filter (`category_screen.dart:150-166`); guests fire a
doomed `/v1/cart` on every PDP (`cart_provider.dart:63-71` constructor fetch); cached cart loses
discounts; pull-to-refresh blanks cart/orders; cart errors never rendered; out-of-stock cart lines silent;
`REFUNDED` and unknown statuses render the raw English enum (`order_detail_screen.dart:789-791`,
`order_status_badge.dart:53-54`, `checkout_success_screen.dart:74`); notifications feed loads once, badge
never reacts to a push, no retry CTA; data-only pushes never display in foreground
(`push_service.dart:186-194`); cold-start push/deep-link tap lost behind the city gate; relative CMS links
(`/pages/faq`) do nothing (`markdown_content.dart:35-42`); dead routes `/checkout/payment-pending` and
`/auth/reclamer-compte/confirmer`; `mergeGuestCart` dead code; `RETURNED` missing from order filters.
Low: ~12 missing-accent strings (« Paiement a la livraison », « Commande confirmee ! », « Selectionnez
une ville », « Telephone du destinataire », « Ecrire un avis », « Avis supprime »…), comment cap 500 vs API
1000, account-deletion OTP field accepts ≥4 digits, `search_performed` sends free text to PostHog (policy).

Untested critical flows: cart/checkout totals with discounts, `checkAuthStatus` with tokens + network
failure, session reset on logout, idempotency-key reuse across a retry, review provider paths, router
redirects (city gate, returnTo), category-by-slug, push service (none), avatar upload call site.

## Findings — Workstream D: security (API + web + infra audits complete; top items verified first-hand)

Frame: OWASP API Top 10 2023 / ASVS / MASVS. **Overall posture is good** — parameterised SQL everywhere
(no `$queryRawUnsafe`, dynamic `orderBy` behind closed `switch`es), correct ownership scoping in
addresses / orders / products / reviews / payouts / earnings / promotions / notifications / device tokens /
verification, conditional-update + in-transaction audit on payouts and commission, exemplary KYC upload
path (magic bytes, declared-type agreement, EXIF strip, private assets, expiry-enforced download URLs),
CSV-injection guard, account deletion with re-auth + 30-day grace + anonymisation, Sentry/PostHog scrubbing
on both API and web, secrets never in the repo or images, source maps not served, PostHog proxied
same-origin, three tested open-redirect guards, seller/admin noindex triple-layered.

### Critical / High (verified)
- **S1 (Critical chain) — cross-surface privilege escalation.** All three cookie sets are
  `Domain=.teka.cd`; the API picks *which* cookie authenticates from the client header `X-Teka-Surface`
  (`apps/api/src/auth/surface.util.ts:25-32`, default `buyer`); `Origin` is never checked; CORS allows
  `https://teka.cd` with credentials. JS on the public storefront can `fetch(api…, {credentials:'include',
  headers:{'X-Teka-Surface':'admin'}})` and drive the admin API for any admin logged in in the same browser.
  Fix: bind surface to a JWT claim at issue time + validate `Origin` against `CORS_ORIGINS` on every
  non-GET (a global `OriginGuard`); longer term narrow the admin cookie domain. Tests: `Origin: teka.cd` +
  `X-Teka-Surface: admin` + admin cookie → 403; token `surface` claim vs cookie namespace mismatch → 401.
- **S2 (High) — stored XSS on teka.cd via unescaped JSON-LD.** `apps/buyer-web/src/components/seo/json-ld.tsx`
  injects `JSON.stringify(data)` into `<script>`; seller-controlled `title`/`description`/brand/business
  name (`[ville]/[product]/page.tsx:191-199`) can contain `</script><script>…`; no sanitizer exists; CSP has
  `'unsafe-inline'`. Fix: escape `< > & U+2028 U+2029` at the sink (+ unit test); optionally strip `<>` in
  product DTOs. Chains directly into S1.
- **S3 (High) — buyer OTP login authenticates any role, incl. ADMIN.** `buyer-otp.service.ts:333`
  `where: { phone, deletedAt: null }` (no role filter); tokens minted with `user.role`; pinned as
  intended by `test/auth.e2e-spec.ts:359` ("decision #3"). Any admin/seller with a phone is reachable by a
  6-digit WhatsApp OTP with no password and (S5) no verify-side rate limit. **Policy decision needed.**
- **S4 (High) — IDOR `GET /v1/payments/orders/:orderId/transactions`**: no `@Roles`, no `@CurrentUser`, raw
  `orderId` (`payments.controller.ts:14-18`), `transaction.findMany({ where: { orderId } })`
  (`payments.service.ts:130`). Any authenticated user reads any order's transactions. The e2e only asserts
  the unauthenticated 401. Fix: scope by buyer/seller/admin + `UuidParam`; add cross-user 404 e2e.
- **S5 (High) — auth endpoints without per-route throttling / lockout**: `POST /auth/buyer/otp/verify`
  (only the per-OTP 5-attempt counter + global 100/min/IP), `POST /auth/login/email` (no lockout, no
  per-account counter), `register/email` (email-existence oracle via 409 + unbounded account creation),
  `password-reset/request` (mail bombing), `/auth/refresh` (two bcrypt ops per call), CSV reports
  (50 000 rows), all uploads. Only 3 `@Throttle` overrides exist. Also OTP per-phone limit is a non-atomic
  read-then-write (`buyer-otp.service.ts:248-280`) and `/otp/request` skips the 30 s resend cooldown.
- **S6 (High) — nginx never restores the real client IP behind Cloudflare** (no `set_real_ip_from` /
  `real_ip_header CF-Connecting-IP` in `nginx/nginx.prod.conf`): all `limit_req` zones and the API's
  `req.ip` (persisted on `RefreshToken` for the « Appareils » list) key on Cloudflare edge IPs →
  auth rate limit ineffective per attacker **and** shared-bucket lockout of legitimate users. Origin server
  should also be firewalled to Cloudflare ranges.
- **S7 (High) — `next@15.5.18` < 15.5.21**: three High advisories incl. SSRF in `rewrites()` (all three
  apps rewrite `/ingest/:path*` to PostHog; containers share the Docker network with the API).
- **S8 (High) — product-image and avatar uploads have no multer `limits`** (`products.controller.ts:120`,
  `users.controller.ts:48` bare `FileInterceptor('image')`; the 5 MB check runs after full buffering;
  nginx caps at 10 MB; unthrottled) and trust the declared MIME (`image/*` incl. SVG for avatars; product
  allow-list by `mimetype` only), no EXIF strip, public storage — saved today only by the forced WebP
  transcode. Reuse `sniffDocument`/`declaredTypeMatches`/`stripImageMetadata` from
  `seller-verification/document-validation.ts`.
- **S9 (High as amplifier) — CSP `script-src` has `'unsafe-inline' 'unsafe-eval'`** on all three surfaces
  (`nginx.prod.conf:55`, single `default` map branch) with retired Google OAuth hosts. Same policy also
  **blocks Clarity, blocks browser Sentry on all three web apps (no `tunnel`), and blocks the admin
  seller-document `<img>` preview (`api.cloudinary.com` not in `img-src`)**. Static locations
  (`:161-175,208-214,247-253`) declare their own `add_header` so JS/CSS/images ship with **no**
  HSTS/nosniff/CSP/XFO (verified live).
- **S10 (High operational) — app-review OTP bypass doc carries the review phone and code** six times
  (`docs/app-review-login.md`) and states "ENABLED in production (2026-07-25)". Local `.env.production`
  has `APP_REVIEW_LOGIN_ENABLED=false` (verified). Fix: scrub the doc, add a prod boot guard / auto-expiry,
  `timingSafeEqual`.

### Medium
S11 no audit rows for product/order/review/settings/broadcast moderation; `hardDelete` takes no actor
(`admin-products.controller.ts:100-103`); user suspend/ban unaudited, no self/peer guard, sessions not
revoked (`admin-users.service.ts:182-204`). S12 payout destination change without re-auth/notification/
cooling-off (`payouts.controller.ts:130-141`). S13 seller application document upload: no ownership row,
no throttle, no orphan sweep (`sellers.service.ts:37-65`). S14 unbounded `limit`/`page` on seller product
list (`product-query.dto.ts:5-11`); `SearchUsersDto` enums as free strings → 500. S15 PII in prod logs
(phone in Gupshup provider/whatsapp service/OTP soft-fail; email in email service; « reset requested for
unknown email » oracle in `auth.service.ts:251-253`). S16 web containers run as root (no `USER` in the
three Dockerfiles); no `no-new-privileges`/`cap_drop`. S17 GitHub Actions: every third-party action on a
mutable tag incl. `appleboy/ssh-action@v1` (prod SSH key); 7/10 workflows without `permissions:`;
`apply-migration.yml` declines an Environment gate; no `.github/dependabot.yml` (CodeQL **is** active via
default setup — it runs on every PR). S18 dependencies: `pnpm audit --prod` 1 critical / 24 high / 17
moderate / 3 low (`websocket-driver` via firebase-admin RTDB client, `path-to-regexp`/`qs`/`body-parser`
on the live Express path, `lodash`, `fast-uri`, `sharp`, `postcss`; several root `pnpm.overrides` pins are
stale). S19 Clarity has no in-code masking and is mounted on the authenticated seller dashboard
(latent while CSP blocks it). S20 no `Permissions-Policy`/COOP/CORP on the web tier; `X-Powered-By`
disclosed; login pages `s-maxage=31536000` with no `private, no-store` policy on seller/admin.
S21 admin-web login admits SUPPORT/FINANCE but the dashboard layout logs out any non-ADMIN → bounce loop
(API grants SUPPORT read access). S22 banner `linkUrl`/`linkTarget` only `@IsString()` → admin-stored
`javascript:`/`//evil` links rendered by `banner-carousel.tsx:106,121`.

### Low / Info
Password change leaves sibling access tokens valid ≤15 min; `verifyEmail` shares `JWT_SECRET` and skips
`deletedAt`; `COOKIE_DOMAIN`/`SENTRY_*`/`DATABASE_*` used but absent from the Joi schema; Sentry scrubber
phones-only (API + web; regex misses `0XXXXXXXXX`), emails/JWTs not scrubbed; `HttpExceptionFilter` reads
`request.user.sub` (never set → Sentry user always anonymous); 13 controllers with raw `@Query()`;
autocomplete `q` unbounded; `X-XSS-Protection` on buyer only; admin XFO `DENY` vs CSP `frame-ancestors
'self'`; PostHog `person_profiles` default `always` on the public storefront; `FINANCE`/`DRIVER` roles
unused. SSRF: no user-controlled outbound URL anywhere (Cloudinary by buffer/public_id only).

### Security test gaps
No cross-user 403/404 e2e anywhere (all authz e2e are unauthenticated-401 only); no role-boundary
crossing tests; no audit-row assertions; no upload-hardening tests on product/avatar; no CSRF/Origin test;
no response-header assertions on any surface; no cookie-attribute test; no `JsonLd` escaping test; no
dependency-audit gate in CI; seller/admin `middleware.ts` untested.

## Findings — mobile security, test coverage, CI (audit complete; verified first-hand where noted)

Clean: tokens in `flutter_secure_storage` with Android `encryptedSharedPreferences`, phone never
persisted, no cert-validation override, no WebView, ATS untouched, no cleartext config, `taskAffinity=""`
+ single exported activity, per-flavor `applicationId`/App Link host, signing files and Firebase configs
gitignored and never committed (history checked), iOS privacy manifests test-guarded, Sentry
`sendDefaultPii`/`attachScreenshot` off, no PostHog session replay, identity id+role only, Flutter
dependency advisories: none.

- **MS1 (High, verified)** — `android:allowBackup` unset (default true) in both manifests; cart snapshot,
  recently-viewed products and recent searches back up off-device (`shared_prefs`); tokens are
  Keystore-wrapped so they do not restore usable. Fix: `allowBackup="false"` or `dataExtractionRules`.
- **MS2 (Medium, verified)** — buyer `notification_router.dart` accepts any string as `orderId`/
  `productId` → `GoRouter.push`; seller-mobile validates UUIDs (`_uuidOrNull`). Port it.
- **MS3 (Medium, verified)** — `teka://` custom scheme skips the host allow-list
  (`deep_link_parser.dart:59-63`); any app can force in-app navigation (bounded by the route/slug regexes).
- **MS4 (Medium, verified)** — no `IOSOptions` on secure storage → default `whenUnlocked` (restorable to
  another device from an encrypted backup); use `first_unlock_this_device`.
- **MS5 (Medium)** — logout/account deletion leave cart cache, recently-viewed, searches, city on disk
  (same root as A4).
- **MS6 (Medium)** — Sentry scrub covers `message` + breadcrumbs only, phones-only regex (`+243` form),
  no email; no `sentry_scrub_test.dart` in either app.
- **MS7 (Medium)** — release builds not minified/shrunk/obfuscated (no R8, no `--obfuscate
  --split-debug-info`); no client secrets at stake, resilience only; staging shake-out required.
- Low: `LogInterceptor` registered unconditionally (URL+query printed only because dio's default
  `logPrint` is assert-guarded); `MarkdownContent` launches any URI scheme from CMS content; release
  falls back to the debug signing key when `key.properties` is absent; security-package version drift
  between the two lockfiles; `flutter_secure_storage` 11 drops `encryptedSharedPreferences` (plan the
  migration); `go_router` 14→18, riverpod 2→3, `app_links` 6→7 majors behind.

Test/CI (corrected after checking the last CI run): **API unit specs DO run in CI** (690 unit + 159 e2e on
the last `develop` run; the "0 matches" comment in `ci.yml:74-78` is stale). What never runs in any
workflow: `flutter test` (~440 tests incl. both privacy-manifest guards) and the three web vitest suites
(~150 tests incl. `middleware`, `safe-redirect`, `deep-link-association`, `posthog-scrub`). Missing:
`permissions:` on 8/10 workflows, SHA pins (all actions on tags incl. `appleboy/ssh-action@v1` holding
the prod SSH key), `.github/dependabot.yml`, a dependency-audit gate, secrets expanded into remote shell
strings (`deploy.yml:185,200-209`). No `pull_request_target` anywhere (good).
Test gaps: no IDOR/cross-user test for any entity, checkout idempotency-key lifecycle (mobile + API
replay), buyer router malformed ids, Sentry scrub, storage options, manifest hardening, OTP client state
machine, review-edit authz, refresh-token reuse; seller-mobile lacks the connectivity/retry/offline/cache
suites buyer has (identical code).

## Decisions needed (blocking for the affected PRs only)

1. **OTP login for non-buyer roles (S3).** Today a phone that belongs to a SELLER or ADMIN signs into that
   account via WhatsApp OTP (pinned as "decision #3"). Recommendation: restrict OTP to `BUYER` and return
   401 otherwise (sellers/admins keep email+password; buyer-web already redirects a seller phone to
   seller-web, which would change to an explicit message). Confirm.
2. **Surface binding (S1).** Recommendation: (a) `Origin` guard on all non-GET cookie-authenticated
   requests + `surface` claim in the JWT now; (b) narrowing the admin cookie domain (requires routing the
   API under each host) as a later PR. Confirm (a) now, (b) deferred.
3. **SUPPORT / FINANCE roles (S21).** Either let SUPPORT into admin-web with read-only UI (API already
   permits it) or drop the roles from the login allow-list. Which?
4. **Microsoft Clarity (S19).** Recommendation: remove it from seller-web (authenticated dashboard) and
   keep buyer-web only with `clarity('set','mask','All')` + CSP entries; or remove entirely (PostHog
   replay already masks inputs). Which?
5. **Empty town×category pages (SEO H6).** Recommendation: `noindex, follow` + excluded from the sitemap
   when the town-scoped product count is 0. Confirm.
6. **AI-crawler robots policy (SEO L2).** Cloudflare's managed robots block disallows GPTBot/ClaudeBot etc.
   Keep, or allow? (Traffic-policy decision; no code change either way, only documentation.)
7. **« Likasi » in metadata (SEO M8).** Remove until the town is activated (template from
   `getActiveCities()`), or is a Likasi launch imminent?
8. **Account lockout numbers (S5).** Proposed: 10 failed logins / 15 min per email → 15 min lock, Sentry
   event; OTP verify 5/min per phone + 429; register 3/h per IP; password-reset 3/h; refresh 30/min.
   Confirm or adjust.
9. **Payout destination change (S12).** Require current password + email/push notice + 24 h cooling-off
   before the next payout request. Confirm.
10. **Search free text to PostHog (A-Low).** Keep sending `search_performed` terms (phones scrubbed) or
    drop the term property? Recommendation: keep, add email scrub.
11. **Avatar orphan cleanup (A6).** API change: store the avatar `public_id` (new nullable column,
    additive migration) or derive it from the stored URL (no migration). Recommendation: derive from URL
    now, no schema change.

## Decision log

- **D1 (2026-09-06, confirmed by the owner): WhatsApp OTP ⇒ BUYER authentication only; SELLER/ADMIN ⇒
  email + password only, enforced by the API from the stored role.** Implemented in
  `security/otp-buyer-only`: `BuyerOtpService.issueOtp` skips the OTP row + WhatsApp send for a phone owned
  by a non-BUYER (response byte-identical to the buyer case; rate-limit row still recorded — closes OTP
  bombing of seller/admin phones; the only side channel is the absence of a message, observable solely by
  the handset owner); `verifyOtp` refuses such a phone with the same 401 as a wrong code before any token,
  cookie or user mutation (covers the app-review bypass too); `findOrCreateUserByPhone` only ever creates
  `role: 'BUYER'`. Schema note: `User.phone @unique` means one phone ⇒ exactly one account, so "same phone,
  buyer + seller" cannot exist and no identity merge is possible. Refresh, `/me`, logout and session
  restoration read the role from the DB row (`JwtStrategy.validate`, `AuthService.refresh`) — unchanged.
  Buyer-web's SELLER redirect and buyer-mobile's `SellerAccountException` are now defensive dead code
  (comments updated, logic kept). Tests: 8 unit cases + 7 e2e cases (issuance skip for SELLER/ADMIN and on
  resend, unknown + buyer still sent, verify refusal for SELLER/ADMIN with no cookie/token/user mutation,
  refusal byte-identical to a wrong code, `X-Teka-Surface` seller/admin/buyer ignored, app-review bypass
  refused, BUYER tokens minted with the stored role). The old e2e "signs into seller account (decision #3)"
  was inverted on purpose.

## Proposed PR sequence (small PRs into `develop`, merge commits)

| # | PR | Scope | Blocked by |
|---|---|---|---|
| 1 | **security/critical-hotfixes** | S2 `JsonLd` escaping (+test); S4 payments IDOR scoping (+cross-user e2e); S8 multer limits + magic-byte/EXIP reuse on product/avatar uploads; S10 scrub the app-review doc + prod boot warning; S7 `next` ≥ 15.5.21 bump (3 apps) | — |
| 2 | **security/origin-and-surface-binding** | S1 `OriginGuard` + JWT `surface` claim; make `X-Teka-Surface` required for cookie auth; tests | decision 2 |
| 3 | **security/auth-throttling** | S5 per-route `@Throttle`, login lockout, atomic OTP counter, resend cooldown on request (neutral register response deferred); S3 OTP role restriction (shipped as D1 / #672); S15 PII-safe logger; S6 real client IP moved here; e2e — **PR open** | decisions 1, 8 |
| 4 | **security/edge-and-headers** | S9 per-surface CSP owned by each app (no `unsafe-eval`; nonce + `strict-dynamic` on seller/admin; Google hosts gone; Sentry ingest + Clarity hosts derived at build; admin `img-src api.cloudinary.com`), headers on static assets, `Permissions-Policy`/COOP/CORP, `poweredByHeader:false`, `private, no-store` on seller/admin + buyer account pages, API helmet profile + no-store; Clarity off seller (D4), PostHog replay off seller/admin; S6 real IP shipped in PR 3, origin-firewall recommendation documented — **PR open** | decision 4 |
| 5 | **security/ci-test-supply-chain** | `flutter test` ×2 + web vitest ×3 + `next build` ×3 in CI; `permissions:` on all workflows + SHA pins (14 actions); `dependabot.yml`; `pnpm audit --prod --audit-level=high` gate (71 → 5 advisories via 24 same-major overrides, 3 documented exceptions); migration manifest gate; e2e flake investigation — **PR open** | — |
| 6 | **buyer-mobile/functional-1** | A1 cart/checkout totals (+tests); A2 offline cold-start session; A3 city gate offline; A4+MS5 session reset on logout/account switch; A5 avatar retry; A6 avatar orphan (API, decision 11) | decision 11 |
| 7 | **buyer-mobile/functional-2** | A7 category-by-slug; A8 review error surfacing; A9 iOS local notifications; A10 address phone normalisation + error surfacing; nameless buyers; French copy/accents/status labels; dead routes; guest PDP cart 401; notifications refetch-on-open | — |
| 8 | **mobile/security-hardening** | MS1 allowBackup; MS2 router UUID; MS3 `teka://` host; MS4 keychain accessibility; MS6 scrub breadth (+tests both apps); L LogInterceptor gate, markdown scheme allow-list; seller-mobile test parity | — |
| 9 | **buyer-web/seo-1** | SEO H1 sitemap pagination (+ failing-fetch test), H4 category H1, H5 homepage H1, H7 Organization logo + site-wide Organization/WebSite, M1 markdown strip, M2 og:type product, M6 PDP category link, M7 lastmod, M9 double brand, M10 sitemap entries, M11 brand « Autre », M8 Likasi (decision 7) | decision 7 |
| 10 | **buyer-web/seo-2** | H2/H3 server-render first page of grids + PDP core via `initialProducts`/`initialProduct` props; H6 empty-category gating (decision 5, needs `productCount` per city on the categories API); M3 trailing-slash 308 scoped around `/ingest`; M4 crawlable pagination; M5 town breadcrumb/LocalBusiness; ItemList | decision 5 |
| 11 | **buyer-mobile/tablet** | breakpoints helper, `productCardGridExtent(columns,width)`, `bottomSheetTheme`, gallery cap, `MaxWidthBody`, grids 2/3/4, tests at 600/1024 | PR 6 merged (shared files) |
| 12 | **seller-mobile/tablet** | mirror helper, form/list `MaxWidthBody`, image grid, sheets; width-parameterised test cases | — |
| 13 | **buyer-mobile/ux-polish** | evidence-based UX/UI fixes discovered during PR 6/7/11 runtime passes (typography, spacing, empty/error states, touch targets); no redesign | PRs 6, 7, 11 |
| 14 | **security/admin-and-financial** | S11 audit rows for product/order/user/review/settings/broadcast actions + `hardDelete` actor + suspend guard/revoke; S12 payout destination re-auth (decision 9); S13 application-document row-first + throttle + sweep; S14/S22 DTO bounds and banner URL validation; S21 SUPPORT model (decision 3) | decisions 3, 9 |
| 15 | **infra/containers** | S16 `USER node` + hardening in compose; secrets via `envs:` in ssh steps | — |
| 16 | **release-readiness** | integrated regression, runtime matrix (phone/tablet, web widths), docs, mobile release prep | all |

Recommended first PR: **#1 security/critical-hotfixes** — five independent, small, high-impact fixes,
none needing a policy decision, each with a test.

## PR records

### PR 1 — `security/critical-hotfixes` (2026-09-06)
Findings reconfirmed on `develop` `745e2d4` before changing code. Root causes and fixes:
- **S2 stored XSS via JSON-LD** — root cause: `JSON.stringify` output injected verbatim into a
  `<script>`; the HTML parser ends the element at any literal `</script`. Fix: `serializeJsonLd()` escapes
  `< > &` and U+2028/2029 as `\uXXXX` (still valid JSON) — `apps/buyer-web/src/components/seo/json-ld.tsx`
  (+ `json-ld.test.tsx`: no breakout sequence emitted, JSON round-trips, one script element renders).
- **S4 payments IDOR** — root cause: `GET /v1/payments/orders/:orderId/transactions` had no
  ownership predicate and no id validation. Fix: `UuidParam` + actor-scoped `order.findFirst`
  (buyer → own, seller → own, admin → any) returning 404 « Commande non trouvée » otherwise —
  `payments.controller.ts`, `payments.service.ts` (+ 6 e2e cases: owner 200, other buyer 404 with no
  transaction query, wrong seller 404 / order seller 200, admin 200, non-UUID 400 before the DB).
- **S8 unbounded, MIME-trusting public uploads** — root cause: bare `FileInterceptor('image')` (no
  multer `limits`, size checked after full buffering) and declared-MIME allow-lists on product images and
  avatars. Fix: shared `apps/api/src/common/uploads/image-upload.ts` — `imageUploadLimits` (5 MB,
  1 file) handed to multer so oversized bodies are refused while streaming (French 413 from the existing
  filter), `validateImageUpload()` sniffs the bytes (JPEG/PNG/WebP via the KYC primitives, GIF for
  products only), requires the declared type to agree, and strips EXIF/XMP before the public upload;
  `@Throttle 20/min` on both routes (IP-keyed for now; D8 will re-key). Spec: SVG-as-PNG, PDF,
  mismatch, GIF gating, EXIF stripping, oversize/missing.
- **S10 app-review bypass hygiene** — root cause: doc carried the review phone and code and a stale
  "ENABLED" status; `===` comparison. Fix: placeholders in `docs/app-review-login.md` (status: disabled,
  verified), constant-time comparison, `logger.error` on every production boot while the flag is on
  (+ 2 unit cases).
- **S7 `next` 15.5.18 → 15.5.25** in the three web apps (+ `eslint-config-next`), lockfile updated;
  `pnpm audit --prod` now reports 0 `next` advisories (37 transitive items remain for the supply-chain
  PR); production builds 30/22/32 pages.
Gates: API 708 unit / 170 e2e, root type-check, buyer-web vitest 14 files (JSON-LD test added), three
`next build`s. Runtime on the isolated API: transactions endpoint — non-owner buyer 404, wrong seller 404,
owner 200, admin 200, bad id 400; avatar and product-image uploads — SVG declared PNG 400, PNG declared
JPEG 400, 6 MB body 413 (streaming, French), valid JPEG 201; QA users, product and Cloudinary assets
deleted afterwards. Not exercised at runtime: a hostile product title through a live PDP (covered by the
vitest render test). Compatibility: avatar/product clients unchanged (same field, same French errors;
SVG/HTML uploads that were already broken at Cloudinary now fail earlier); transactions endpoint now 404s
for non-owners (buyer-web/mobile only ever request their own orders — no caller change); Next patch
bump only.

### PR 2 — `security/origin-and-surface-binding` (D2a, 2026-09-06)
**Root cause (reconfirmed on `develop` `6201534`):** the role was already trusted (re-read from the DB on
every request), but *which* of the three `.teka.cd` cookie namespaces authenticated a request was chosen
from the client header `X-Teka-Surface` (`surface.util.ts` `resolveSurface`, default `buyer`), `Origin`
was never checked, and CORS admits `teka.cd` with credentials — so JavaScript on the storefront could
select an admin's cookie by header. Cookies were also written for the header-chosen namespace.
**Security invariant now:** a session may only be READ from the namespace selected by the request
`Origin` (exact match against `ADMIN_WEB_URL` / `SELLER_WEB_URL` / `BUYER_WEB_URL` + remaining
`CORS_ORIGINS`; no Origin or an unknown/spoofed Origin ⇒ no cookie is read at all) and only WRITTEN to
the namespace of the account's stored role (`surfaceForRole`: BUYER→buyer, SELLER→seller,
ADMIN/SUPPORT/FINANCE→admin); a token found in namespace X whose stored role belongs to Y is refused
(401 « Session invalide pour cette interface »). `X-Teka-Surface` is telemetry only (mismatch logged),
still CORS-allow-listed for compatibility. Bearer (mobile) needs neither cookie nor Origin — unchanged.
No new JWT claim: the surface is a pure function of the trusted role, so a claim would add nothing the
role does not already bind. Admin and seller cookies are now `SameSite=Strict` (buyer stays `Lax`);
`Domain=.teka.cd` unchanged (D2b).
**Files:** `apps/api/src/auth/surface.util.ts` (rewritten: `surfaceForRole`, `buildSurfaceOriginMap`,
`surfaceFromOrigin`, `headerSurfaceHint`, request auth context), `auth/strategies/jwt.strategy.ts`
(origin-selected cookie extractor with `passReqToCallback`, role/namespace check, returns `surface` +
`authVia`), `auth/auth.controller.ts` (cookies set/cleared for `surfaceForRole`; cookie refresh reads the
Origin's namespace and rejects a role/namespace mismatch; logout, `/me` hint and account deletion use the
session's own surface; Strict/Lax helper), `auth/auth.service.ts` (`refreshTokens` also returns `role`),
`users/account-deletion.controller.ts`, `main.ts` (CORS comment), `test/test-utils.ts`
(`cookie-parser` registered — cookie paths were never testable before), `docs/session-management.md`.
**Tests:** `surface.util.spec.ts` (role→surface incl. unknown roles; exact origin matching incl. suffix/
prefix spoofs, scheme/port mismatch, `null`, multi-valued header; dev-port classification; CORS entries
never override admin/seller) and `test/auth-surface.e2e-spec.ts` (18 cases: all three sessions present in
one browser — each origin authenticates its own session; the six forged-header combinations change
nothing; storefront origin never reaches an admin-only route (403) whatever the header; missing /
unknown / malformed / spoofed Origin ⇒ 401; seller token planted in the buyer cookie ⇒ 401; forged role
claim in a token ⇒ stored role wins; bearer with no Origin / with a hostile Origin works; admin login sets
admin cookies (Strict) never buyer ones; logout clears only the session's surface; cookie refresh reads
the Origin's namespace only). Regression: API 736 unit / 188 e2e, type-check, buyer- and seller-mobile
auth-interceptor suites; the D1 OTP e2e (incl. surface-header cases) unchanged.
**Runtime (isolated API + all three web dev servers, one browser context holding admin + seller + buyer
sessions):** curl — buyer origin + `X-Teka-Surface: admin` ⇒ BUYER; admin-only route from the storefront
403, from the admin origin 200; no / evil / suffix-spoofed Origin ⇒ 401; planted seller cookie ⇒ 401;
bearer without Origin 200; cookie refresh 400 without Origin, 200 with the buyer origin (buyer cookies
re-issued); logout from the seller origin clears the three seller cookies only; admin `Set-Cookie`
`SameSite=Strict`, buyer `Lax`; API logged the forged-header mismatch. Browser — admin-web login →
dashboard with admin data, seller-web login → dashboard, buyer-web OTP login (mock provider) → signed-in
home; then from the buyer page's JS with credentials + forged admin header: `/me` ⇒ BUYER, admin route ⇒
403. Fixtures, QA buyer and temp admin password removed.
**Compatibility:** web api-clients unchanged (browsers always send `Origin` on cross-origin fetch; no
server-side cookie forwarding exists in any Next app); distributed mobile builds unaffected (bearer path,
no header, no Origin); non-browser cookie clients (curl) must now send `Origin` — none exist in
production. Tokens issued before the change keep working (no new claim).
**D2b requirements recorded:** dedicated admin API boundary under `admin.teka.cd/api` (nginx prod
location like the dev config), admin cookies scoped to `Domain=admin.teka.cd`, `CORS_ORIGINS` without
`admin.teka.cd` (same-origin), keep the Origin/role binding as defence in depth, local dev via the
existing per-port origins, CI docker-build-check unchanged, Cloudflare rule parity, rollback = revert
nginx + env (cookies re-issued on next login), one-time re-login for admins.

### PR 3 — `security/auth-throttling` (D8, 2026-09-06)
**Root cause (reconfirmed on `develop` `29ccb6f`):** the only application throttle was the global in-memory
`@nestjs/throttler` at 100 / min **per IP** (per process) plus nginx zones keyed on `$binary_remote_addr` —
which behind Cloudflare is the edge IP, and behind DRC carrier NAT is thousands of users. No auth route had
its own cap, there was no login lockout, the OTP issuance counter (`OtpRateLimit`) was a read-then-write
that parallel requests overshot, the 30 s resend cooldown was bypassable via `/request`, password-reset and
registration probing were unbounded, and the password-reset log line carried the submitted email.
**Design (D8 as approved — identity first, IP second, centralised, documented, tested):** new
`apps/api/src/common/rate-limit/` — `RateLimitService` + `AUTH_LIMITS` (the single table of limits, pinned
by a unit test), `RateLimitStore` (Postgres `auth_rate_limits`: key `scope:sha256(identifier)`, one atomic
`INSERT … ON CONFLICT DO UPDATE … RETURNING` per hit, idempotent lock UPDATE, hourly `@Cron` sweep; in-memory
twin with the same semantics for e2e), `TooManyRequestsException` (French copy + `retryAfterSeconds` →
`Retry-After` header via `HttpExceptionFilter`), `@IdentityThrottle(scope)` + `IdentityThrottleGuard`
(APP_GUARD after `JwtAuthGuard`, keyed on `req.user.userId`). Hooks: `BuyerOtpService` (issuance budget
replaces `OtpRateLimit`; verification budget counted before the app-review bypass and shared by claim /
account-deletion re-auth via `verifyOtpInternal`; cooldown now also on `/request`; cooldown 429 carries
`Retry-After`), `AuthService` (login: lock check before any password work, failure counted for known and
unknown emails alike, the 10th failure engages a 15 min lock, success clears; password reset counted before
the lookup and the PII log line removed; register counted before the 409 check; refresh keyed on the token
hash), six CSV routes (`reports`, `sales-analytics`, `search-analytics`) and both image-upload routes get a
per-user budget. Per-IP layer: `ThrottlerModule` switched to the object form with a French `errorMessage`,
loose per-route `@Throttle` on every auth route (values in `docs/api-reference.md § Rate limits`).
Infra: `nginx/nginx.prod.conf` restores the real client IP from `CF-Connecting-IP` for the published
Cloudflare ranges (`set_real_ip_from` ×22, `real_ip_recursive on`), so the nginx zones and the API's
`trust proxy` see the visitor, not the POP; existing zone values unchanged; validated with `nginx -t`
(nginx:alpine). Table `auth_rate_limits` = additive manual migration
`2026-09-06_auth_rate_limits.sql` (idempotent, in `auto-apply.list`, applied to the dev DB twice via the
manual path — never `db:push`); `OtpRateLimit` kept, no longer touched (drop in a later contract PR).
Register 409 → neutral response deliberately **not** changed (contract change; the per-email budget bounds
it instead).
**Tests (fail before / pass after):** `rate-limit.service.spec.ts` (17: hashed PII-free keys, window,
parallel hits without lost update, lock engagement on the limit-th hit, lock not extended, sweep, copy,
the `AUTH_LIMITS` table), `identity-throttle.guard.spec.ts` (4), `buyer-otp.service.spec.ts` (+6:
budget refusal before the Otp row, single count per call, clear on success, wrong code keeps budget,
bypass counted, cooldown on request), `auth.service.spec.ts` (+8: lock before bcrypt, failure counted
for known/unknown, success clears, reset/register/refresh budgets, no email in logs),
`test/auth-throttling.e2e-spec.ts` (18: sequential + **parallel bursts** on OTP request / verify with
exact 200/401 vs 429 counts, non-buyer phone counted with the same response, cooldown, claim/verify
shares the budget, login lock refuses the right password, unknown email byte-identical, normalised key,
success clears, reset known/unknown, register 409×3→429, refresh per token, CSV per admin with JSON and
another admin unaffected, per-IP backstop French 429 in its own app). `test-utils.ts` now clears the
memory store and every app's throttler counters between tests. Suites: **API 766 unit / 205 e2e**,
workspace type-check green.
**Runtime (isolated API :5051 on the real dev Postgres, disposable fixtures, mock WhatsApp):** parallel
burst of 12 OTP requests → exactly 3×200 / 9×429; 4th request and resend 429 with `Retry-After` and the
cooldown copy; 10 wrong codes → 401, then the correct dev code → 429 (`Retry-After: 891`); 10 wrong
passwords → 401 then the **correct** password → 429 « Trop de tentatives. Veuillez patienter 15 min… »,
case/whitespace variant of the email hits the same lock, another seller on the same IP logs in; parallel
burst of 30 wrong passwords → exactly 10×401 / 20×429; unknown email identical; reset unknown and known
3×200 → 429 (3 reset tokens created, not a 4th); register 409×3 → 429; refresh garbage ×60 → 429, other
token 401; CSV 10×200 → 429 with the JSON report still 200; per-IP backstop after 60 distinct emails →
« Trop de requêtes… » with `Retry-After: 900`; **the login lock survived an API restart** (state in
Postgres); `auth_rate_limits` rows contain only `scope:hash`; API logs show only hash prefixes (the dev-only
`MockWhatsappProvider` still prints the mock code — dev/mock provider only, refused in production, unchanged).
Browser: seller-web login with the locked account's correct password renders the French 429 message
verbatim. Buyer-web/admin-web/mobile need no change (all surface `error.message`; Dio maps 429 →
`rate_limit` with the API message). Fixtures, temp admin password, OTP rows and all throttle rows deleted.
**Cloudflare origin firewall (recommendation, not automated):** `set_real_ip_from` only trusts
`CF-Connecting-IP` from Cloudflare addresses, so a direct-to-origin connection cannot spoof it — but a
direct connection still bypasses Cloudflare's own protections. Restrict the origin's 443 to the Cloudflare
IP ranges (cloud firewall / `ufw`), or enable Authenticated Origin Pulls; re-check the IP list
(cloudflare.com/ips) when it changes.
**Follow-ups:** drop `otp_rate_limits` in a later contract migration; consider a neutral `register/email`
response (contract change) once the clients are updated.

### PR 4 — `security/edge-and-headers` (D4, 2026-09-06)
**Root causes (reconfirmed on `develop` `5af6b94`, after PRs #674–#676):**
- One nginx CSP map served all three hosts with `script-src 'self' 'unsafe-inline' 'unsafe-eval'` plus the
  retired Google OAuth hosts, no Clarity/Sentry hosts (so both were blocked in production) and no
  `api.cloudinary.com` (admin document previews blocked). `'unsafe-eval'` had no consumer: Next.js production
  bundles, posthog-js, Sentry and the Clarity tag never eval — only `next dev` does.
- nginx `add_header` is not inherited into a `location` that sets its own `add_header`: the `/_next/static/`
  and image locations (Cache-Control/expires) shipped JS/CSS/images with **no** HSTS, CSP, XFO or nosniff.
- The headers were only in the production nginx, so `next dev`, `next start` and every test ran without them;
  nothing could assert the policy. `X-Powered-By: Next.js` disclosed; no `Permissions-Policy`, COOP or CORP;
  `X-XSS-Protection` (legacy, buyer only); admin `X-Frame-Options: DENY` disagreed with CSP `frame-ancestors 'self'`.
- Seller/admin login pages were static (`Cache-Control: s-maxage=31536000`); the API sent no cache policy on
  personal responses; helmet's default CSP on the API advertised script/style sources for JSON.
- nginx and helmet both emitted `Strict-Transport-Security` with different values; the nginx one carried
  `preload` although the domain was never submitted.
- Clarity (session replay) was mounted on the authenticated seller dashboard; PostHog replay was enabled on
  seller and admin.
**Ownership (the design):** nginx emits **only HSTS** (`max-age=63072000; includeSubDomains`, `preload`
dropped; location blocks add_header-free so it inherits). Every page-level header is emitted by the app that
serves the page, so dev/start/Docker behave identically and tests assert the policy. Web: `next.config.ts
headers()` on `/:path*` (HTML + `_next/static` + `public/`) + `src/lib/security-headers.ts` (builder, unit
tested) + `middleware.ts`. API: `common/security/http-security.ts` (`applyHttpSecurity`, shared with the e2e
app). `poweredByHeader: false` ×3.
**Effective headers — before → after** (production, from the nginx map / helmet default → measured on
`next start` + the built API):
| | before | after |
|---|---|---|
| CSP script-src (all 3 web) | `'self' 'unsafe-inline' 'unsafe-eval' accounts.google.com apis.google.com www.gstatic.com` | buyer `'self' 'unsafe-inline'` (+ `www.clarity.ms scripts.clarity.ms` only when the id is baked in); seller/admin `'nonce-…' 'strict-dynamic' 'self'` |
| CSP connect-src | `'self' https://api.teka.cd accounts.google.com` | `'self'` + API origin + Sentry ingest origin derived from the public DSN (+ `*.clarity.ms` buyer with id) |
| CSP img-src | `'self' data: blob: res.cloudinary.com lh3.googleusercontent.com` | `'self' data: blob: res.cloudinary.com` (+ `api.cloudinary.com` admin only) |
| CSP frame-ancestors / frame-src | `'self'` / `'self' accounts.google.com` | `'none'` / `'none'` everywhere |
| also | — | `base-uri 'self'`, `object-src 'none'`, `form-action 'self'`, `worker-src 'self'`, `manifest-src 'self'`, `upgrade-insecure-requests` (prod) |
| X-Frame-Options | SAMEORIGIN (buyer, seller), DENY (admin) | DENY ×3 |
| Referrer-Policy | strict-origin-when-cross-origin ×3 | buyer unchanged; seller + admin `same-origin` (signed document URLs / internal paths never leave the origin) |
| Permissions-Policy / COOP / CORP | none | camera, microphone, geolocation, payment, usb, bluetooth, accelerometer, gyroscope, magnetometer, display-capture `=()`, `fullscreen=(self)`; COOP + CORP `same-origin` (no COEP — Cloudinary images) |
| HSTS | nginx `…; preload` + helmet `max-age=31536000; includeSubDomains` on the API (two headers) | nginx only, `max-age=63072000; includeSubDomains` |
| X-XSS-Protection / X-Powered-By | `1; mode=block` (buyer) / `Next.js` | gone / gone |
| Static assets (`/_next/static`, `public/`) | no security headers | full set; `_next/static` immutable (Next), public images/fonts `public, max-age=86400` (buyer) |
| Cache-Control seller/admin HTML | `s-maxage=31536000` on login | `private, no-store` on every HTML response (middleware) |
| Cache-Control buyer account pages | static `s-maxage` | `private, no-store` on `/profil`, `/commandes`, `/paiement`, `/favoris`, `/addresses` (public SEO pages untouched) |
| API | helmet default CSP (`script-src 'self'…`), no cache policy | CSP `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`; `Cache-Control: no-store` on any request carrying a cookie or bearer; nosniff, no-referrer, COOP/CORP same-origin, no HSTS from the app |
**Why `'unsafe-inline'` stays on the buyer script-src (the one exception):** the storefront is the SEO
surface — `next build` prerenders/ISR-caches `/`, `/[ville]`, `/categories`, `/connexion`, `/panier`,
`/profil`… (route table checked) and a per-request nonce would force every page dynamic. Next.js's own
hydration payloads, the service-worker registration and the Clarity tag are inline scripts. Data blocks
(`application/ld+json`) are not executed and need no nonce. Hashes cannot cover per-page hydration
payloads. `style-src 'unsafe-inline'` stays on all three (React `style` props / next/image sizing are
style attributes; no nonce exists for attributes). **No `'unsafe-eval'` anywhere in production**; `next dev`
adds `'unsafe-eval'` + `ws:`/`wss:` (HMR) + `picsum.photos` (buyer) only.
**Nonce architecture (seller/admin):** middleware generates a 128-bit nonce, sets `x-nonce` +
`content-security-policy` on the *request* headers (Next.js stamps every framework script from there) and
the CSP + `X-Robots-Tag` + `private, no-store` on the response; the root layout `await headers()` so every
route renders per request. Measured: 16/16 scripts on the login page carry the nonce, 0 without. Negative
tests in the browser: an injected `onerror=` handler is refused (`script-src-attr`), a parser-inserted
`<script>` without nonce does not run, `fetch`/`<img>`/`<iframe>` to a foreign origin are refused
(connect-src / img-src / frame-src violations), and all four surfaces refuse framing from a foreign
origin (`frame-ancestors 'none'`, checked from a page on :5099).
**Clarity:** removed from seller-web (component, layout, Dockerfile ARG, deploy build-arg, dev env,
docs; the `NEXT_PUBLIC_CLARITY_PROJECT_ID_SELLER_WEB` secret can be deleted). Kept on buyer-web; its CSP
entries appear only when the id is baked in. The buyer project's masking mode is a Clarity-dashboard setting
that cannot be verified from the repository — `docs/clarity.md` now makes "Strict" a required check and
says how to switch the tag off (empty secret) if it cannot be confirmed. PostHog session replay disabled
in code on seller-web and admin-web (`disable_session_recording: true`); buyer unchanged
(`maskAllInputs`).
**Third-party origins (from actual runtime traffic):** API origin (`NEXT_PUBLIC_API_URL`),
`res.cloudinary.com` (images), `api.cloudinary.com` (admin signed private downloads only), Sentry
`o…ingest.de.sentry.io` (derived from the DSN at build time; absent when no DSN), `clarity.ms` (buyer, id
present). PostHog via `/ingest` rewrite (same origin) — no `posthog.com` in any CSP. Fonts self-hosted
(next/font). No WebSocket/EventSource in the apps.
**Files:** `apps/{buyer,seller,admin}-web/src/lib/security-headers.ts` (+ `.test.ts`),
`apps/{seller,admin}-web/src/middleware.ts` (+ `.test.ts`), `apps/buyer-web/src/middleware.ts` (+ test),
three `next.config.ts`, two root layouts, `apps/seller-web/src/components/analytics/clarity.tsx` (deleted),
two `posthog-provider.tsx`, `apps/seller-web/Dockerfile`, `.github/workflows/deploy.yml`,
`.env.development`/`.env.production` (comments), `apps/api/src/common/security/http-security.ts`,
`apps/api/src/main.ts`, `apps/api/test/test-utils.ts`, `apps/api/test/security-headers.e2e-spec.ts`,
`apps/buyer-web/src/components/seo/json-ld.test.tsx` (+2 cases), `nginx/nginx.prod.conf`,
`docs/{clarity,analytics,architecture,deployment}.md`.
**Tests:** buyer-web 12 header cases + 2 middleware cache cases + 2 JSON-LD cases (`</SCRIPT >`, U+2028/9,
no nonce on data blocks); seller-web/admin-web 11 header cases each (nonce format, strict-dynamic, no
unsafe-inline/eval, nonce validation, frame-ancestors, exact connect-src, no Clarity/Google/PostHog host,
img-src per surface, dev additions, fixed header set) + 4 middleware cases each (nonce CSP + robots +
no-store on 200/307, fresh nonce per request, request-header hand-off); API e2e 9 cases (baseline on
200/400/401/404/429, no misleading CSP, no HSTS, no-store on bearer/cookie, CSV nosniff attachment
no-store, anonymous catalogue untouched). Suites: API 766 unit / 214 e2e, buyer-web 97, seller-web 36,
admin-web 60, workspace type-check, three production builds, `nginx -t` on the full prod config (dummy
cert, stub upstreams).
**Runtime (isolated API :5051 + `next start` ×3 on the production builds, fixtures: one QA seller with
`</script><script>alert(1)</script>` / `<!--` / U+2028/U+2029 in product title, description and shop name,
one uploaded identity document, temp admin, one OTP buyer):** curl matrix per surface on 200 / 307 / 308 /
404 / static chunk / public asset / robots / sitemap / API 200-401-404 (all as in the table above; the
only response without the set is Next.js's own 308 redirects from `next.config` `redirects()` — no body,
nothing to protect). Browser (Chrome, isolated context): buyer home, search, category, hostile PDP (title
rendered literally, 2 valid JSON-LD blocks, no script executed, no CSP violation), login → OTP (mock) →
home → profile → checkout; seller login → dashboard → verification → profile → products → earnings; admin
login → dashboard (Action Center) → sellers list (hostile shop name rendered literally) → seller detail with
the signed `api.cloudinary.com` document preview loading → payouts → commission — **zero CSP violations,
zero hydration errors, Recharts and PostHog fine under the nonce**. Console noise seen and explained:
`/_next/image` 400s for `picsum.photos` demo images (production build excludes the dev host — data, not
headers), a pre-existing dev-DB drift (`reviews.title` column missing → reviews list 500), guest `/me` 401s.
Fixtures, temp admin password, uploaded document (Cloudinary asset destroyed) and throttle rows deleted.
**Cloudflare / direct origin (findings, no changes made):** `docker-compose.prod.yml` publishes 80/443 on
the VPS; nothing in the repository restricts who may connect, so the origin currently accepts arbitrary
public connections. `set_real_ip_from` (D8) only trusts `CF-Connecting-IP` from Cloudflare addresses, so a
direct connection cannot spoof the IP — but it bypasses Cloudflare's WAF/DDoS layer and hits nginx's per-IP
zones with its own address. nginx could reject non-Cloudflare peers itself (`geo $realip_remote_addr` +
`return 403`), but that belongs with a decision on emergency direct access. **Recommended infrastructure
action (manual):** VPS firewall allowing 443 only from Cloudflare's published ranges (or Authenticated
Origin Pulls), Cloudflare SSL/TLS *Full (strict)*; re-check the IP list when Cloudflare updates it.
**D2b interaction:** the nonce CSP and `Referrer-Policy: same-origin` on admin are independent of where the
admin API lives; when D2b moves it to `admin.teka.cd/api`, `connect-src` shrinks to `'self'` (the builder
takes the API origin from `NEXT_PUBLIC_API_URL`, so no code change beyond the env). The admin `img-src`
allowance for `api.cloudinary.com` stays.
**Production / config implications:** no env or migration change; nginx reloads on deploy; the buyer
CSP is fixed at build time from the three `NEXT_PUBLIC_*` build-args (API URL, Sentry DSN, Clarity id) —
a new Sentry org/region or a Clarity id change needs a rebuild, not a runtime edit; the seller Clarity
secret is unused. HSTS `preload` was removed from the header: browsers that cached the previous policy
keep it until `max-age` elapses, which is harmless (the hosts stay HTTPS-only).
**Remaining risks:** buyer script-src keeps `'unsafe-inline'` (mitigated by output encoding — the JSON-LD
fix — and by having no `eval`, `base-uri`, `object-src` or foreign hosts); `style-src 'unsafe-inline'`
everywhere; `strict-dynamic` trusts scripts created by trusted code (DOM-XSS via `createElement('script')`
is not stopped — markup injection is); Clarity masking on the buyer is unverifiable from the repo; the
origin is reachable directly until the firewall rule is applied; CI still runs no web tests / production
builds (PR 5); the `X-Robots-Tag`/`noindex` on seller/admin is unchanged and re-verified.

### PR 5 — `security/ci-test-supply-chain` (2026-09-06)
**Baseline reconfirmed on `develop` `1d74149` (after PRs #674–#677) — what changed since Phase 0:** API
unit specs already ran in CI (the "noop" step name was stale); seller-web and admin-web have since gained
Vitest suites (36 + 60 cases) and buyer-web grew to 97; `flutter test` had grown to 258 (buyer) + 186
(seller) and still ran in no workflow; no workflow ran `next build` on `develop` (only the Docker build
check on PRs to `main`). Still true from Phase 0: 8/10 workflows had no `permissions:` block, all 14
distinct actions were on moving tags (incl. `appleboy/ssh-action@v1` holding the production SSH key), no
`.github/dependabot.yml`, no dependency-audit gate, `pnpm audit` at **71 advisories (2 critical / 41
high / 22 moderate / 6 low; 37 reachable from production dependencies)**, secrets expanded into the
remote shell string in `deploy.yml`, no `pull_request_target` (good), CodeQL via GitHub default setup
(JavaScript/TypeScript + Actions — no repo workflow to maintain), no branch protection readable via the
API (repository setting, not code). Secret hygiene: no credential-shaped string in any tracked file, no
`.env`/keystore/service-account/provisioning file ever committed (history checked; only `.env*.example`),
`.dockerignore` excludes `.env.*`, artifacts uploaded are the AAB/IPA only, no step prints secret values.
**Changes:**
- **CI matrix (`ci.yml`)** — new jobs: `Web Tests` (three Vitest suites, one step each so a failure is
  never masked), `Web Build (buyer|seller|admin)` (real `next build`, matrix, `fail-fast: false`),
  `Flutter Tests (buyer|seller)` (matrix legs, `flutter test --reporter expanded`, SDK cache),
  `Dependency Audit` (`pnpm audit --prod --audit-level=high` blocking + full-tree report, non-blocking);
  `API Tests` now runs the unit suite for real (`--passWithNoTests` and the stale "noop" name removed);
  `Release Config` also runs the new auto-apply manifest gate. Existing `Lint & Type Check`, `Flutter
  Analysis` ×2, `Release Config` unchanged in substance. `pr-validation.yml` (PRs to `main`) untouched
  apart from pins/permissions.
- **Workflow token least privilege** — top-level `permissions: contents: read` on all 10 workflows;
  `deploy.yml` keeps its job-level `packages: write` (build/push) and `packages: read` (VPS pull) —
  everything else needs only checkout. Artifact upload/download use the runtime token, not `GITHUB_TOKEN`.
- **Action pinning** — every `uses:` (14 distinct actions, 45 references) pinned to the commit SHA the
  moving tag resolved to on 2026-09-06, with the release tag in a trailing comment
  (`actions/checkout@11d5960a… # v4.4.0`, `appleboy/ssh-action@0ff4204d… # v1.2.5`, …). No version
  changed except `ruby/setup-ruby`, whose `v1` is a branch, pinned to release `v1.321.0`. Dependabot's
  `github-actions` group keeps the SHAs current. `actionlint 1.7.7` passes (two pre-existing
  info-level shellcheck notes in `release-mobile-ipa.yml` about `ls` remain).
- **Dependabot** (`.github/dependabot.yml`, new) — npm workspace (weekly, minor+patch grouped, majors
  ignored so they stay deliberate, limit 5), github-actions (weekly, grouped), pub for both Flutter apps
  (weekly, minor+patch grouped, limit 2 each), docker base images (monthly). Security updates always on.
  Nothing auto-merges.
- **Dependency advisories** — `pnpm.overrides` extended with 24 same-major pins (path-to-regexp, qs,
  body-parser, lodash, websocket-driver, file-type, dompurify, fflate, protobufjs, brace-expansion ×2,
  js-yaml ×2, nanoid, postcss, fast-uri, browserslist, flatted, picomatch, handlebars, defu, ajv,
  @babel/core, @humanfs/node; five superseded rules removed). Result: **71 → 5 advisories (0 critical, 3
  high, 0 moderate, 2 low)**; the 3 remaining high are documented exceptions in
  `pnpm.auditConfig.ignoreGhsas` with follow-ups: `sharp` 0.34.5 → 0.35 (GHSA-f88m-g3jw-g9cj, libvips
  CVEs; the Next.js image optimizer — needs a Next-compatible bump), `effect` 3.18 → 3.20
  (GHSA-38f7-945m-qr2g) and `deepmerge-ts` 7 → 8 (GHSA-ggr8-5vv4-36mx) — both only inside `@prisma/config`
  (CLI config loading at generate/migrate time, never the API process). `esbuild` 0.27 → 0.28 (low,
  dev-only via tsx/vite) left for Dependabot. **Next.js**: `15.5.25` is the latest 15.x and no GitHub
  advisory affects it — the PR #674 bump stands; nothing to do.
- **Flutter/Dart** — `flutter pub outdated`: no security advisory on any dependency (pub.dev reports
  none); behind on majors only (go_router 14→18, riverpod 2→3, flutter_secure_storage 10→11,
  app_links 6→7, connectivity_plus 6→7, flutter_local_notifications 19→22, share_plus 10→13) — planned
  migrations (PR 8 / mobile hardening), not this PR. Dependabot `pub` will surface minors.
- **Release gates** — `apps/api/prisma/migrations/check-manifest.sh`: every auto-apply entry exists, no
  duplicates, no destructive statement (DROP/TRUNCATE/DELETE) in an auto-applied file, every CREATE
  TABLE/INDEX is `IF NOT EXISTS`, `ADD COLUMN` without `IF NOT EXISTS` warns; SQL comments stripped first.
  Proven on the real manifest (10 entries OK) and on a synthetic bad manifest (all four failures fire).
  TestFlight group mapping test unchanged.
- **Security regression gate — decision:** keep the invariants distributed in their suites (D1 OTP in
  `auth.e2e`/`buyer-otp.service.spec`, JSON-LD in `json-ld.test`, payments IDOR in `payments.e2e`,
  uploads in `image-upload.spec`, D2a in `auth-surface.e2e`, D8 in `auth-throttling.e2e`, D4 headers in
  `security-headers.e2e` + the three web header/middleware tests). They all run on every PR now (API,
  web, mobile jobs), so a named duplicate suite would only drift. The mapping above is the "gate".
- **API e2e flake — reproduced, explained, fixed, measured.** Baseline on `1d74149`: 1 failure in 6
  full runs (`password-reset/request … SELLER` answered non-200) and 1 in 25 runs of `auth.e2e` alone
  (`POST /api/v1/auth/register` expected 404, got **501 Not Implemented**), both while the machine was
  under concurrent load (`flutter test` running); 0 in 40 unloaded runs — plus the earlier
  `reports.e2e` "bare Bearer token" failure recorded in this initiative. Elimination: no code in the API,
  Nest core, Express 5, `router`, `finalhandler`, helmet, the throttler, supertest or superagent emits a
  501 — the status came from below the application layer. Mechanism: `createTestApp()` never listened, so
  supertest started **and stopped the shared `http.Server` for every request**; on Node ≥ 19 (keep-alive
  agent by default) that listen/close churn is exactly the window in which a request can be answered by
  a closing server — the same class of failure the D8 parallel bursts hit as ECONNRESET, which the
  throttling spec had already worked around with its own `app.listen(0)`. Narrow fix: `createTestApp()`
  now listens once on an ephemeral port (`test/test-utils.ts`; the spec-local listen removed). After:
  **0 failures in 6 full runs and 0 in 40 `auth`+`reports` runs under a four-core CPU load** (same
  protocol). No retries, no `continue-on-error`, no relaxed assertion; the regression coverage is the
  suite itself running on every PR, with the mechanism documented at the bootstrap. Confidence: high on
  the mechanism (churn removed, symptom gone under load), not a captured packet-level proof of the 501.
**Not done here (scope):** secrets passed to the remote shell via `envs:` (PR 15), branch protection /
required checks (repository setting — recommended: require `Lint & Type Check`, `API Tests`, `Web Tests`,
`Web Build (*)`, `Flutter Tests (*)`, `Dependency Audit`, `Release Config` on `develop` and `main`),
CodeQL config-as-code (default setup is adequate), major dependency upgrades.
**Cost:** the CI run grows from 4 jobs (~2.5 min wall) to 12 jobs; the new legs run in parallel — web
tests ~1.5 min, each `next build` ~3 min, each `flutter test` ~3 min incl. SDK setup, audit ~1 min —
so wall time ≈ 5 min, minutes ≈ 25 per run.

### Branch protection — recommended required checks (repository setting, not code; 2026-09-06)
Exact GitHub check names on `develop` after PR 5 (`db1b5fb`): `Lint & Type Check`, `API Tests`,
`Web Tests`, `Web Build (buyer-web)`, `Web Build (seller-web)`, `Web Build (admin-web)`,
`Flutter Tests (buyer-mobile)`, `Flutter Tests (seller-mobile)`, `Flutter Analysis (buyer-mobile)`,
`Flutter Analysis (seller-mobile)`, `Dependency Audit`, `Release Config`. CodeQL (default setup) reports
`Analyze (javascript-typescript)` and `Analyze (actions)` plus the umbrella `CodeQL`; require the two
`Analyze (…)` checks. Apply to `develop` and `main` (PRs to `main` additionally run `pr-validation.yml`:
`lint-typecheck-test`, `docker-build-check (…)` — recommend requiring the four `docker-build-check` legs
on `main` only). Not applied automatically: no approval yet and the API reports no readable protection.

**Dependabot after PR 5 (observed on `db1b5fb`):** the first run opened 7 PRs (#679–#685) and its three
npm jobs failed. Cause from the job logs: Dependabot runs pnpm 10, which ignores the `pnpm` field of
`package.json` ("The pnpm field … is no longer read … keys ignored: pnpm.overrides, pnpm.auditConfig"),
so its `pnpm update --lockfile-only` resolves without our security overrides and aborts
(`HelperSubprocessFailed`). Fix (small follow-up PR, not folded into the buyer work): declare
`"packageManager": "pnpm@9.15.9"` in the root `package.json` so Dependabot uses the same pnpm as CI, add
`ignore: semver-major` to the `docker` and `github-actions` groups (the first run proposed
`node:20-alpine → 26-alpine` ×4 and `checkout v4 → v7`-class bumps), and close #679–#683 unmerged.

### PR 6 — `buyer-mobile/functional-readiness-1` (session · offline · account isolation, 2026-09-06)
**Split (as suggested in the brief) and why:** the Buyer Mobile audit lists 2 Critical + 8 High + ~20
Medium items across five unrelated areas; one PR would be unreviewable. Order chosen by blast radius:
**A** session/offline/account isolation (this PR — every other flow sits on top of a session that must
survive an offline start and never leak between accounts), **B** pricing/cart/checkout (A1, next),
**C** ratings/profile/avatar (A5, A6/D11, A8, nameless buyers, stale header), **D** notifications/deep
links/localization/obsolete UI (A7, A9, A10, enums, accents, `Occasion`, dead routes, guest PDP 401).
**Phase 0 findings reconfirmed on `develop` `db1b5fb` (after PRs #674–#678):** A1 confirmed live on the
emulator (cart line 9.350 FC vs total 11.000 FC for the -15 % demo product) — deferred to PR B; A2, A3,
A4 confirmed in code and on the emulator (the pre-fix app would have cleared tokens on any `/me` failure,
fetched cities before reading the stored town, and kept the cart snapshot/orders/notifications across
accounts); the Medium "guests fire a doomed `/v1/cart` on every PDP" confirmed (constructor fetch) and
fixed here as part of the cart lifecycle; "profile header stale after edit" still open (PR C). Nothing in
the A2–A4 set proved stale.
**Root causes and fixes:**
- **A2** — `AuthRepository.getCurrentUser()` returned `null` on *any* error and `checkAuthStatus()`
  cleared the tokens. Now `checkSession()` returns `SessionOk` / `SessionRejected` (401 or 403 after the
  interceptor's refresh attempt) / `SessionUnreachable` (no network, DNS, timeouts, 5xx, 429, malformed
  body). Only a rejection clears tokens (and the private disk state). Unreachable ⇒ the app stays
  `authenticated` on the stored credentials with the cached profile and `AuthState.sessionVerified:false`;
  `app.dart` re-runs the check when the connectivity machine comes back online; a verified session is not
  re-checked on every reconnect. Profile cached in `TypedCache` (`userProfile`, 30 d) on every verified
  session and login. The account screen falls back to that cached profile when its own `/me` fails.
  `AuthInterceptor.isConnectivityError` made public (identical mirror in seller-mobile — `diff -r` clean).
- **A3** — `CityNotifier` fetched `/v1/cities` before reading the stored town, inside one `try`, so an
  offline start left `selectedCity` null and the router forced `/city-selection`. Now the active town
  list is cached (`citiesList`, 30 d, public data); on a fetch failure the stored town is restored from
  the cache and the gate stays shut; a first launch offline with nothing cached still shows the picker
  with its retry.
- **A4** — logout only cleared tokens. New `SessionScope` (`features/auth/data/session_scope.dart`) owns
  the per-account disk state — cached profile, cart snapshot, recently viewed, recent searches — and
  `clearPrivateState()` runs on logout, on a server rejection and *before* another account's session
  becomes visible (OTP verify + claim). Public catalogue caches are untouched. In memory: `cartProvider`,
  `ordersProvider`, `notificationsProvider` now listen to `authProvider` (as wishlist/city already did) —
  reset on logout, load on sign-in; the cart no longer auto-fetches in its constructor (guest 401 gone);
  `notificationUnreadCountProvider` watches the session and is 0 for guests; the recently-viewed section
  rebuilds on session change. PostHog `reset()` and the Sentry user were already handled.
**Files:** `apps/buyer-mobile/lib/features/auth/data/{auth_repository,session_scope}.dart`,
`features/auth/presentation/providers/auth_provider.dart`, `app.dart`,
`features/city/presentation/providers/city_provider.dart`, `core/cache/cache_keys.dart`,
`features/{cart,orders,notifications}/presentation/providers/*_provider.dart`,
`features/catalog/data/recently_viewed_store.dart`,
`features/catalog/presentation/widgets/recently_viewed_section.dart`,
`features/profile/presentation/screens/profile_screen.dart`, `core/network/auth_interceptor.dart`
(+ seller-mobile mirror). No API, web or contract change.
**Tests (+24, all fail on the old code):** `auth/session_check_test` (10: 200/401/403/no network/timeout/
429/5xx/malformed body classification), `auth/offline_cold_start_test` (6: unreachable keeps tokens +
cached profile, unreachable without cache, rejection clears tokens + disk, confirmation caches the
profile, no tokens ⇒ no server call, reconnect re-verification then a later rejection),
`city/city_offline_start_test` (4), `session/account_isolation_test` (3: A → logout → B with cart/orders/
notifications/badge/profile/history/searches; guest never fetches the cart; offline session hydrates the
cached cart) + shared `session/fake_auth.dart`; existing cart tests adapted to the session-scoped
lifecycle. **buyer-mobile 282 / seller-mobile 186 tests pass; `flutter analyze` at the 6-info baseline.**
**Emulator (Android, development flavor debug build, dev API on :5050 with the mock WhatsApp provider,
two disposable OTP buyers):** fresh install → town gate → Lubumbashi → home; Buyer A login → discounted
product added (A1 evidence) → kill app → **wifi + data off → cold start: home with Lubumbashi (no gate),
cart badge 1 from the snapshot, "Vus récemment" from disk, offline toast, account tab shows the cached
profile, no login screen** → network back → the app re-checked `/me` on its own (device log 19:30:01,
before any tap) → logout → cart badge gone, disk holds only `teka_cache_cities_v1` (verified with
`run-as`), home no longer lists the history → Buyer B login → own account, empty cart, no A item → B
logout → A login → A's server cart (1 item) is back. Two debug-build ANRs came from emulator input
injection speed (system_server ANR'd too), not the app — typing digit-by-digit avoided them. **iOS not
exercised** (no simulator input tooling in this environment); the changed code is platform-neutral Dart.
**Real push delivery not exercised** (out of this PR's scope).
**Privacy:** nothing new reaches Sentry or PostHog — the cached profile lives in SharedPreferences only;
identity stays id + role.
**Remaining Buyer Mobile issues (next PRs):** B — A1 totals; C — A5 avatar retry via
`postMultipartWithAuthRetry`, A6/D11 previous-avatar destroy (API), A8 review errors, nameless buyers,
stale profile header, own review twice, comment cannot be cleared; D — A7 category slug deep link, A9 iOS
foreground notifications, A10 address phone normalisation + error surfacing, raw `REFUNDED`/unknown
status enums, ~12 missing accents, `Occasion` filter, notifications refetch-on-open, dead routes, CMS
relative links, `RETURNED` filter. Observed but out of scope: offline requests take ~15 s to fail on a
cold start before the connectivity machine settles (retry interceptor), and the home does not refetch
after reconnect.

### PR 7 — `buyer-mobile/pricing-cart-checkout` (Buyer Mobile PR B, A1, 2026-09-06)
**Root cause (reconfirmed on `develop` `c470e63`):** the API has always been authoritative — `GET
/v1/cart` returns `totalCDF` (promo when set, else regular, × qty; `CartService.serializeCart`), `POST
/v1/checkout/quote` returns `subtotalCDF` / `deliveryFeeCDF` / `totalCDF` at current prices, and
`CheckoutService.checkout` persists `unitPriceCDF = discountPriceCDF ?? priceCDF` with
`listUnitPriceCDF` for the struck-through original. Buyer Mobile ignored all three: `CartState.totalCDF`
summed `priceCDF × qty` (the regular price — the cart line already used `effectiveCDF`, so the line and
the total disagreed on the same screen), the checkout line showed the regular unit price, « Sous-total »
reused that wrong total and « Total » added the quoted fee to it, and the offline cart snapshot dropped
`discountPriceCDF` so a relaunch showed the regular price. Observed live before the fix: line 9.350 FC,
total 11.000 FC. Buyer Web computes with `effectiveCentimes` (0 < promo < price ⇒ promo) everywhere;
only the PDP title and the Product JSON-LD `Offer.price` used a second expression — aligned to the helper.
**Authoritative rule used:** `effective = discountPriceCDF ?? priceCDF`, where the API guarantees on
write `0 < discountPriceCDF < priceCDF` (`ProductsService.validateDiscount`). The client keeps one
implementation of that rule (`CartItemProduct.effectiveCDF`, with the range check as a defensive
no-op) for optimistic edits and the offline snapshot, and otherwise displays the server's numbers: the
cart's `totalCDF` from the last response (`CartState.serverTotalCDF`, cleared during an in-flight
optimistic edit, restored from the response), the quote's `subtotalCDF`/`totalCDF` on the review screen.
No competing promotional rule was introduced; no expiry semantics exist in the API and none were invented.
**Price change between cart and checkout:** the quote is recomputed at current prices; when its subtotal
differs from the cart the buyer was shown, the cart lines are refetched and the review screen shows « Les
prix de votre panier ont été mis à jour. Vérifiez le montant avant de confirmer. » — the buyer confirms
the new amount knowingly; nothing is reserved or held. Delivery unavailable ⇒ no grand total, order
blocked (unchanged).
**Files:** `apps/buyer-mobile/lib/features/cart/data/models/cart_model.dart` (`serverTotalCDF`,
`computeEffectiveTotalCDF`, BigInt line totals), `features/cart/presentation/providers/cart_provider.dart`
(state total, snapshot keeps the promo), `features/checkout/presentation/providers/checkout_provider.dart`
(`quoteSubtotalCDF`, `quoteTotalCDF`, `pricesChanged` + refetch),
`features/checkout/presentation/screens/checkout_screen.dart` (effective unit price with the regular
struck through, quote-driven Sous-total / Total, notice); `apps/buyer-web/src/app/[ville]/[product]/page.tsx`
(title + JSON-LD via `effectiveCentimes`); `apps/api/src/cart/cart.service.spec.ts` (new, pins the total).
**No API behaviour or contract change**, no schema, no env.
**Tests:** buyer-mobile +14 — `cart/cart_pricing_test` (effective rule incl. promo ≥ price / 0 / garbage,
no promo ×1/×3, promo ×1/×2 = 9.350 / 18.700 FC, mixed 43.700 FC, the old regular-price sum is rejected,
2.700.000.000 FC BigInt, root `totalCDF` parsed and preferred, optimistic edit drops then restores the
server total, snapshot keeps the promo offline), `checkout/checkout_pricing_test` (quote-driven 9.350 /
2.000 / 11.350, quote ≠ cart ⇒ refetch + flag, delivery unavailable ⇒ no total). API +3
(`cart.service.spec`). Formatting covered by the existing `price_formatter_test` (`.` thousands, `FC`).
**buyer-mobile 297 · API cart spec 3 · buyer-web 98 · type-check green.**
**Emulator (dev API, disposable buyer, real dev DB — promo « Accessoires salle de bain » 11.000 → 9.350
FC ×2, full-price « Johnnie Walker » 25.000 FC ×1, Lubumbashi address, zone fee 3.000 FC):**
| step | shown | API / DB |
|---|---|---|
| cart lines | 9.350 FC × 2 = 18.700 FC · 25.000 FC | `GET /cart` items promo 935000 / regular 2500000 |
| cart total | **43.700 FC** (was 47.000 with the old sum) | `totalCDF` 4370000 |
| review | 9.350 FC × 2 ~~11.000~~ 18.700 · Sous-total 43.700 · Frais 3.000 · Total **46.700 FC** | quote 4370000 / 300000 / 4670000 |
| promo lowered to 9.000 FC in the DB while in the cart, checkout re-entered | notice shown, lines 9.000 × 2 = 18.000, Sous-total 43.000, Total **46.000 FC** | quote at current prices |
| order confirmed | order detail 9.000 × 2 = 18.000 · 25.000 · 43.000 + 3.000 = **46.000 FC** | persisted `subtotalCDF` 4300000, `deliveryFeeCDF` 300000, `totalCDF` 4600000; items unit 900000 (list 1100000) ×2, 2500000 ×1 |
Buyer Web (dev server against the same API): PDP `<title>` « … - 9 350 FC à Lubumbashi », Product
JSON-LD `Offer.price` = `9350` CDF (effective). The visible PDP price is client-rendered (Phase 0 H3) and
was not exercised in a browser. Order, buyer, address, cart, tokens deleted; product stock and promo
restored. iOS not exercised. Fixtures, screenshots removed.
**Unresolved pricing edge cases (recorded, not in scope):** the API has no promo expiry; a seller
editing a promo while a buyer is on the review screen is caught only on the next quote (address change or
re-entry), not by a timer; USD totals are display-only and were not touched; the success screen still
shows the raw `PENDING` status (PR D); the cart screen's own total does not refetch on tab focus (it
refetches on every mutation and on checkout entry).

**Dependabot follow-up (separate PR `ci/dependabot-pnpm`, merged as #688 `adae24f`):** verified in the
first security-update runs after the merge (2026-09-06 19:21 UTC): the updater now logs « Found
"packageManager": "pnpm@9.15.9" … Installing "pnpm@9.15.9" », so the declaration is honoured; the two
security jobs (`esbuild`, `sharp`) still end in the npm_and_yarn helper with exit 1 (the job log carries no
reason — it is only in Dependabot's own error record), while the actions / pub / docker jobs succeed. Still
to read from the Dependabot UI (Insights → Dependency graph → Dependabot) before deciding the next fix.
Original diagnosis — exact failure from
the run logs — Dependabot's updater runs pnpm 10, which logs « The "pnpm" field in package.json is no
longer read … keys ignored: "pnpm.overrides", "pnpm.auditConfig" » and then `pnpm update … --lockfile-only`
aborts (`HelperSubprocessFailed`) because the resolution no longer matches our lockfile. Correct
declaration: `"packageManager": "pnpm@9.15.9"` in the root `package.json` (Dependabot and
`pnpm/action-setup` both honour it). Effect on resolution: none — 9.15.9 is the pnpm already used locally
and in CI (`pnpm/action-setup` `version: 9` resolved to 9.15.x); the `version: 9` inputs are removed from
`ci.yml`/`pr-validation.yml` because action-setup refuses two sources. The same PR adds
`ignore: semver-major` to the `docker` and `github-actions` groups (the first run proposed `node:20-alpine
→ 26-alpine` ×4 and major action bumps). Recommend closing Dependabot PRs #679–#683 unmerged.

### PR 8 — `buyer-mobile/ratings-profile-avatar` (Buyer Mobile PR C, 2026-09-06)

**Re-audit of the Phase 0 findings (on `develop` `adae24f`, before any change):**

| Finding | Status | Evidence |
|---|---|---|
| A5 buyer avatar upload not through `postMultipartWithAuthRetry` | **confirmed** | `profile_repository.dart:71-78` posted a `FormData` with `_dio.post` — a refreshed 401 surfaced as an error and the picked photo had to be re-picked |
| A6 / D11 previous Cloudinary avatar never destroyed | **confirmed** | `users.service.ts:109-118` uploaded a random-id asset to `teka-rdc/avatars` and overwrote `User.avatar`; nothing referenced the old asset; `UpdateProfileDto.avatar` also let any client store an arbitrary URL |
| A8 review submit/edit/delete failures invisible, list wiped | **confirmed** | `review_form_dialog.dart` never read `reviewsState.error`; `product_reviews_screen.dart:40-46` rendered the shared `error` INSTEAD of the list; a failed delete showed nothing (snackbar on success only) |
| new buyers nameless | **confirmed** | `otp_verify_screen.dart:64` passes no names (the API supports them and buyer-web offers an optional « Indiquez votre nom » disclosure); dev DB: 1 nameless buyer; reviews fell back to « Acheteur » on mobile but « Utilisateur » on web |
| profile header stale after an edit | **confirmed** | `profile_screen.dart` loaded `/me` once in `initState`; `personal_info_screen.dart` updated its own local copy only; `AuthNotifier` had no update path, so `authProvider.user` (and the offline profile cache) kept the old name/photo |
| own review rendered twice | **confirmed** | the API list includes the caller's review; the screen rendered `myReview` AND the unfiltered list (buyer-web already filtered by id) |
| comment cannot be cleared | **confirmed, on both clients** | mobile `reviews_repository.dart:170-176` omitted empty `text`; buyer-web sent `text: text.trim() \|\| undefined` — the API only clears on `''` (`dto.text?.trim() \|\| null`) |
| cancel labelled « Reinitialiser » | **confirmed** | `product_reviews_screen.dart:208` (delete dialog) and `order_detail_screen.dart:85` (cancel-order dialog) |
| comment cap 500 vs API 1000 | **confirmed** | mobile `maxLength: 500`; buyer-web textarea had no cap at all (a 1 001-char comment 400s) |
| « reviews invisible while still counted » | **partially confirmed — not a rule divergence** | every read and recalculation already used `deletedAt IS NULL AND status = ACTIVE`, restated in 6 places across `ReviewsService` and `AdminReviewsService`. Two real ways the symptom appears: the dev database was missing the `reviews.title` column (the D4 runtime observation: list/stats/mine endpoints 500 while `Product.totalReviews` still rendered on cards) and the seed hand-writes the denormalised caches (dev: `SellerProfile.totalReviews` stored 2, live 3) |
| legacy reviews without title | **already handled** | `title` nullable, tile renders no title line (PR of 2026-07-28, tests kept) |
| eligibility / duplicate / authorisation | **already enforced server-side; test coverage was thin** | `canReview` + `createReview` scope the order to `buyerId` + `productId` + DELIVERED; `@@unique([buyerId, productId])`; PATCH/DELETE check ownership; only `updateReview` had specs, nothing over HTTP |
| Dio `LogInterceptor` request URIs | **already fixed** (PR 6) | `requestBody: false`, `responseBody: false`, no URI logging in release |

**Source of truth for review visibility (defined and pinned):** a review contributes to the public
list, to the count and to the average iff `deletedAt IS NULL AND status = ACTIVE`; `HIDDEN` and
soft-deleted rows contribute to nothing; the denormalised `Product.avgRating/totalReviews` and
`SellerProfile.*` caches are recalculated with the same predicate on every mutation (buyer create /
rating change / delete, admin hide / unhide / delete); the admin moderation list alone shows `HIDDEN`
rows. Implemented as ONE constant `VISIBLE_REVIEW_WHERE` (`apps/api/src/reviews/review-visibility.ts`)
spread by both services — the three numbers can no longer be edited apart. Documented in
`docs/review-title-and-editing.md § Visibility`.

**API changes:** `review-visibility.ts` + both services use it; `UsersService.uploadAvatar` now runs
validate → upload new → persist → destroy the previous asset (`invalidate: true`) — a failed persist
removes the just-uploaded asset and surfaces the error (the row still holds the old avatar), a failed
destroy is logged and never fails the request; the previous asset's public id is derived by the strict
`avatarPublicIdFromUrl` (`res.cloudinary.com`, our cloud, `image/upload`, directly under
`teka-rdc/avatars/`, no transformation segment — anything else yields `null`, so nothing is ever deleted
on a guess); `CloudinaryService.deleteImage` takes `{ invalidate }` and exposes `cloudName`;
`UpdateProfileDto` no longer accepts `avatar` (no client sent it; with the destroy path it would have let
a buyer point at another asset and get it destroyed). `test/test-utils.ts` gained the `orderItem.findFirst`
delegate. Read-only `apps/api/scripts/report-avatar-orphans.ts` (lists, never deletes).

**Legacy orphan quantification (read-only):** dev and prod share ONE Cloudinary cloud. `teka-rdc/avatars/`
holds **4 assets, 353 959 bytes**; the dev database references **0** of them (0 users with an avatar)
— they are almost certainly prod avatars, so nothing was deleted and the report script says to
intersect across environments before any cleanup. During QA the fixture buyer's two uploads were
handled by the new path (first asset destroyed on replace — verified 404 on Cloudinary; the last one
destroyed with the fixture, by its exact public id).

**Buyer Mobile changes:** `ReviewsState.mutationError` (separate from the load `error`); the form sheet
shows the failure inline with the input intact and a « Réessayer » button, and clears it when reopened;
the screen keeps the list on a « Charger plus » failure (inline error row) and only shows the full error
state when nothing is loaded; a failed delete shows the API's reason in a snackbar and the review stays;
the buyer's own review is rendered once (« Votre avis ») and filtered from « Tous les avis (N) »;
`updateReview` always sends `text` (`''` clears); `kReviewTextMax = 1000`; « Annuler » in both dialogs;
« Écrire un avis » / « Modifier mon avis » / « Publier l'avis » / « Enregistrer les modifications »;
`InteractiveStarRating` stars are 44 px targets with « N étoiles » semantics; **« Achat vérifié »**
badge on every tile (`VerifiedPurchaseBadge`, added on the user's mid-PR request — every review is by
construction written against the reviewer's own DELIVERED order, so the badge states that server rule;
same wording and green pill on buyer-web, which previously said « Acheteur vérifié »). Profile:
`AuthNotifier.updateUser(patch)` merges the server's answer into the session user and re-caches it for
offline starts (no-op when signed out); `personal_info_screen` calls it after PATCH profile and after
the avatar upload, surfaces the API's French message (`friendlyErrorMessage`) instead of a generic
string, uses `showAppSnackbar`; `profile_screen` renders the header from `authProvider.user` (merged
over its own `/me` load, which it also pushes into the session) so the name and photo are right the
moment the buyer comes back; nameless buyers get a one-line « Ajoutez votre nom… » nudge under the
header (link to personal information; never blocks browsing, never invents a name) and the review sheet
says « Votre avis sera publié sous le nom « Acheteur ». Ajouter mon nom »; the account header falls back
to initials when the avatar image cannot load (offline); `_MenuSection` is a `Material` (its coloured
`DecoratedBox` hid every ListTile ripple and tripped a debug assertion). Avatar: `uploadAvatar` goes
through `postMultipartWithAuthRetry` (body rebuilt with `MultipartFile.fromFileSync`; retry exactly once,
only on a 401 the AuthInterceptor marked as refreshed). Each upload yields a new Cloudinary URL, so no
image cache can serve the old picture.

**Buyer Web parity:** edit sends `text: text.trim()` (`''` clears — the same bug existed there);
textarea `maxLength={1000}`; fallback name « Acheteur » (was « Utilisateur »); a failed delete shows an
error banner (was a silent `catch {}`); the modal shows the same nameless notice with a link to
`/profil`; « Achat vérifié » badge component. No review rule lives on a client: eligibility, ownership
and one-per-product are the API's.

**Tests:** API +40 (unit 766 → 806: `reviews.service.spec` createReview foreign order / no delivered
order / duplicate / happy path + deleteReview owner-only + visibility predicate on list/stats;
`admin-reviews.service.spec` hide/unhide/delete recalc with the predicate; `avatar-asset.spec` 16 cases;
`users.service.spec` uploadAvatar order of operations, first upload, foreign previous value untouched,
persist failure, cleanup failure, 404; e2e 214 → 224: `reviews-authz.e2e-spec` — 401 without session,
403 for a SELLER, 400 on another buyer's order / foreign orderId / duplicate, 403 PATCH + DELETE on
another buyer's review, 400 on re-pointing productId/orderId, owner edit clears text, public list + stats
read with the predicate). Buyer Mobile +23 (297 → 320): `reviews_lifecycle_test` (provider: edit/delete/
offline failures keep the list and set `mutationError`, `''` sent to clear; repository payload; screen:
own review once, load error state + retry, « Annuler » + failed delete keeps the review, submit rejected
→ inline message + input intact + retry succeeds, nameless notice shown/hidden), `review_title_test`
badge, `profile_state_sync_test` (updateUser merge + cache, no-op signed out, A's edits gone after logout
and invisible to B, header rebuilds on updateUser, nudge shown/hidden), `avatar_upload_test` (refreshed
401 → one rebuilt retry; plain 401 / second 401 / 400 / 413 / 500 → no retry), `multipart_upload_test`
mirrored from seller-mobile (helper byte-identical). Buyer Web 98 (unchanged; component covered by
type-check + lint + browser QA).

**Runtime verification (emulator `emulator-5554`, dev flavor, API `dist` on :5050 against the dev DB,
disposable buyers `+243999000850/851`, fixture order `TK-QAC-189061` DELIVERED for the Johnnie Walker
product, all removed afterwards; the `reviews.title` column was applied to the dev DB with the
idempotent manual migration file — not `db:push`):** nameless buyer signs in → « Compte Teka » + nudge;
Mes commandes → « Noter le produit » → reviews screen (0 avis, FAB « Écrire un avis ») → sheet shows
« publié sous le nom « Acheteur » », 0/1000 cap; **offline publish** → « Aucune connexion Internet… »
inline, 4 stars + title + comment intact, button « Réessayer »; **online retry** → « Avis publié.
Merci ! », 4.0 / 1 avis, the review once under « Votre avis », list empty; edit with the comment
emptied → DB `text: null`, tile without comment, `Product.totalReviews 1 / avgRating 4`; delete dialog
« Annuler » (cancelled to keep the review for the web check); nudge « Ajouter » → personal information;
saving with `kabila` as email → red snackbar « Adresse email invalide » (the API's message); name saved
→ « Profil mis à jour », initials AK; back → header « amina kabila » **without reload**, nudge gone; photo
1 (blue) → `teka-rdc/avatars/qevhxx…`; photo 2 (red) → `…/rxtgn7…`, **Cloudinary: old 404, new 4 244 B**;
back → header shows the red photo; **offline cold start** → header « amina kabila » from the cached
profile (name + avatar URL on disk); logout → `teka_cache_user_profile_v1` gone; sign-in as buyer B →
« Compte Teka » + nudge, cache holds B only. **Buyer Web (Chrome, :5001 → :5050):** guest PDP shows the
review once with « Achat vérifié » and no comment; signed in as the same buyer → « Vous avez déjà donné
votre avis », own block once (not duplicated below), « Modifier mon avis » → comment added → shown;
edited again with the comment cleared → DB `text: null` (the web bug fixed). Tablet: touched screens use
full-width columns/Wrap; nothing hard-codes a phone width (no tablet run this PR).

**Privacy:** no new PostHog/Sentry properties; `updateUser` never touches Sentry (id + role only);
nothing logs names, phone numbers, avatar URLs or upload bodies; the API log line on avatar replace
carries the user id only.

**Not done / follow-ups:** PR D scope untouched (notifications, deep links, address, enums, accents
elsewhere, `Occasion`, dead routes, guest PDP 401 — a universal link into the dev flavor did not open
the PDP on the emulator, noted for PR D); no avatar *removal* endpoint (was listed Medium; not in this
PR's spec); buyer-mobile's login could offer the same optional « Indiquez votre nom » disclosure
buyer-web has (kept the smaller nudge per the brief); `Product.totalReviews` drift caused by the seed's
hand-written caches is documented, not auto-repaired; Dependabot security jobs still fail in the
npm_and_yarn helper with the correct pnpm installed (see PR 7 record); the 4 unreferenced Cloudinary
avatar assets are left in place (prod reference check needed first).

### PR 9 — `buyer-mobile/notifications-deeplinks-localization-addresses` (Buyer Mobile PR D1: notifications + deep links, 2026-09-07)

**PR #693 merged** as `c6ce951` (merge commit, head `5c7527e` unchanged, 15/15 checks + CodeQL green,
no schema/env/dependency change); develop CI + CodeQL green at `c6ce951`.

**Re-audit of every remaining Buyer Mobile finding (on `develop` `c6ce951`), with the PR that owns it:**

| Item | Status | Evidence | PR |
|---|---|---|---|
| Notifications feed loads once, never refetches on open | **confirmed** | `NotificationsNotifier` loaded in its constructor; `NotificationsScreen` only `watch`ed; nothing invalidated the badge on push or resume (only home pull-to-refresh and the center's own actions) | D1 ✔ |
| Foreground push never refreshed feed/badge; data-only messages never shown | **confirmed** | `PushService._handleForegroundMessage` returned early on `notification == null` (the data fallback below it was dead code); no hook back into the providers | D1 ✔ |
| A9 iOS foreground notifications + taps dead | **confirmed** | `_initLocalNotifications` had `InitializationSettings(android: …)` only, `_local.show` Android details only | D1 ✔ (code + tests; no iOS runtime — see below) |
| Cold-start push tap / deep link lost behind the city gate | **confirmed** | both controllers `push`ed immediately; the router's city-first redirect replaced the route with `/city-selection` and the city screen `go('/')` | D1 ✔ |
| Notification error state without retry | **confirmed** | the failure text was rendered as the empty state's caption | D1 ✔ |
| A7 category from a web/banner/deep link (slug) → 400 + generic title | **confirmed** | `CategoryScreen` matched the tree by id only and sent the slug as `categoryId` (`@Matches(uuid)` → 400; `categories/:id/attributes` is `ParseUUIDPipe`) | D1 ✔ |
| Category deep links expose internal UUIDs (item 9) | **stale as phrased — the public link model is slug-based** | web URLs and App Links carry `/{ville}/categorie/{slug}`; the UUID appears only in the app's internal `/categories/:id` route (never shared); the real defect was the app not accepting the slug (A7) | D1 ✔ |
| Universal links never work on dev/staging builds | **new, confirmed during QA** | the manifest's `appLinkHost` is `dev.teka.cd` / `staging.teka.cd` but the parser's allow-list was `teka.cd`/`www.teka.cd` → every link bounced to the browser | D1 ✔ |
| Order / notification links go to the browser | **design gap** | `/commandes/*` and `/notifications` were reserved (browser) although the app has both screens and the router already sends guests to login with return-to | D1 ✔ |
| CMS relative links (`/pages/faq`) do nothing | **confirmed** | `MarkdownContent._launch` handed a relative path to `launchUrl` | D1 ✔ |
| Malformed order id from a push → English « Validation failed (uuid is expected) » | **confirmed** | `orders.controller.ts` used `ParseUUIDPipe` on buyer routes | D1 ✔ (API) |
| Guest PDP fires doomed private calls | **partially fixed / low** | the cart no longer fetches for guests (PR A); `reviewsProvider._init` still calls `can-review` + `mine` for a guest (two 401s tolerated per PDP, no logout — the interceptor only clears tokens when a *refresh* is rejected) | D2 |
| A10 recipient phone sent raw; address errors generic; city-list failure = empty disabled form | **confirmed** — and buyer-web's `address-form.tsx` sends the raw phone too | `address_form_sheet.dart` never calls `normalizeDrcPhone`; `my_address_screen._save` catches everything into « Impossible d'enregistrer l'adresse »; `_loadCities` catch stops the spinner and leaves no retry | D2 |
| Order address snapshot | **established** (`Order.delivery*` columns, `resolveDeliveryAddress`) | regression test to add with the address work | D2 |
| Missing accents | **confirmed, 9 left** | `Reinitialiser` (filter sheet), `Verification du paiement...`, `Aucune adresse enregistree`, `Paiement a la livraison` ×2, `Commande confirmee !`, `Selectionnez une ville/commune`, `Telephone du destinataire` | D3 |
| Raw enums | **confirmed** | `REFUNDED` payment status rendered raw (`order_detail_screen.dart`), `checkout_success_screen.dart` prints `order.status` raw, order filters lack `RETURNED` and the Teka-collection statuses | D3 |
| Status terminology | **established** — mobile badge already matches seller/admin/web: « En attente », « Confirmée », « En préparation », « Prête pour collecte », « Reçue par Teka », « Expédiée », « En livraison », « Livrée », « Annulée », « Retournée » (web's PENDING says « Commande reçue ») — three mobile mappings (badge, filters, colors) to fold into one | D3 |
| Obsolete « Neuf / Occasion » filter | **confirmed** — mobile `category_screen.dart` still shows the chips (seen live on the Boissons deep link); web removed it 2026-07-28; API keeps the optional param (docs/product-condition-deprecation.md) | D3 |
| Dead routes | **classified**: `/checkout/payment-pending` obsolete (COD-only, `paymentPending` can no longer be true) → remove route + screen + branch; `/auth/reclamer-compte/confirmer` compatibility route with no in-app entry (the magic link is a website URL the parser deliberately keeps in the browser) → keep, document; `mergeGuestCart` dead code → remove; CMS relative links → fixed in D1 | D3 |
| Pull-to-refresh blanks orders/cart; cart errors never rendered | **to re-verify** on touched screens | `orders_screen` shows the spinner whenever `isLoading` | D3 |

**Chosen split:** D1 (this PR) = notifications + push routing + deep links + category slug + CMS links +
the API order-id pipe. D2 = addresses/phone normalisation (+ web parity) + guest/public routing + order
snapshot regression test. D3 = localisation (accents, raw enums, one status mapping, filters), obsolete
filter, dead routes, refresh blanking.

**Notification refresh semantics (D1):** the feed reloads on screen entry, on pull-to-refresh, on every
foreground push (`PushService.onForegroundMessage` → `PushController` → `notificationsProvider.refresh()`
only if the feed is alive + badge invalidation) and on app resume while the center is showing; the bell
badge is re-fetched on app resume (`resumeHooksProvider`, one GET) and on every push. No polling. A reload
requested while one is running is coalesced into one more load, never dropped (the first version dropped
it, which broke the sign-in reload — caught by the isolation test). Items stay on screen through a failed
refresh (inline error + « Réessayer »); nothing loaded + failure = error state with retry; empty = « Aucune
notification ».

**Push routing (D1):** `resolveExternalRoute(hasCity, isLoadingCity)` mirrors the router's gate: town
selected → push; town restoring (cold start) → push now AND park (the router does not gate while the
restore runs; if it ends without a town the city screen replays the parked route, and
`pendingRouteConsumerProvider` drops the parked copy once a town is restored); no town, nothing loading
(first launch) → park until the buyer picks a town. Same gate for App Links. Authorisation stays the API's:
`/orders/:id` from any source is a protected route (guest → login → return-to) and the order endpoint
scopes by buyer (unknown / foreign order → « Impossible de charger cette commande » with retry; malformed id
→ French 400 → same error state). iOS: `DarwinInitializationSettings` (permission left to FCM's single
prompt) + `DarwinNotificationDetails` (alert/badge/sound) so a foreground message is displayed and its tap
reaches `onDidReceiveNotificationResponse`.

**Deep links (D1):** hosts `dev.teka.cd` / `staging.teka.cd` accepted (only those builds receive them);
`/commandes` → `/orders`, `/commandes/{uuid}` → `/orders/{uuid}` (uuid only, lower-cased), `/notifications`,
`/pages/{slug}` → in-app; `panier` / `paiement` / `profil` / `favoris` / `connexion` / `reclamer-compte` stay
in the browser (no in-app equivalent worth deep-linking into). Category slugs: `CategoryScreen` resolves a
non-UUID identifier through the loaded tree (id, then slug, case-insensitive) or one
`GET /v1/browse/categories/:identifier`, then uses the id for products / attributes / brands; an unknown slug
shows « Cette catégorie est introuvable » with « Voir les catégories ». CMS links: `classifyInAppLink` —
relative or teka.cd links the app renders → in-app route, `tel:`/`mailto:`/`wa.me`/foreign → OS, unusable
→ ignored.

**Tests:** buyer-mobile 320 → **340** (+20): `notifications_screen_test` (refetch on open of an
already-loaded feed, pull-to-refresh + resume reload, failed refresh keeps the list + inline error + retry,
error state → retry → empty state, tap routes order / stays for a broadcast, `deepLinkPath`),
`pending_route_test` (navigate / navigate-and-remember / defer, drop-after-restore rule, park + consume),
`deep_link_parser_test` (orders, order uuid, notifications, pages, dev/staging hosts, prod.teka.cd
refused), `in_app_link_test`, `category_identifier_test`. API 806 unit / **225 e2e** (+1: malformed order id
→ « Identifiant invalide. »). `flutter analyze` 6 baseline infos; `pnpm type-check` clean; seller/admin
untouched.

**Runtime verification (Android emulator, dev flavor, local API on the dev DB, disposable buyers
`+243999000850/851`, fixture order `TK-QAC-065381`, 3 feed rows, all removed afterwards):** cold launch from
`https://dev.teka.cd/lubumbashi/johnnie-walker-rb7t4r` with no town → city selection → Lubumbashi → the PDP
opens (guest); `/lubumbashi/categorie/boissons` → « Boissons » with children chips + products (A7);
`/commandes/{id}` as a guest → login → OTP → the order detail; **real FCM** (one message per step, sent
through the API's own firebase-admin credentials to the emulator's registered token) in the foreground →
heads-up shown, badge 2 → 3, feed refreshed; tap → order detail; bell → feed (2 rows); a row inserted while
the app was open → reopening the center shows 3 (refetch on open); offline pull-to-refresh → list kept +
« Aucune connexion Internet… » inline; reconnect → « Réessayer » → clean list; app backgrounded → push →
tray tap → order detail; app process killed (`am kill`, 0 processes) → push → tray tap → cold start → order
detail (the first build lost it: the town restore was still running — fixed by navigate-and-remember and
re-verified); unknown order uuid link → « Impossible de charger cette commande » + retry; logout → login as
buyer B → empty feed, no badge. **Not exercised:** a force-stopped app does not receive FCM at all (Android
platform behaviour, the message is delivered on the next launch); iOS.

**iOS:** not runtime-tested. The local `flutter build ios` is blocked by the workstation's CocoaPods
state (spec repo out of date; the SwiftPM path needs a manual Podfile migration) — an environment issue,
not the change; the Darwin settings are compiled by the analyzer against
`flutter_local_notifications` 19.4.2 and CI's iOS lane (Fastlane + pods, `pod repo update`) will build it.
Foreground display, tap routing and the permission prompt on iOS are therefore covered by code review +
unit tests only.

**Privacy:** the push hook passes only the FCM `data` block (never title/body) and the controllers log
payload *keys*, not values; the deep-link breadcrumb stays scheme + route type; no new PostHog properties
beyond `deferred: true` on `deep_link_opened`.

**Backward compatibility:** all previously accepted links still resolve identically; new hosts/paths are
additive; the API change only swaps the error text of an already-400 response; no schema / env / dependency
change.

**Follow-ups (D2, D3 as split above)** plus: buyer-web `address-form.tsx` raw recipient phone (D2, parity);
guest PDP still issues two tolerated 401s (D2); the dev/staging App-Link hosts have no `assetlinks.json`
served (links open via the chooser / `am start` only — production is verified on `teka.cd`).

## Next exact step

PR 1–8 merged (`6201534`, `29ccb6f`, `5af6b94`, `1d74149`, `db1b5fb`, `c470e63`, `a877bbb`, `c6ce951`)
plus `ci/dependabot-pnpm` (#688, `adae24f`). **PR 9 `buyer-mobile/notifications-deeplinks-localization-addresses`
(Buyer Mobile PR D1: notifications + deep links) open — awaiting merge approval** — see its record above.
Then D2 (addresses / phone normalisation + web parity, guest/public routing, order-snapshot regression test)
and D3 (accents, raw enums, one status mapping, order filters, obsolete « Neuf / Occasion » filter, dead
routes, refresh blanking), each as its own small PR from `develop`. Previously: Await decisions 1–11 (only 2, 1/8, 4, 5, 7, 9, 3, 11 block their PRs). Start PR 1 on approval:
branch `security/critical-hotfixes` from `develop`; files: `apps/buyer-web/src/components/seo/json-ld.tsx`
(+ `json-ld.test.tsx`), `apps/api/src/payments/payments.{controller,service}.ts` (+ `test/payments.e2e-spec.ts`
cross-user cases), `apps/api/src/products/products.controller.ts` + `products.service.ts`,
`apps/api/src/users/users.controller.ts` + `users.service.ts` (limits + `document-validation.ts` reuse),
`docs/app-review-login.md` + `apps/api/src/main.ts` boot warning, `apps/{buyer,seller,admin}-web/package.json`
(`next` 15.5.21, `eslint-config-next`) + lockfile.
