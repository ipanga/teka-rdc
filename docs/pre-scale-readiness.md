# Pre-scale readiness — Buyer Mobile · Buyer Web SEO · Tablet · Cross-platform security

> **Tracker for the 2026-09 pre-scale initiative.** Resumable: a new session reads `STATUS.md`, then this
> file top-to-bottom. Sections: current phase → findings per domain → decisions → PR plan → per-PR records
> (files, API/schema implications, tests, runtime verification) → unresolved risks → next exact step.
> Constraints in force: no regeneration, no global refactor, API is the source of truth, small PRs into
> `develop` (merge commits), no `db:push`, no destructive DB change, no auto-deploy/merge to `main`,
> Buyer Web SEO must not regress, seller/admin stay `noindex`, no Mobile Money/crypto now.

## Current phase

**Phase 0 audit complete (PR #671). Implementation started 2026-09-06 with D1 (`security/otp-buyer-only`).
Buyer Web SEO-1 merged 2026-09-08 (`6234f0c`, PR #713) and SEO-2 merged 2026-09-09 (`03035e3`, PR #714)
— Workstream B COMPLETE; Buyer Web SEO is no longer a release blocker. No SEO-3 is planned or started;
the deferred findings are listed in the « SEO-2 » record (B/C/E). Next: the owner's decision checkpoint
before any further initiative.**

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

- **Decisions 5 and 7 (2026-09-08, approved by the owner, implemented in `buyer-web/seo-2`):**
  decision 5 — a town × category page with zero eligible products in that town is `noindex, follow`,
  self-canonical, reachable, out of the sitemap, no redirect and no fake 404, and becomes indexable
  again by itself when the town has eligible inventory; eligibility = `publicProductWhere(cityId)`
  (ACTIVE, not deleted, in the town, not a retired demo). Decision 7 — Likasi stays inactive and in
  master data; public service-area copy, navigation, metadata and structured data derive from the
  active-town API and never name an inactive town. Full record: « SEO-2 ».
- **SEO-1 findings for decisions 5 and 7 (2026-09-08, no decision taken):** decision 5 — 0 of 374
  town × category pages are empty on the dev DB (demo catalogue seeds one product per leaf per town;
  the 2026-09-06 empties were sampled on production); per-town counts need an API change; policy
  recommendation unchanged. Decision 7 — four hard-coded « Likasi » strings listed; recommended fix =
  derive from `getActiveCities()`; nothing activated, nothing deleted. Full detail: « SEO-1 » record.
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
  CVEs; the Next.js image optimizer — needs a Next-compatible bump; **closed 2026-09-09 by
  `security/sharp-0.35.4`** — see « sharp 0.35.4 (2026-09-09) » below), `effect` 3.18 → 3.20
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

**iOS:** build verified, not runtime-tested. `flutter build ios --flavor development --no-codesign` →
`✓ Built build/ios/iphoneos/Runner.app` after a `pod install --repo-update` (the workstation's CocoaPods
spec repo was stale; with SwiftPM on, the project's non-standard Podfile would need a manual migration —
both are environment matters, nothing was committed). Foreground display, tap routing and the permission
prompt on iOS are covered by code review + unit tests only — no simulator input tooling.

**Privacy:** the push hook passes only the FCM `data` block (never title/body) and the controllers log
payload *keys*, not values; the deep-link breadcrumb stays scheme + route type; no new PostHog properties
beyond `deferred: true` on `deep_link_opened`.

**Backward compatibility:** all previously accepted links still resolve identically; new hosts/paths are
additive; the API change only swaps the error text of an already-400 response; no schema / env / dependency
change.

**Follow-ups (D2, D3 as split above)** plus: buyer-web `address-form.tsx` raw recipient phone (D2, parity);
guest PDP still issues two tolerated 401s (D2); the dev/staging App-Link hosts have no `assetlinks.json`
served (links open via the chooser / `am start` only — production is verified on `teka.cd`).

### PR 10 — `buyer-mobile/address-phone-public-routing` (Buyer Mobile PR D2, 2026-09-07)

**PR #694 merged** as `613f0fa` (merge commit; reviewed head `f1ce8d1` unchanged, 15/15 checks +
both CodeQL analyses green, no schema/env/dependency file touched). Develop CI + CodeQL green at
`613f0fa` (14 checks).

**Re-audit (on `develop` `613f0fa`):**

| Finding | Status | Evidence |
|---|---|---|
| A10 — recipient phone sent and stored raw | **confirmed, and worse than recorded**: buyer-web sends it raw too | `address_form_sheet.dart` and `address-form.tsx` both sent the typed text; the API only had a `@Matches(/^\+243\d{9}$/)` gate, so `099…` / `+243 99…` / `00243…` were rejected as invalid instead of being understood, and no normalisation existed anywhere server-side |
| A10 — address errors bypass `friendlyErrorMessage` | **confirmed** | `my_address_screen._save` swallowed everything into « Impossible d'enregistrer l'adresse » shown *behind* the sheet; `AddressFormSheet.onSave` returned `bool`, so the API's reason could not reach the form |
| A10 — city list failure leaves an empty disabled form | **confirmed** | `_loadCities`/`_loadCommunes` `catch` only stopped the spinner |
| Commune/city validation | **already correct** | `AddressesService.resolveLocation` → `CitiesService.resolveCommune` / `assertActiveCity` (the seller-commune resolver): unknown → « Commune invalide », retired or in an inactive city → « Commune inactive », foreign city → « La commune ne correspond pas à la ville sélectionnée »; PATCH drops a carried-over commune on a city change; an untouched pair is never re-validated, so an address whose commune was retired later stays readable and editable. 10 unit + 7 e2e cases already pin this — **no change needed** |
| Order delivery-address snapshot | **already correct** | `deliveryAddressSnapshot()` written in the checkout transaction, `resolveDeliveryAddress()` on every read (buyer, seller, admin), relation only as the pre-snapshot fallback. Missing: an end-to-end regression that an address edit after the order does not rewrite it — **added** |
| Guest PDP fires doomed private calls | **confirmed** | `ReviewsNotifier._init` called `can-review` + `mine` for a guest, and every product grid called `/v1/wishlist/check`; the wishlist notifier also ran `loadWishlist` + `getCount` on construction for a guest |
| Stale address after update | **already fixed** | the screen adopts the server's response (PR of 2026-09-01); re-verified on the emulator |
| Address account isolation | **already correct, now tested** | `/v1/addresses` is scoped by `userId`; the screen fetches per session and holds no cross-account cache |

**Phone — the one rule (source of truth).** The API stores `+243XXXXXXXXX` and nothing else.
`normalizeDrcPhone` (`packages/shared`, mirrored in `apps/buyer-mobile/lib/core/utils/phone.dart`) now
accepts `990000001`, `0990000001`, `243990000001`, `+243990000001`, `00243990000001` and any spacing /
dashes / dots / parentheses, and requires the 9 national digits to start with 8 or 9 (DRC mobile), so a
foreign or malformed number is refused rather than turned into a plausible `+243` value.
`CreateAddressDto.recipientPhone` runs it as a `@Transform` **before** validation (blank → `null` clears
the field; unreadable → left as typed so the existing French `@Matches` message fires), and
`UpdateAddressDto` inherits it — the clients normalise for the buyer's benefit, the server decides.
Both clients now refuse an unreadable number on the field itself with the same French message.

**Checkout revalidation.** The API snapshots the address ROW at checkout, so an edit made elsewhere
between opening checkout and confirming would have silently shipped a different address than the buyer
saw. `placeOrder` now re-reads `/v1/addresses` first: identical (`sameDeliveryContentAs`, comparing every
field the snapshot copies) → place; different → refresh what is shown, re-quote, and ask the buyer to
check (« Votre adresse de livraison a été modifiée. Vérifiez-la avant de confirmer. »); deleted →
« Votre adresse de livraison n'existe plus… »; the re-read failing (offline) is treated as unchanged, so
a buyer who already sees the right address is never blocked. No reservation, no new state.

**Guest / public boundary (verified against the running API, no token):** public 200 —
`GET /v1/reviews/products/:id`, `…/stats`, `GET /v1/browse/products/:identifier`; private 401 —
`…/can-review`, `…/mine`, `GET /v1/wishlist/check`. That boundary is right as it stands (own eligibility
and own review are the caller's private data), so **no guard was relaxed**; the clients simply stop
calling the private three as a guest, and the reviews provider reloads eligibility on sign-in so a guest
who logs in on the product page sees the CTA without leaving it. Emulator: **0 × 401 in the API log**
while a guest opened a PDP, home and categories (three per PDP before).

**Other mobile fixes:** `AddressFormSheet.onSave` returns `String?` (null = saved, else the message to
show inline, keyed `address-save-error`); city/commune load failures render a French line with
« Réessayer »; « Sélectionnez une ville / commune » and « Téléphone du destinataire » accented (the
sheet's own strings only — the rest of the accent sweep stays D3).

**Tests:** API **827 unit** (+21: `create-address.dto.spec` — 10 canonical forms, 11 rejections, DTO
transform on create and PATCH, blank clears, non-string passthrough) / **231 e2e** (+6: four canonical
recipient-phone forms persisted as one value, an unreadable one → French 400 with nothing stored, and
the snapshot regression — an order read after the address moved to another town/phone still answers the
snapshot and never leaks the flat columns). Buyer Mobile **376** (+36): `phone_test` (10 canonical, 11
rejected, equivalence), `address_form_sheet_test` (+4: local number sent canonical, unreadable refused
with nothing sent, city-list failure → retry, API reason inline), `my_address_screen_test` (isolation
A → B → A, load failure → retry), `checkout_address_revalidation_test` (edited / deleted / unchanged /
re-read unreachable), `reviews_lifecycle_test` (+3 guest boundary), `wishlist_provider_test` (+2 guest
boundary). Buyer Web **100** (+2 address-form phone cases). `flutter analyze` 6 baseline infos;
`pnpm type-check` clean on all five workspaces.

**Runtime verification (Android emulator, dev flavor, local API on the dev DB, disposable buyers,
everything removed afterwards):** address screen loads A's address; edit → « 12345 » refused on the
field (« Numéro invalide : 9 chiffres (ex. 990 000 001) ou +243… »), nothing sent; `0990000001` saved →
stored **`+243990000851`** and shown immediately without a reload; checkout step 1 shows the normalised
number; at the review step the address was changed from outside (as another device would) → confirm did
**not** place the order, the summary refreshed to the new address and the French notice appeared;
confirming again placed `TK-20260907-A7B3` whose snapshot is exactly what was on screen; the address was
then edited again → the order detail still shows `Av. Modifiee Ailleurs 99` + `+243990000851` (invariant
holds end to end, DB-verified); guest PDP → 0 × 401; `GET /v1/addresses` as buyer A returns A's single
address and as buyer B returns `[]` (checked over HTTP with per-buyer tokens). **Not exercised on the
emulator:** the second-buyer *screen* walk-through (the mock OTP kept expiring during the slow input;
the same isolation is covered by `my_address_screen_test` and PR A's `account_isolation_test`) and the
offline/retry path on the address screen (covered by the load-failure test).

**Browser QA: not completed.** The buyer-web session would not establish in the QA stack — the API
serves `Domain=.teka.cd` cookies unless `COOKIE_DOMAIN` is empty, and `node --env-file` overrides the
shell value, so the browser dropped them; with a patched env copy the cookies became host-scoped but the
mock-OTP login still did not settle before this PR was finished. The web change (shared normaliser in
`address-form.tsx`) is therefore covered by its two component tests, `next build` and type-check only.

**Privacy:** no phone or address value is logged, captured or put in a URL by the new code; the API's
only new log line is the avatar warning from PR C. The DTO transform runs before validation, so an
invalid number never reaches a log line either.

**Backward compatibility:** already-stored `+243…` values are unchanged and still valid; the transform
only widens what is accepted on write. No schema, env or dependency change. `@teka/shared` gained no new
export (the existing `normalizeDrcPhone` widened), so nothing else needs updating.

**Follow-ups:** D3 (accents incl. « Point de repere » in this sheet, raw enums, one status mapping,
order filters, obsolete « Neuf / Occasion » filter, dead routes, refresh blanking); browser QA of the web
address form; the QA-stack cookie-domain trick is worth folding into the local QA recipe.

### PR 11 — `buyer-mobile/localization-status-route-cleanup` (Buyer Mobile PR D3, 2026-09-07)

**PR #697 merged** as `9450358` (merge commit; reviewed head `d8e4fea` unchanged, 15/15 checks + CodeQL
green, no schema/env/dependency file). Develop CI + CodeQL green at `9450358` (14 checks).

**Re-audit (on `develop` `9450358`):**

| Finding | Status | Evidence |
|---|---|---|
| Raw status enums | **confirmed, in three places** | `order_detail_screen` printed the payment enum itself for `REFUNDED` (`label = status`) and lumped every unknown value into « En attente »; `checkout_success_screen` printed `order.status` (a buyer saw `PENDING` after paying); `OrderStatusBadge`'s `default` returned the raw status |
| Three separate status mappings | **confirmed** | badge labels, orders-screen filter chips and the payment chip each had their own subset — the Teka-custody steps existed in the badge but not the filters |
| `RETURNED` missing from filters | **confirmed** | the chip list was `PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED` — a returned order could not be filtered for at all, on mobile **or** on buyer-web |
| Missing accents | **confirmed, 12 in the end** | the 7 the scanner found (`Réinitialiser`, `Point de repère`, `Sélectionnez…`, `Aucune adresse enregistrée`, `Paiement à la livraison` ×2, `Commande confirmée !`) plus 5 found during the emulator pass (`Plus récents`, `Prix décroissant`, `Popularité`, « Votre commande a été passée avec succès. », « Commande annulée ») |
| Duplicate terminology | **confirmed (small)** | the filter sheet's title and its first section header were both « Trier et filtrer » — the section is now « Trier par » |
| Obsolete « Neuf / Occasion » | **confirmed** | the sheet dropped it 2026-07-28 but `category_screen` still rendered a Tous / Neuf / Occasion bar above every listing (seen live during the D1 QA) and pushed `condition` into the browse params |
| `/checkout/payment-pending` | **confirmed dead** | `CheckoutService` answers `paymentPending: false` unconditionally (COD-only), so the branch and the polling screen could never run |
| `/auth/reclamer-compte/confirmer` | **compatibility — keep** | the claim magic link is a website URL that the deep-link parser deliberately leaves to the browser; the in-app screen stays so a link opened inside the app resolves |
| `mergeGuestCart` | **confirmed dead** | no caller since the cart became account-scoped |
| Refresh blanking | **confirmed** | the orders screen replaced the list with a spinner on every refresh and with a full error state on any failure; the cart did the same on `fetchCart` |
| Nameless-buyer residual | **already closed by PR C** | header falls back to « Compte Teka » + nudge, review sheet warns; verified on the emulator (a named buyer sees no nudge) |
| Optional name capture at login | **no change (documented)** | buyer-web offers « Première connexion ? Indiquez votre nom (facultatif) »; on mobile the post-OTP nudge covers it and login stays minimal — expanding the OTP screen was not worth the risk |
| Category slug/ID residuals | **already fixed in D1** | nothing left to change; old UUID links still resolve |
| English UUID/order route errors | **already fixed in D1** | `UuidParam` on the buyer order routes |

**Status mapping (one place).** `apps/buyer-mobile/lib/features/orders/domain/order_status.dart`:
`BuyerOrderStatus` (the 10 API values, each with a singular and a plural French label),
`orderStatusLabel`, `paymentStatusLabel` and `orderStatusFilters`. The badge, the filter chips, the
payment chip and the success screen all read from it. The wire values are never translated — only what a
buyer reads. Wording is what Teka already uses (buyer-web badge, seller-mobile, seller-web, admin-web);
nothing was invented: `PENDING` En attente · `CONFIRMED` Confirmée · `PROCESSING` En préparation ·
`READY_FOR_TEKA_PICKUP` Prête pour collecte · `RECEIVED_AT_TEKA` Reçue par Teka · `SHIPPED` Expédiée ·
`OUT_FOR_DELIVERY` En livraison · `DELIVERED` Livrée · `CANCELLED` Annulée · `RETURNED` Retournée;
payment: Payé / Échoué / **Remboursé** / En attente. An unknown value reads « Statut inconnu » on both
clients — a status added to the API before an app update can no longer surface as `SOME_NEW_ENUM`.

**Buyer Web parity:** the same complete filter set (`RETURNED` and the two Teka-custody steps were
missing there too) and the badge's unknown-status fallback now says « Statut inconnu » instead of echoing
the enum. Labels, the condition policy and public-route semantics are unchanged; no layout was touched,
no `noindex`, nothing became client-only — SEO is unaffected.

**Removed / kept:** `/checkout/payment-pending` route + screen + branch removed (bring both back with a
payment provider); `mergeGuestCart` removed; `/auth/reclamer-compte/confirmer` kept and documented as a
compatibility route. Every route the app links to still exists (asserted by a test).

**Refresh:** the orders list and the cart keep what is on screen through a refresh; only a first load with
nothing to show takes the whole area. A failed refresh with rows on screen shows an inline French error
with « Réessayer » instead of replacing the list; the empty state stays pull-to-refreshable.

**Tests:** buyer-mobile **376 → 411** (+35): `order_status_test` (20 — every status, the enum-coverage
check, case tolerance, unknown fallback, payment labels incl. REFUNDED, filter order/wire/labels, badge
widget), `orders_screen_test` (5 — French chips with no raw enum, « Retournées » asks the API for
`RETURNED`, failed refresh keeps the list + inline retry, nothing-loaded error state, empty list still
refreshable), `condition_filter_removed_test` (3), `french_copy_test` (3 — a source-wide accent guard,
a raw-enum-in-presentation guard, and a check that the shared labels are the ones rendered),
`protected_route_test` (+3 route classification). Buyer Web **100 → 111** (+11 status-badge cases).
API unchanged: 827 unit / 231 e2e. `flutter analyze` 6 baseline infos (seller-mobile 20, untouched);
`pnpm type-check` clean.

**Runtime verification (Android emulator, dev flavor, local API on the dev DB, a disposable buyer with
one order in each of the ten statuses, all removed afterwards):** the orders list shows Retournée,
Annulée, Livrée, En livraison, Expédiée, Reçue par Teka — no raw enum anywhere; the returned order's
payment chip reads **« Remboursé »** (was `REFUNDED`); the chip row now scrolls to « Retournées » and
filtering by it returns exactly the returned order; the category screen has no Tous / Neuf / Occasion
bar; the filter sheet reads « Trier par », « Plus récents », « Prix décroissant », « Popularité »,
« Réinitialiser » with no État section; an offline pull-to-refresh on the orders list **keeps every row**
and shows « Aucune connexion Internet… » with « Réessayer », which recovers on reconnect; a real checkout
ends on « Commande confirmée ! » with the order line reading **« En attente »** instead of `PENDING`, and
the D2 address/snapshot behaviour still holds (order `TK-20260907-C589` carries its own snapshot).
**Browser QA: not performed** — the web change is the filter list and the badge fallback, both covered by
the new component tests, `next build` and type-check; the QA-stack login blocker from D2 is unchanged.
**iOS: not exercised** (no simulator input tooling); the Dart tests and analyzer cover the changed code.

**Privacy:** no new logging, analytics or Sentry data; the copy fixes touch strings only.

**Backward compatibility:** the API contract is untouched (no enum, no field, no route on the server);
`?condition=` still exists for older installed builds, and the historical `Product.condition` column and
data are untouched. Removing `/checkout/payment-pending` is safe because nothing links to it — it was
reachable only from a branch the API can no longer trigger.

**Tablet:** nothing new assumes a phone width (the removed bar and the added inline error row are
full-width rows); no tablet work done, as instructed.

### Buyer Mobile functional readiness — closure

| Finding | Status | PR |
|---|---|---|
| A2 offline cold start / session survival | Fixed | #686 |
| A3 offline city gate · A4 account isolation | Fixed | #686 |
| A1 pricing / cart / checkout totals | Fixed | #687 |
| A5 avatar multipart retry · A6+D11 avatar lifecycle · A8 review errors · ratings/profile | Fixed | #693 |
| Notifications refresh · push routing · A9 iOS local notifications · deep links · A7 category slug | Fixed | #694 |
| A10 address + recipient phone · checkout revalidation · guest/public routing · order snapshot | Fixed | #697 |
| Raw status enums · French labels/accents · order filters · obsolete Occasion filter · dead routes · refresh blanking | **This PR** | #698 |

**Still open (none blocking functional readiness):** iOS runtime interaction was never exercised in any
PR (no simulator input tooling) — the code is built and unit-tested but not driven by hand; browser QA of
buyer-web was blocked in D2/D3 by the local cookie/OTP QA stack; the dev/staging App-Link hosts have no
`assetlinks.json` served; the four unreferenced Cloudinary avatar assets are still in place pending a
prod-side reference check; Dependabot's npm security jobs still fail inside its own helper. None of these
is a Buyer Mobile functional defect.

### PR 12 — `mobile/tablet-responsiveness` (Tablet PR 1: shared foundation + Buyer Mobile, 2026-09-07)

**PR #698 merged** as `5ed2814` (merge commit; 15/15 checks + CodeQL green, no schema/env/dependency
file). Develop CI green at `5ed2814` (14 checks). Buyer Mobile functional readiness closed with it.

**Re-audit (on `develop` `5ed2814`) — the Workstream C findings above all still held:**

| Finding | Status | Evidence |
|---|---|---|
| No breakpoint helper in either app | confirmed | no `core/layout/`; the only shared idiom is `LayoutBuilder` with a lower bound |
| `productCardGridExtent` divides the WINDOW width by 2 | confirmed | `product_card.dart` — wrong for any grid that is not a two-column phone |
| Six grids hardcode `crossAxisCount: 2` | confirmed | home, category, search, promotions, wishlist + the loading skeleton |
| PDP gallery is a bare `AspectRatio` 1.25 | confirmed | 819 pt of photo on a 1024 pt tablet; decodes at window width |
| Sheets and dialogs unconstrained | confirmed | four `showModalBottomSheet` sites, six `showDialog` files, **no** `bottomSheetTheme` and **no** `dialogTheme` in `app_theme.dart` |
| Bottom bars span the full width | confirmed | PDP, cart, checkout, personal info |
| seller-mobile already uses `LayoutBuilder` in 7 places | confirmed | left untouched — Tablet PR 2 |

**Scope decision.** Split as the user allowed: this PR is the **shared foundation + Buyer Mobile**;
Seller Mobile is Tablet PR 2. seller-mobile receives only the byte-identical `core/layout/responsive.dart`
(and the sheet/dialog theme is NOT added there yet), so PR 2 has the helper ready and PR 1 stays reviewable.

**The foundation — `lib/core/layout/responsive.dart`, kept byte-identical in both apps** (the
`core/connectivity` + `core/network` convention; `diff` before calling a change done). Everything works
from the width a widget is actually given — never a device name, a platform check or a shortest-side
heuristic — so it behaves the same on an Android tablet, an iPad, a phone in landscape and a split-screen
window:

| Piece | What it does |
|---|---|
| `LayoutWidthClass` + `widthClassFor` | Material 3 classes on the layout width: compact < 600, medium 600–839, expanded ≥ 840 |
| `gridColumnsFor` / `gridCellWidth` | columns from a minimum readable card width (168 pt), clamped to 2–5 |
| `readableMaxWidth` / `pagePadding` | text column capped at 640 (medium) / 720 (expanded), infinite on a phone; 16 → 24 pt padding |
| `ReadableColumn` / `ReadableBottomBar` | centre content (or only a bar's controls) inside that cap |
| `kSheetConstraints` | the 640 pt panel width applied through the theme |
| `heroImageHeight` | caps a gallery at 420 (medium) / 480 (expanded); natural height on a phone |

**Grids.** `ProductGrid` (box) and `ProductSliverGrid` (sliver) replace all six hand-rolled grids and take
their column count from the width they are given; `productCardGridExtent` now takes the **cell** width, so
the row height tracks the card rather than the window. The loading skeleton runs the same arithmetic, so
the grid no longer changes shape when the data resolves. Measured: 2 columns at 360–412, 3 at 600, 4 at
768 and 834, 5 at 1024 and 1366.

**Layout.** The PDP gallery is capped and letterboxes (it was already `BoxFit.contain`) and decodes at the
frame width. Text, form and list screens are centred in a readable column: catalog list, notifications,
orders, order detail, reviews, cart lines, checkout steps, profile, personal info, security, address,
notification settings, account deletion, content pages, town selection, checkout success and every auth
screen. Bottom bars centre only their controls and keep their full-width surface. Sheets and dialogs
inherit the 640 pt cap from `bottomSheetTheme`/`dialogTheme`, so no call site repeats a number and a sheet
added later is correct by default.

**Navigation: bottom bar kept, not replaced.** Tested at tablet widths first, as instructed. A
`NavigationRail` would mean restructuring the `StatefulNavigationShell`, and it moves the cart out of
thumb reach on a portrait-first tablet audience. The five destinations are centred in a phone-width group
instead; the rationale is recorded in `main_shell.dart`.

**A real bug the runtime pass caught.** The first `ReadableBottomBar` used a plain `Center`, which claims
the biggest height it is offered. As a Scaffold's `bottomNavigationBar` that swallowed the whole screen:
on the 1280×800 tablet the home feed rendered blank behind a vertically centred tab bar. Both wrappers now
pass `heightFactor: 1` (it would also have thrown inside a scroll view, where the height is unbounded),
and the regression is pinned by a test.

**Tests: 441 buyer-mobile (was 411), 186 seller-mobile unchanged.** New: width classes and the column/cell
arithmetic at 320–1366; the readable column on a phone and a tablet; the bottom-bar height regression;
grid adaptation at 360/390/600/768/834/1024/1366; footer allowance constant across widths; skeleton and
grid agreeing; the theme carrying the sheet/dialog constraints and a sheet still filling a phone.
`flutter analyze` unchanged at the 6 known info-level SDK deprecations (buyer) and 20 issues (seller).

**Runtime verification (Android emulators, dev flavor, local API on the dev DB).** A new
`Teka_Medium_Tablet` AVD (1280×800 logical, API 34) in **both** orientations and the existing Pixel 8 Pro
in both: town selection, home feed, home product grid, categories, a category grid, the filter sheet,
PDP, login, OTP, profile, orders, cart, checkout step 1 and the address sheet. Landscape 1280 pt gives 5
columns and portrait 800 pt gives 4; the phone still gives exactly 2 in portrait and the phone in
landscape gives 5. The PDP gallery is a header rather than a wall, and the title, price and « Ajouter au
panier » are all above the fold in both orientations. Sheets are centred panels. At `font_scale 1.5` the
cards grow taller and nothing overflows. Sign-in used the mock WhatsApp OTP and an existing disposable dev
buyer; the one cart line added during the walkthrough was deleted afterwards. **iOS: not exercised** (no
simulator input tooling) — the width classes are computed from layout constraints, so an iPad in Split
View follows the same path the tests pin.

**Privacy:** no new logging, analytics or Sentry data; no network or API change of any kind.

**Backward compatibility:** no API, schema, env or dependency change. Nothing changes on a phone — the
readable width is infinite in the compact class, every cap is wider than any phone, and the phone
screenshots match the previous layout.

### PR 13 — `mobile/seller-tablet-responsiveness` (Tablet PR 2: Seller Mobile, 2026-09-07)

**PR #699 merged** as `2ef5b94` (merge commit; head `09d535a` unchanged, 15/15 checks + CodeQL green,
40 files, mobile + docs only). Develop synced and clean at `2ef5b94`.

**Re-audit against the merged tree** (every Workstream C finding re-checked; none taken on trust):

| Screen / surface | Verdict |
|---|---|
| 28 screens, all `body:` full width | **needs width constraints** — every one of them |
| `product_form_screen.dart` | **worst surface**, as recorded: a 1280 pt single-column form |
| `product_image_manager.dart` `crossAxisCount: 3` | **broken on expanded width** — 3 tiles of ~340 pt |
| `earnings_screen.dart` wallet cards | **width-dependent, phone correct** — 2 per row, so a tablet got 2 huge + 1 orphan |
| `seller_main_shell.dart` `NavigationBar` | acceptable, needs constraining |
| 3 sheets (`category_selector`, `product_image_manager`, `verification_screen`) | unconstrained; **no** `bottomSheetTheme`/`dialogTheme` in the theme |
| 6 files using `showDialog` | unconstrained (same theme gap) |
| 7 existing `LayoutBuilder` sites | **already adaptive** — lower-bound stacking heuristics; left alone, they now see the readable width |
| `image_picker` `maxWidth` in 4 files | **requires no change** — capture sizes, not layout (explicitly out of scope) |
| `home_screen.dart` catalogue counters | already derive columns from constraints; correct inside the readable column |

**Shared foundation unchanged.** `core/layout/responsive.dart` needed no edit: `gridColumnsFor` already
takes `minCellWidth`/`spacing`/`minColumns`/`maxColumns`, which covered both new Seller grids. The two
copies remain byte-identical, and a new test reads both files from disk and fails CI if they ever differ —
the duplicated-file convention is now enforced rather than remembered.

**What changed:**

| Area | Change |
|---|---|
| Every screen (28) | body centred in a readable column: auth (5), dashboard, orders list + detail, products list + detail + form + images, earnings + payout detail + payout request, profile, shop profile, personal info, security, notification settings, account deletion, help, verification, notifications, promotions list + create, reviews, seller application |
| Theme | `bottomSheetTheme` + `dialogTheme` carry the shared 640 pt cap, so all 3 sheets and every dialog inherit it |
| Product images | tile count from a 110 pt minimum tile (3 on a phone, more on a wider form) instead of a fixed 3 — display only, `image_picker` untouched |
| Revenus | the three wallet cards fit side by side on a tablet instead of 2 + orphan |
| Navigation | M3 `NavigationBar` KEPT, centred in a phone-width group |
| Bottom bars | order-detail actions, personal-info and shop-profile save buttons centred, surfaces full width |

**Lists: readable column, not a grid — deliberately.** Seller order and product cards are variable height
(a title wraps to three lines, the meta row wraps, an order carries a different number of lines), so a
fixed-extent `GridView` would clip or stretch them, and a masonry layout would break the lazy pagination
both lists depend on. The Buyer column count was NOT reused: buyer cards are square-image tiles, seller
cards are wide information rows.

**Navigation decision, evaluated on its own terms.** A `NavigationRail` would mean restructuring the
`StatefulNavigationShell` that gives each of the five destinations its own navigator and scroll position,
and a seller working on a tablet still reaches for the bottom of the screen. Kept and centred; the
rationale is recorded in `seller_main_shell.dart`, and a test pins the sizing.

**A defect the runtime pass caught.** With only the controls centred, the navigation bar and the
order-detail action bar painted their surface just as wide, so each read as a white block floating on the
page background (measured: `#FFFFFF` in the centre, `#F8FAFC` at the edges). The surfaces are painted full
width now and only the controls are centred. The order detail additionally moves its readable column onto
the scrollable content so the action bar can span the screen.

**Tests: seller-mobile 219 (was 186), buyer-mobile 441 unchanged.** New: the responsive-parity guard;
readable column width at 320/360/390/412 and 768/834/1024/1280/1366 plus phone landscape; orders and
products cards at phone and tablet widths, at 1.5x text and in landscape; the product form staying a
single readable column with its price pair side by side, at 1.3x and 1.5x and in landscape; the image-grid
tile count; the wallet-card columns; the sheet and dialog constraints; the navigation bar centred on a
tablet, full width on a phone, keeping its own height and all five labels. `flutter analyze` unchanged at
20 issues (seller) and 6 (buyer). `pnpm type-check` clean.

**Runtime verification (Android tablet emulator, 1280x800 logical, dev flavor, local API on the dev DB).**
Landscape: login, dashboard, orders list, order detail, products list, product form, Revenus, profile,
shop verification, personal info. Portrait: verification, profile, product form. Text scale 1.5x on the
product form (price fields correctly stack, no overflow) and on the products list in landscape. The
dashboard Action Center keeps all three action rows and the catalogue counters. Revenus shows the three
wallet cards side by side. Verification shows the status card, the required and optional document cards
and the privacy note, with no Cloudinary id or document URL anywhere. **Phone: not re-run in this PR** —
the phone emulator was stopped to free resources after it destabilised the tablet run; the phone case is
covered by tests at 320/360/390/412 asserting the previous widths exactly, and by PR 12's phone pass on
the shared wrappers. **iOS: not exercised** (no simulator input tooling); the width classes are computed
from layout constraints, so an iPad in Split View follows the same path the tests pin.

**Fixtures.** Sign-in used a dev seller whose password hash was temporarily replaced and then **restored
byte-for-byte** from a backup (verified: the temporary password now returns 401). A disposable QA seller
registered through the API was deleted afterwards. No production data touched.

**Privacy:** no new logging, analytics or Sentry data; no network or API change.

**Backward compatibility:** no API, schema, env or dependency change; no taxonomy, payout or verification
business rule touched. Nothing changes on a phone.

## Phase — Buyer Mobile UX/UI/design polish (started 2026-09-07)

**Tablet phase closed.** PR #700 merged as `57b3ea7` (merge commit; head `6e223c1` unchanged, 15/15 checks
+ CodeQL green, 39 files: 36 seller-mobile + 3 trackers). Both apps are tablet-responsive.
**Two validation gaps stay open and are NOT claimed as done:**

| Gap | State |
|---|---|
| iPad / iOS runtime | **never exercised** in Tablet PR 1 or PR 2 — no simulator input tooling. Code builds; interaction untested. |
| Seller Mobile phone runtime | **not re-run** in Tablet PR 2 (the phone emulator was stopped to free resources). Covered only by tests at 320/360/390/412. |

### Buyer Mobile visual/UX audit (2026-09-07, phone 448 pt logical, live app)

Walked as a buyer: launch → town → home (three scroll depths) → PDP → search → zero-result. Findings by
severity, with "already good" recorded so later PRs do not redesign what works.

| # | Finding | Severity |
|---|---|---|
| 1 | **Seven network-image call sites, six different loading/failure looks**; two used raw `Image.network`, so home banners and flash deals bypassed the cache and decoded at full resolution | **Critical (perf + consistency)** |
| 2 | A home banner whose image is missing put white title/subtitle on a near-white fallback — **measured 2.82:1**, below AA | **Critical (accessibility)** |
| 3 | Search's zero-result hand-rolled its own layout, so the app had **two empty-state visual languages** | High |
| 4 | **12 distinct `BorderRadius.circular` values** (8, 10, 12, 14, 16, 18, 20, 999, 4, 2, 6, 100) | High |
| 5 | **200+ raw `fontSize:` literals across 20 values** (11/11.5, 12/12.5, 13, 14/15 …) while `AppTheme` carries a complete 15-step scale nothing references | High |
| 6 | 11 raw hex colours in feature code, several duplicating existing tokens (`0xFFF59E0B` = warning, `0xFF2563EB` = info) | Medium |
| 7 | Product-card footer reserves a fixed allowance, so a 2-line title leaves ~60 pt of visible void above the price | High → **UX PR B** |
| 8 | Two full-width heroes stack back to back on home; category strip labels wrap and desynchronise row heights | Medium → **UX PR B** |
| 9 | Wishlist heart is a white circle with a faint shadow — low contrast on pale product photos | Medium → **UX PR B** |
| 10 | One stray `ElevatedButton` where the app's primary is `FilledButton` everywhere else (two different theme paddings and weights) | Medium |
| 11 | Dead `paymentMpesa/Airtel/Orange` tokens (COD-only since 2026-05-26) | Low |
| 12 | Search zero-result **copy** — names the term, explains what to do, offers popular searches | **Already good** |
| 13 | PDP price hierarchy, COD/delivery card ("Livraison assurée par Teka"), `9.350 FC` convention | **Already good** |
| 14 | `ShimmerBox` already honours `MediaQuery.disableAnimationsOf` | **Already good** |
| 15 | `showAppSnackbar` deliberately bypasses the theme so both apps render identically | **Already good — do not "fix"** |
| 16 | `AppEmptyState`/`AppErrorState` already adopted by 17 screens | **Already good** |

### Design direction

Teka's identity stays exactly as it is: the Modern Ruby `#C8102E` scale, the white app bar with red reserved
for CTAs and accents, the copper/cobalt town accents. The problem was never the design — it was that the
design system existed and nothing referenced it. So the direction is **adoption and consolidation, not
restyling**: one scale per dimension, one widget per cross-cutting job, and guards that keep them.

* **Typography** — no new sizes. The theme's 15-step scale is correct; screens migrate onto it as they are
  touched, so a diff always stays reviewable.
* **Spacing** — a 4-based ladder (`TekaSpacing` 4/8/12/16/20/24/32). No mechanical sweep.
* **Radius** — four steps plus a pill (`TekaRadius` 6/8/12/16/999); `md` is 8, matching what the theme
  already rounds buttons, inputs and cards at, so adopting the token restyles nothing.
* **Colour/surface** — brand untouched; add the semantic tokens screens were missing so no file needs a raw
  hex; delete dead tokens.
* **Animation** — none added. `ShimmerBox` is the one motion in the app and it already respects
  reduced-motion. Micro-interactions are deferred to the screen PRs, where they can be judged in context.

### PR decomposition (chosen)

| PR | Scope |
|---|---|
| **A (this one)** | Shared visual foundation: tokens, one remote-image treatment, one empty-state language, button consistency |
| B | Home + Search + Category + product cards (feed composition, card footer, banners, category strip) |
| C | PDP + Cart + Checkout |
| D | Orders + Ratings + Profile + Notifications |

### PR A — `buyer-mobile/ux-ui-design-polish`

`TekaSpacing` + `TekaRadius`; the semantic colours (`ratingStar`, `warningStrong`, `warningText`,
`shadowSoft`, `shadowMedium`); dead payment colours removed; **all 11 raw hex literals gone from `lib/`**.

`TekaNetworkImage` replaces all seven image call sites bar the full-screen viewer (dark backdrop, a
deliberate exception): one shimmer placeholder, one French-labelled fallback, one decode width taken from
the box it is given. Banners and flash deals move onto the cached pipeline. The banner passes a dark
fallback surface — **measured on the emulator: 2.82:1 → 16.32:1**.

`AppEmptyState` gains a `footer` slot; search's zero-result rides the shared shell with its popular terms
inside it. The stray `ElevatedButton` becomes a `FilledButton`.

**Tests: buyer-mobile 463 (was 441), seller-mobile 219 unchanged.** New: the spacing/radius ladders, the
theme's default radius agreeing with the token, the semantic colours, AA contrast of white on the brand red,
the image widget's null/empty/blank/unbounded/semantics behaviour and its dark-fallback contrast, the empty
state's footer slot — plus source guards that fail CI on a raw hex, an `Image.network`, a new
`CachedNetworkImage` call site or a resurrected payment colour. `flutter analyze` unchanged (6 buyer, 20
seller); `pnpm type-check` clean.

**Runtime (Android phone emulator, 1344×2992, dev flavor, local API):** home before/after (the image-less
banner now reads as a deliberate dark card instead of a washed-out block), search zero-result before/after
(now the shared panel), PDP with a product that has no images (shared fallback instead of a void).
Screenshots were captured to the scratchpad and not committed. **Tablet not re-run in this PR** — the
changes are token- and widget-level and the tablet layout tests at 320–1366 still pass. **iOS not
exercised.**

**No API, schema, env, dependency, analytics or Buyer Web change.** No PII added anywhere.

### UX PR B — `buyer-mobile/ux-home-search-category` (Home, Search, Category, product cards, 2026-09-07)

**UX PR A merged** as `7dadf23` (merge commit; head `e83f688` unchanged, 15/15 checks + CodeQL green, 25
files, buyer-mobile + trackers only). Develop synced and clean.

**Each PR A audit finding re-checked in the running app before touching it** — one of the five turned out
to be already correct, and one needed a different fix than the audit suggested.

| # | Finding | Runtime verdict | Action |
|---|---|---|---|
| 1 | Product-card footer void | **Confirmed.** Reservation was a padded guess (120 discovery / 144 catalog) leaving ~60 pt of void under a short title | Summed from the rows each variant renders |
| 2 | Two stacked home heroes | **Confirmed but not a duplication problem.** The city hero answers "where am I shopping" with the town's image and CTA; the banner carousel is admin merchandising. Both keep their place — the **order** was wrong | Categories moved above the banners |
| 3 | Category-strip label wrapping | **Confirmed, worse than recorded.** The strip height was a magic `118` tuned to a two-line label at 1.0x, so it clipped at 1.5x | Fixed two-line box scaled by the text scaler |
| 4 | Wishlist-heart contrast | **Confirmed.** A translucent white disc read over dark photography only | Opaque white + hairline ring |
| 5 | Search zero-result on a failed request | **Already correct** — `state.error != null` is checked before the empty branch, so a failure has always shown retry | None; recorded |

**Measured on a 448 pt phone (before → after):** the category strip starts at **617 pt → 429 pt**, 188 pt
earlier; the first product row moves 15 pt later (828 → 843) because the banner now sits below the
categories. Catalog card footers are **21 pt tighter at every text scale**; discovery is 8 pt tighter at
1.0x and slightly taller at 2.0x, because the old constant under-reserved there.

**A bug the existing tests caught.** The first footer sum treated the rating row as catalog-only. It is
gated on `totalReviews > 0`, not on the variant, so a discovery card with reviews overflowed —
`product_card_layout_test.dart` failed with a 3.1 pt RenderFlex overflow. Both variants reserve it now, and
the row heights are line boxes rather than raw font sizes.

**Also fixed while in the file:** the favourite toast built its own `SnackBar`, so a favourite confirmation
looked different from every other toast in the app. It goes through `showAppSnackbar` now (Rule 15).

**Not changed, deliberately:** the search architecture, its analytics and its event semantics; the category
slug routing and deep links; pricing behaviour and the `9.350 FC` convention; wishlist authorisation; the
Cloudinary lifecycle. No animation was added — none of these screens needed one to be understood, and the
one motion the app has (`ShimmerBox`) already respects reduced-motion.

**Tests: buyer-mobile 471 (was 464), seller-mobile 219 unchanged.** New: a short and a long French category
label producing the same tile height, the strip growing with the text scale instead of clipping, no
overflow at 1.0/1.3/1.5x, the wishlist ring, the home feed order (navigation before merchandising), the
footer allowance being derived rather than a magic constant with the rating row reserved by both variants,
and the favourite toast going through the shared snackbar. `flutter analyze` unchanged (6 buyer, 20
seller).

**Runtime (Android emulator, dev flavor, local API).** Phone 448 pt: home before/after with the fold
measured from the framebuffer, the product grid (tighter footers, rings visible over both a pale beach
photo and a dark dune photo, the shared fallback on a product with no image), and home at 1.5x — the strip
grows and every tile stays the same height. Tablet 800 pt portrait: all seven categories in one row.
Tablet 1280 pt landscape: no overflow, bottom navigation still centred. Screenshots to the scratchpad,
not committed. **iOS still not exercised** — no simulator input tooling. **Seller phone runtime still not
re-run.**

**No API, schema, env, dependency, analytics, security or Buyer Web change.**

### UX PR C — `buyer-mobile/ux-pdp-cart-checkout` (PDP, cart, checkout, 2026-09-07)

**UX PR B merged** as `a57dcf5` (merge commit; head `e8897e9` unchanged, 15/15 checks + CodeQL green,
8 files, buyer-mobile + trackers only). Develop synced and clean.

**Re-audit in the running app before touching anything. Two findings were stale.**

| Finding | Verdict | Action |
|---|---|---|
| PDP gallery loading leaves the largest element blank | **Confirmed** — a bare full-bleed shimmer, half a phone screen of flat grey | Photo glyph on the same shimmer, same capped frame |
| Reviews row has an ambiguous tap target | **Stale in substance** — it was already an `InkWell` with `Semantics(button)` and a 44 pt minimum. But `Expanded` stretched the label and pushed the chevron ~100 pt away | `Flexible` instead, so label and chevron read as one control |
| Sticky purchase bar has only a hairline | **Confirmed** | Sanctioned medium shadow + bottom padding on the content |
| Raw `fontSize`/radius on these screens | **Confirmed** (PDP 20, checkout 28, cart 7, success 5) | Migrated only where the visual scope was touched |
| Zero-result vs error ordering (from PR B) | **Already correct**, re-confirmed | None |

**New findings, from the runtime pass:**

| Finding | Severity |
|---|---|
| Cart tile showed two prices with **no labels** — at quantity 1 they are the same number, so at quantity 3 a buyer cannot tell unit from line total | High |
| Cart bottom bar said « Total » for a figure that **excluded the delivery fee** the quote had not returned yet | High |
| Cart unit price used the brand red, which means *promotion* everywhere else | Medium |
| « Recapitulatif » and « Payez a la reception… » shipped **unaccented** on the two most-read checkout screens | High (Rule 1) |
| Checkout step indicator was three bare numbers — the buyer never learned what steps 2 and 3 were | Medium |
| The recap **dropped the recipient and phone** after step 1 | Medium |
| A **credit-card glyph** illustrated Cash on Delivery in a COD-only marketplace | Medium |
| The checkout address empty state was the **last hand-rolled empty state** in the app | Medium |
| Order success confirmed and stopped — no COD wording, no next steps | Medium |
| Checkout error copy, totals block, COD-only presentation, `9.350 FC` format, stale-price guard ordering | **Already good** |

**An unplanned but valuable live result.** Confirming the order timed out client-side and showed
« Le serveur met plus de temps que prévu à répondre » **while keeping the whole recap on screen** — the
error presentation the earlier PR built, working. The order had in fact been created. Tapping Confirm
again returned the **same** order and the buyer's order count stayed at **1**: idempotency held under
exactly the condition it exists for. Order `TK-20260907-190D`, its lines and its address were deleted
afterwards and the product stock was restored (verified: 0 orders, 0 addresses).

**Tests: buyer-mobile 484 (was 471), seller-mobile 219 unchanged.** New: the gallery skeleton showing an
image affordance and reserving the real gallery's height at 360/390/800/1280; the accented checkout copy;
no ghost payment method anywhere in checkout; the "Teka collects the cash" line; the labelled steps; the
shared address empty state; the cart's labelled unit price and line total; the unit price no longer red;
the subtotal wording; the success screen's next-steps and its use of `orderStatusLabel`; the purchase
bar's sanctioned shadow. `flutter analyze` unchanged (6 buyer, 20 seller); `pnpm type-check` clean.

**Runtime (Android phone emulator, dev flavor, local API, disposable QA buyer).** Search → PDP (loading
and loaded) → favourite → cart → checkout steps 1, 2 and 3 → order placement → timeout → retry → success
screen; cart and cart-empty at **1.5x**. Screenshots to the scratchpad, not committed. **Tablet not
re-run in this PR** — no layout-width logic changed and PR B's tablet pass plus the layout tests still
hold. **iOS still not exercised.**

**No API, schema, env, dependency, analytics, security or Buyer Web change.** Pricing logic, the
authoritative quote, the delivery-address snapshot, idempotency and COD-only behaviour are all untouched.

### UX PR D — `buyer-mobile/ux-orders-profile-notifications` (orders, ratings, profile, notifications, 2026-09-08)

**UX PR C merged** as `cf0f148` (merge commit; head `c7e2d49` unchanged, 15/15 checks + CodeQL green,
10 files, buyer-mobile + trackers only). Develop synced and clean.

**Re-audit in the running app, signed in as a seeded buyer with 7 orders across 6 statuses.**

| Finding | Verdict | Action |
|---|---|---|
| Orders list/detail carry raw tokens | **Confirmed** (detail 22 `fontSize`, 8 radii) | Migrated only where the visual scope was touched |
| Notification read/unread distinction | **Confirmed, but the opposite problem** — unread was a red wash on top of a dot AND a bold title, so a full feed read as a wall of alerts | Unread is a white surface; the dot and weight keep the signal |
| Order status/timeline hierarchy | **Partly stale** — it is an event log built from real `statusLogs`, not a progress tracker, and inventing future states is forbidden. The defect was the dot: brand red beside a green « Livrée » chip | Dot takes the status colour |
| Profile grouping | **Stale** — already three labelled groups, not a flat list | None |
| French/status cleanup intact | **Confirmed intact** — all ten statuses filterable, no raw enum anywhere | None |

**New findings from the runtime pass:**

| Finding | Severity |
|---|---|
| **Every dialog and bottom sheet in the app was painted `#F6E4E3`**, a pink tint M3 derives from the red seed, while cards beside them were white — a logout confirmation read as a warning | High |
| Orders opened on a **bare spinner over an empty screen**; so did notifications | Medium |
| Order totals were **brand red**, competing with the status chip and matching neither the cart nor the PDP | Medium |
| « Boîte de réception » and « Notifications » shared **one subtitle** for two different jobs | Medium |
| Orders list cards, status chips and mapping, the event-log timeline, the address snapshot with recipient and phone, the review CTA on delivered orders | **Already good** |

**A bug caught during the runtime pass.** The first `ListCardSkeleton` was a bare `ShimmerBox`, whose tone
IS the scaffold background — the skeleton was invisible on a list with no cards behind it. It is now a
white card with the shimmer inside, mirroring the real order card.

**Tests: buyer-mobile 501 (was 484), seller-mobile 219 unchanged.** New: the dialog and sheet surfaces
(theme and rendered); filter coverage of every `BuyerOrderStatus` with French labels and the unknown-value
fallback; totals foreground in list and detail; the timeline dot taking the status colour; every status
mapping to a colour; the shaped skeleton replacing the spinner, growing with the text scale, and used by
both lists; the notification unread treatment, dot, read marking, deep-link routing and absence of
polling; the profile subtitles and grouping. `flutter analyze` unchanged (6 buyer, 20 seller);
`pnpm type-check` clean.

**Runtime (Android emulator, dev flavor, local API, seeded buyer — no fixtures created).** Logout with the
confirmation dialog, login as a different buyer (account isolation confirmed: the cart badge switched to
that account's own count), profile, orders loading and loaded, order detail with the timeline and the
address snapshot, notifications feed, orders at **1.5x**, and profile plus orders at **tablet 800 pt
portrait and 1280 pt landscape**. The tablet product grid still renders four columns, so the responsive
work from PR 12/13 is intact after four UX PRs. Screenshots to the scratchpad, not committed. **iOS still
not exercised.**

**No API, schema, env, dependency, analytics, security or Buyer Web change.**

## Buyer Mobile UX/UI polish phase — COMPLETE (2026-09-08)

Four PRs: **A** `7dadf23` foundation · **B** `a57dcf5` discovery · **C** `cf0f148` purchase journey ·
**D** `9ff8b64` orders, profile, notifications (merge commit; head unchanged, 15/15 checks + CodeQL green). Every Buyer Mobile screen has been walked in the running app and either changed or recorded as
already good.

**Validation gaps — these are NOT incomplete UX work, they are unexercised verification:**

| Gap | State |
|---|---|
| iOS / iPad runtime | Never exercised in the tablet or UX phases. No simulator input tooling in any session. |
| Seller Mobile phone runtime | Partially re-run in Seller UX PR A (login, dashboard, profile, logout dialog at 1.0× and 1.5×); the full walk is spread over Seller UX PR B–F. |
| Golden / screenshot regression | No golden tests exist in either app, so a purely visual regression can only be caught by eye. |

**Deferred, deliberately, and not UX debt:** the remaining raw `fontSize`/radius literals on screens no UX
PR needed to touch; the home banner's scrim over a *light* image (PR A fixed the missing-image case, a
pale image can still put white text on a light ground).

## Phase — Seller Mobile UX/UI/design polish (started 2026-09-08)

Scope approved 2026-09-08 after `9ff8b64`. Six ordered PRs, each opened, green, reviewed and approved before
the next starts: **A** foundation + splash · **B** dashboard + Action Center · **C** orders · **D** products,
product form, image manager · **E** earnings + payouts · **F** profile, commune, verification, settings.
Seller Web and Admin Web are out of scope. Nothing merges to `main`, no deploy, no store release, no
migration, no `db:push`.

### Seller Mobile baseline audit (2026-09-08, source + live app on the Pixel 8 Pro, signed in as `marie@shop.cd`)

Measured before any change; every number is a `grep` over `lib/` or a pixel read of the running app.

| # | Finding | Evidence | Fix in |
|---|---|---|---|
| 1 | **No text theme.** `app_theme.dart` never set a `textTheme`, so every screen chose its own size. | 151 raw `fontSize:` across **18 distinct values** (10 → 32) | A (theme) · B–F (call sites) |
| 2 | **Nine radius values** in use (4, 6, 8, 10, 12, 14, 16, 20, 24) with no token. | 73 `BorderRadius.circular(` literals | A (tokens) · B–F |
| 3 | Six raw hex colours outside the token file (promotion + payout status badges). | `Color(0x…` in two badge widgets | A ✔ (now 0) |
| 4 | Two primary-button widgets, one themed: 44 `ElevatedButton` styled red by the theme, 24 `FilledButton` on Material's seed default. | `filledButtonTheme` absent | A ✔ |
| 5 | **Every dialog and bottom sheet painted pink** (`#F6E4E3`): same red-seed `surfaceContainerHigh` defect as the buyer app. Logout confirmation read as a warning. | logout dialog centre pixel (246,228,227) | A ✔ (now (255,255,255)) |
| 6 | **Splash — Android 12+ glyph cut**, pre-12/iOS wordmark tiny. Root cause measured below. | see « Splash root cause » | A ✔ |
| 7 | Four network images use bare `Image.network` (no cache, spinner placeholder, no French fallback): order detail, product detail, product list, image-upload tile. | `grep Image.network` | C (order), D (products) |
| 8 | Spinners as the only loading state on 27 call sites (auth 4, earnings 3, products 6, profile 6, orders 2 …) where a shaped skeleton exists only for lists (`SellerListLoading`). | `grep CircularProgressIndicator` | B–F per surface |
| 9 | Colour used for money (earnings totals in red/green) rather than state — same « colour marks state, not money » rule as the buyer app. | earnings screens | E |
| 10 | Dashboard and Action Center: already the strongest surface (walked at 1.0×, 1.5×, 800 pt and 1280 pt this PR — every count, subtitle and CTA readable, nothing truncated); remaining work is typography/radius adoption and the catalogue-count row alignment. | captures `sa02/sa05/sa06/sa09` | B |

**Left alone on purpose:** `image_picker` maxWidth/compression, the multipart retry, leaf-category
enforcement, characteristics, brand relevance, the order workflow, payouts/commission rules, verification
and document upload, notification deep links, session security — none of these is a visual concern and
none was touched.

### Design direction

Inherited from the Buyer phase unchanged (same brand, same rules): 4-pt spacing ladder, 8 pt default
radius, white surfaces with a hairline border and soft shadow, colour marks state not money, skeletons
shaped like the content, French empty states with a CTA, French errors with a retry. Seller keeps its
charcoal identity on the splash (`#1A1A1A` icon background) — the wordmark is dark on white in the app.

### Seller UX PR A — `seller-mobile/ux-ui-polish` (foundation + splash, 2026-09-08)

**UX PR D merged** as `9ff8b64` (merge commit; head unchanged, 15/15 checks + CodeQL green, buyer-mobile +
trackers only). Develop synced and clean.

**Tokens and theme.**

- `core/theme/teka_spacing.dart` (new): `TekaSpacing` 4/8/12/16/20/24/32 and `TekaRadius` 6/8/12/16/999 with
  the `EdgeInsets`/`BorderRadius` helpers — a **per-app copy** of the buyer file by design; only
  `core/layout/responsive.dart` is shared byte-for-byte (still identical, parity test still green).
- `teka_colors.dart`: `successSubtle` / `warningSubtle` / `destructiveSubtle` / `infoSubtle` fills,
  process colours `processing` (blue) / `inTransit` (violet) / `inactive` (grey), `shadowSoft` /
  `shadowMedium`. The two badge widgets now read these; **zero raw hex remains outside the token file**
  (pinned by a test).
- `app_theme.dart`: an explicit text theme for the first time — headlineSmall 24/1.2 w700, titleLarge
  20/1.25 w700, titleSmall 15/1.35 w600, bodyLarge 16/1.5, bodyMedium 14/1.45, bodySmall 12.5/1.4,
  labelMedium 13/1.2 w600, labelSmall 11.5/1.2 w600. **`titleMedium` gains weight only (w600) and
  `labelLarge` is not overridden** — see the bisect below. `FilledButton` is themed exactly like
  `ElevatedButton` (red, 24/12 padding, w700, 40 % disabled alpha), so the 24 unthemed CTAs now match the
  44 themed ones without touching a call site. `dialogTheme` and `bottomSheetTheme` get
  `backgroundColor: TekaColors.background` + `surfaceTintColor: Colors.transparent` (they already carried
  `kSheetConstraints` from Tablet PR 2).
- `seller_list_state.dart` and `seller_status_badge.dart` move to `TekaRadius`. No screen file changed:
  the 149 remaining `fontSize:` and 72 radius literals are the B–F call-site work, listed per PR below.

**The bisect (why titleMedium is weight-only).** With the full scale applied, two 320 px / 2× guard tests
failed (`seller_forms_accessibility_test: option failures…`, `seller_lists_test: products error is
actionable at 320 px / 2×`). The first hypothesis (labelLarge 15) was tested and was wrong. A scripted
bisect over the overrides showed a single culprit: resizing `titleMedium` (17/1.3) reflows an unstyled
consumer above the product and order lists at 320 px so the retry CTA leaves the guard's viewport. Weight
only passes. The theme comment records this; `foundation_test` pins `titleMedium` at Material's 16 and
`labelLarge` at 14.

**Splash root cause (measured, not inferred).**

| Surface | Before | Why | After |
|---|---|---|---|
| Android 12+ | T glyph clipped (crossbar and hook cut) | `android_12.image` reused the launcher foreground, whose glyph spans **65 % of the canvas height** (bbox 179–845 / 1024). Android masks the image to a circle whose safe zone is the **inner 66 %**, so the OS mask cut it. | `assets/brand/splash_icon_android12.png`: 1024², glyph LANCZOS-resized to **46 %** of the height, on the charcoal `icon_background_color` `#1A1A1A`. T fully inside the circle on the API 34 emulator. |
| Android < 12 and iOS | Wordmark ≈ 80 dp, lost on a white screen | `image:` was `splash_logo.png`, an **opaque 1200² white square** with a small wordmark inside. The generator treats the source as xxxhdpi (4 px/dp), so the *square* rendered at 300 dp and the mark at ~80 dp. The alternative `splash_wordmark.png` in the repo was byte-identical to `logo_teka_cd_white.png` — the **white** wordmark, invisible on white. | `assets/brand/splash_wordmark_200dp.png`: the dark `logo_teka_cd.png` trimmed to 880×236 → **220 dp** wide at every density; iOS 1x/2x/3x at 220/440/660. |

`splash_logo.png` and `splash_wordmark.png` deleted. **Generator-managed vs hand-maintained**, now written in
`pubspec.yaml` above the `flutter_native_splash:` block: generated = `drawable-*/{splash,android12splash}.png`,
`values{,-night}{,-v31}/styles.xml`, iOS `LaunchImage@{1,2,3}x` + storyboard + `Info.plist`; hand-maintained =
`values-v33` and `values-night-v33` (the generator does not emit them; mirrored from `-v31` plus
`android:windowSplashScreenBehavior=icon_preferred`); post-generation = strip `android:windowFullscreen`,
`android:windowDrawsSystemBarBackgrounds` and `UIStatusBarHidden`, which the generator re-emits as `false`
and the repo guards assert are **absent** (the status bar stayed visible: same calibrated metric before and
after). After the strip the six `styles.xml` and `Info.plist` are byte-identical to `develop`, so the diff
is images + storyboard only. The buyer app shares the identical `splash_logo.png` defect — recorded, out of
scope here. `flutter build ios --no-codesign --flavor development --debug` succeeds with the new assets;
**no iOS runtime was exercised.**

**Tests.** `test/design/foundation_test.dart` (new, 11): type scale read from the *localized* theme
(monotonic; titleMedium 16/w600; labelLarge 14; bodyMedium 14/foreground), white dialog and sheet surfaces
(theme values + rendered `Dialog` material colour), Filled == Elevated, 4-pt ladder, `TekaRadius.md == 8`,
process colours distinct from brand red, no raw hex in `lib/`, splash files + pubspec wiring.
`native_splash_assets_test` rewritten ratio-based (source ÷ 4 in 200–240 dp; iOS @Nx = source × N ÷ 4;
android12 icon 1024²; the three retired images banned as `image:`). **Seller 230 (+11), analyze 20 (baseline
infos), buyer 501 unchanged, `responsive.dart` identical, root type-check clean.**

**Runtime (Pixel 8 Pro, development flavor, API on :5050, mock WhatsApp).** Login → dashboard → profile →
logout dialog at 1.0× and 1.5× font scale; dashboard at 800 pt tablet portrait and 1280 pt landscape.
Dialog centre pixel (255,255,255). Android 12 splash (API 34) with the T inside the circle; pre-12 path not
available on the emulator set (no API < 31 image installed) — the drawable sizes were verified on disk
instead (mdpi 220×59 … xxxhdpi 880×236). Disposable data: the seller's password hash was swapped for the
session and **restored byte-for-byte** afterwards (verified: the temporary password now 401s); no rows
created.

**Not changed:** API, schema, env, dependencies (`Package.resolved` drift from the iOS build reverted),
analytics, `image_picker`, any seller business rule, Buyer Mobile.

### Seller UX PR B — `seller-mobile/ux-dashboard-action-center` (dashboard + Action Center, 2026-09-08)

**Seller UX PR A merged** as `8086594` (merge commit; head `b87a2b8` unchanged, 15/15 checks + CodeQL green,
seller-mobile + trackers only). Develop synced and clean; the `CI` workflow and both CodeQL analyses on
`8086594` are green. Two `npm_and_yarn … Update` runs on the same SHA are **Dependabot security-update jobs**
(esbuild, sharp) that GitHub launches itself and that fail inside the updater — not CI gates, not caused by
this merge; the Dependency Audit job is green.

**Dashboard baseline (source + live app, signed in as Marie: 1 order to confirm, 1 to prepare, 1 to finish,
0 rejected products).** Every element classified before changing anything:

| Element | Source of truth | Verdict |
|---|---|---|
| « Actions requises » with the three order rows + « Produits à corriger » | `GET /v1/sellers/orders/stats` (`byStatus`), `GET /v1/sellers/products/stats` — seller-scoped by `userId` | **Actionable, already good** — kept as rows; exact counts, filtered deep links through `openActionFilter` + `?status=` (the Orders/Products modules own the filter). |
| Two separate « Aucune commande à traiter » / « Aucun produit à corriger » lines | — | **Redundant** — replaced by one positive line. |
| Every count in brand red | — | **Misleading** — red meant nothing (every task, urgent or not). |
| `LinearProgressIndicator` per section on first paint | — | **Loading gap** — spinner-only, no shape. |
| Catalogue counts (total / actifs / en validation / brouillons) | products stats | **Metric-only, already good** — kept below the actions. |
| « Votre boutique » shortcuts | — | **Navigation, already good.** |
| Unread badge on the bell | `notificationsProvider.unread` | **Informational, already good** — untouched; never a task count. |
| Refresh: mutation → `sellerRefreshProvider` revision, push (`order-details` / `product-details` / `earnings`) coalesced 300 ms, app resume, pull-to-refresh awaiting every request; no polling | `core/providers/seller_refresh_provider.dart` | **Already good** — extended with a `verification` revision, nothing else changed. |
| Verification state | not on the dashboard | **Missing actionable state** — a rejected verification was only visible as a tile subtitle in Profil. |
| Orders `READY_FOR_TEKA_PICKUP` | stats `byStatus` | **Absent** — the seller could not see what was waiting for Teka. |
| Payouts | `docs/payouts.md` | **Correctly absent** — see below. |

**Actionable states, from the API's own rules (not from labels):**

| Domain | Seller action | Not a seller action |
|---|---|---|
| Orders (`SellerOrdersService`: the seller drives `PENDING → CONFIRMED → PROCESSING → READY_FOR_TEKA_PICKUP`) | `PENDING` confirm/refuse · `CONFIRMED` prepare · `PROCESSING` mark ready | `READY_FOR_TEKA_PICKUP` and everything after (Teka ops) — tracked in « Suivi » |
| Products | `REJECTED` (edit + resubmit) | `SUSPENDED` (admin takedown, only an admin lifts it), `DRAFT`, `PENDING_REVIEW`, `ACTIVE`, `ARCHIVED` |
| Verification (`GET /v1/sellers/verification`) | status `REJECTED`, or a live document `REJECTED` | `NOT_SUBMITTED` (optional trust badge, the shop is active), `PENDING_REVIEW`, `VERIFIED` |
| Payouts | **none** — « No payout state requires anything from the seller » (`docs/payouts.md`); a rejected payout releases the earnings and is a notification, and the destination is entered on the request form itself | everything |

Overdue detection (« preparation overdue ») was considered and not built: the stats endpoint carries
counts, not ages, and adding an aggregation for it is a product decision, not a UX fix.

**Priority model (deterministic, `features/home/domain/action_center.dart`, unit-tested):** P1 *immediate*
— a buyer is waiting on the seller now: orders to confirm, orders to prepare. P2 *soon* — nobody is blocked
this minute: preparations to finish, products to correct, verification to redo. Inside a priority the
order is fixed by the enum. P3 (financial) exists in the model the user proposed but has **no member** by
API semantics, so it is not in the code. **Tone marks state, not priority:** order rows are « attention »
(amber pill), rejections are « rejected » (red-subtle pill / red icon), tracking rows are neutral. Brand red
appears only on the primary button.

**What changed (seller-mobile only, 12 files):**

- `features/home/domain/action_center.dart` (new): `ActionItem` / `buildActionItems` / `totalPending` /
  `verificationNeedsAction`.
- `features/home/presentation/widgets/dashboard_rows.dart` (new): `DashboardSection`, `DashboardCard`,
  `DashboardRow` (one button per row whose semantics read « 25, Commandes à confirmer, Acceptez… »),
  `CountPill` (caps at « 999+ »), `DashboardClearRow`, `DashboardErrorRow` (scoped retry), static
  `DashboardRowsSkeleton` / `SkeletonBlock` (no shimmer — reduced-motion safe and cheap).
- `home_screen.dart`: header total once every source has answered; rows sorted by the model; a reloading
  source contributes nothing (no stale count under a refresh); « Suivi » section for ready-for-pickup;
  catalogue skeleton; all typography from the theme, all spacing/radius from the tokens; one analytics
  event `seller_action_center_tapped` `{task, origin:'dashboard'}` (categories only).
- `seller_dashboard_provider.dart`: `sellerVerificationRequestProvider` (per seller, on the
  `verification` revision) + `sellerVerificationProvider`.
- `seller_refresh_provider.dart`: `verification` revision; `verificationChanged()`; push
  `screen: 'verification'` schedules it; resume schedules all four.
- `verification_repository.dart`: `onChanged` fired after a successful upload (same pattern as products).
- `order_stats.dart`: `readyForPickup` parsed from `byStatus`.
- `seller_main_shell.dart` → `ConsumerWidget`: **one badge, on « Commandes » only**, = confirm + prepare +
  finish from the same stats provider; hidden while loading or on error; `tooltip` « Commandes, N à
  traiter » for assistive tech, the visual badge excluded from semantics. Products and verification stay
  in the Action Center: a badge per tab would make the bar a second dashboard.

**Loading / empty / error:** first paint is two content-shaped rows under a live-region label; a source
that fails keeps its neighbours and shows one row with its own « Réessayer » (retrying one source does not
refetch the others — pinned); the « Aucune action requise pour le moment » line appears only when all three
sources have answered with nothing to do; the whole-page error shell is unchanged.

**Refresh:** unchanged strategy (mutation / push / resume / pull, coalesced, no polling), plus the
verification revision. Pull-to-refresh awaits all three requests.

**Notifications:** untouched. The feed is the feed; the Action Center only shows states the API says need
the seller. The bell keeps its unread count.

**Performance:** three parallel GETs on the dashboard (was two); each is one indexed query per seller
(`groupBy` on orders / products, one `findMany` on the seller's documents). No aggregation endpoint was
needed; no API change.

**Security:** every source is resolved from the JWT `userId` server-side; the verification response never
carries a document URL or storage id (`SellerDocumentView`), and the row shows a fixed French sentence,
never the admin note. No admin data, no cross-seller counts, no payout destination anywhere on the screen.

**Tests (seller 247, +17; analyze 20 baseline infos; buyer 501 untouched, `responsive.dart` identical):**
`action_center_test` (only the three seller-driven statuses become tasks, zero counts produce no row,
routes, products REJECTED only, verification REJECTED / rejected document / quiet states, priority and
in-priority order, missing source ≠ nothing to do, tone by state); screen tests for the skeleton first
paint, the verification task and its navigation, scoped verification failure + solo retry, the Commandes
badge through confirm (stays: still to prepare) and ready-for-pickup (drops, Suivi appears), tracking row
deep link, 360/412 at 1.3×, 1024/1280 readable centred column; refresh-provider test extended to the
`verification` revision. Existing tests updated to the single empty line and the third request (a
fixture-Dio response settles on a timer, so the refresh tests elapse time instead of awaiting).

**Runtime (Pixel 8 Pro, development flavor, local API, disposable data).** Marie (temporarily
`verificationStatus=REJECTED`): dashboard total 4, three amber order rows, red verification row, badge 3 →
tap « Préparations à terminer » → Orders on « En préparation » with one card → detail → « Marquer prête
pour collecte » → confirm → list empty for that filter, **badge 2 while still on Orders** → Accueil: total 3,
row gone, « Suivi · 1 prête pour la collecte Teka », badge 2 → tap « Vérification à refaire » → Vérification
de la boutique with the refused status and the reason. Text scale 1.3× and 1.5×: every row wraps, no
truncation, pills intact. Tablet 800 pt portrait and 1280 pt landscape: centred readable column, bar
centred. Patrick (rejected product temporarily hidden): « Aucune action requise pour le moment », no
Commandes badge, catalogue and shortcuts below. First launch shows Android's notification-permission
prompt over the dashboard (system, one-time; the progressive render behind it was visible). Restored
byte-for-byte afterwards: both password hashes, Marie's verification fields, Patrick's product status, the
QA order back to `PROCESSING` with the status-log row it created removed (verified in the DB; the
temporary password 401s). iOS: not built in this PR (no change to native code or assets).

**Left for later, on purpose:** order detail still opens on a bare spinner (PR C); seller-web's dashboard
has no verification task yet (parity follow-up once the seller-web phase opens); `docs/analytics.md` now
lists the seller-mobile UI events instead of calling it infra-only.

### Seller UX PR C — `seller-mobile/ux-orders` (Orders, 2026-09-08)

**Seller UX PR B merged** as `5825cb3` (merge commit; head `a8849b3` unchanged, 15/15 checks + CodeQL green,
seller-mobile + trackers only). Develop synced and clean; `CI` + CodeQL green on `5825cb3`.

**Orders baseline (source + live app).** Traced: `GET /v1/sellers/orders` (`{ data, pagination }`, filter
= one `status` validated against the enum), `GET /v1/sellers/orders/:id` (items, buyer, snapshot address,
`statusLogs`, `financials`), the stats endpoint, and the four seller transitions in `SellerOrdersService` —
each validates its precondition and answers **400** with a French « Transition de statut invalide… » when
the status moved (there is no 409). `ORDER_STATUS_TRANSITIONS`: the seller drives `PENDING → CONFIRMED →
PROCESSING → READY_FOR_TEKA_PICKUP` (+ `PENDING → CANCELLED` by refusal, reason required, stock restored,
COD transaction failed); everything after is admin/Teka.

| Element | Verdict |
|---|---|
| Filters: all ten statuses, route-synced (`?status=`), Action Center hands the filter to the module, unknown query → all | **Already good** — kept; labels moved to the shared vocabulary, seller steps first, legacy SHIPPED last. |
| List: request-token race safety, pull-to-refresh, load-more footer, per-filter empty state, error + retry, `SellerListLoading` skeleton | **Already good** — kept; empty copy now names the bucket (« Aucune commande à confirmer »). |
| Card: number, chip, buyer name, date, count, total | **Visually weak** — raw sizes, no action signal beyond the status word. |
| Detail first paint | **Functionally weak** — bare `CircularProgressIndicator` (PR B finding). |
| Detail error | **Stale** — generic text + unthemed button. |
| Status labels | **Redundant / drifting** — three copies (chip, timeline, filter bar). |
| Timeline | **Already good** (real `statusLogs`, oldest first) but the last dot was brand red. |
| Money | **Misleading** — item totals, order total and « Montant à recevoir » in brand red; commission in destructive red. |
| Buyer section | **Over-exposed** — phone, street, reference and recipient phone shown to a seller who never delivers. |
| Action bar | **Correct** for the three seller statuses; **silent** for READY (bar simply absent); labels « Confirmer / Préparer / Rejeter »; hard-coded red. |
| Dialogs | **Weak** — « Confirmer cette action ? » for everything; refusal button enabled with an empty reason; a double tap on the dialog button could pop the detail itself. |
| Failure handling | **Misleading** — generic « Une erreur est survenue » for a 400 stale transition, no refetch, raw `ScaffoldMessenger`. |
| Refresh | **Already good** for list/Action Center/badge (revision); the open detail did **not** follow the revision (a push while reading changed nothing). |
| Deep links | **Already good** — list push, Action Center → filtered list → push, notification `order-details` → push; `AdaptiveLeading` keeps an exit. |

**What changed (seller-mobile only).**

- `features/orders/presentation/order_status_ui.dart` (new): `OrderStatusUi.of(status)` → label, icon,
  tone, filter label, « step » sentence, card action label, `stepHeading`; `orderFilterOrder`;
  `orderEmptyCopy`. **Tone = status semantics**: warning while the seller acts (PENDING / CONFIRMED /
  PROCESSING), neutral while Teka collects (READY, RETURNED), info in transit, success DELIVERED,
  destructive CANCELLED — brand red on no status (test-pinned; chip contrast ≥ 4.5:1 still pinned).
- `order_status_badge.dart`, `orders_list_screen.dart`: read the vocabulary; per-bucket empty copy.
- `order_card.dart`: theme typography + tokens; amber « À confirmer / À préparer / À finaliser » pill
  next to the chip while the seller must act; one semantics label (number, status, action, buyer, count,
  total). **No list-card buttons, deliberately**: every transition is taken from the detail where the
  items are visible.
- `order_action_buttons.dart`: `Confirmer la commande` / `Refuser`, `Commencer la préparation`, `Marquer
  prête pour collecte`; theme colours; `busy` disables all and shows progress in the primary button.
- `order_detail_screen.dart` rewritten: `OrderDetailSkeleton` (static blocks: header, strip, two items,
  money, timeline, bar); shared `SellerListMessage` error; strip « Votre action / Prise en charge par Teka
  / Commande clôturée » + the step sentence; items first (« N articles à préparer »); buyer = **name +
  « Livraison assurée par Teka · {town} »** only; « Total payé par l’acheteur » vs « Montant à recevoir »
  in separate cards, all money in foreground, commission with a minus sign; payment line « Paiement à la
  livraison · encaissé par Teka à la livraison / encaissé par Teka / aucun encaissement »; no estimate card
  on cancelled / returned; timeline dots in each log's own tone, `dd/MM/yyyy · HH:mm`, notes italic;
  bottom bar = buttons, or « En attente de collecte par Teka » for READY, or nothing.
- Dialogs: confirm (« …passera en préparation. Vous ne pourrez plus la refuser ensuite »), prepare, ready
  (« Cette étape est définitive : la commande passe sous la responsabilité de Teka »), refusal (« annulée
  définitivement, le stock restitué et l’acheteur informé du motif », reason field, button disabled until
  typed, controller owned by the dialog). Every dialog button is guarded against a second pop.
- Transition run: `busy` → response seeds the fiche immediately (`SellerOrderModel.withTransition`,
  financials kept) → list refreshed explicitly (it keeps page + scroll) → revision refetch reconciles →
  success snackbar. Failure → `friendlyErrorMessage` (the API's French text) **and** a refetch; if the
  status differs from the one the dialog was opened on, « Le statut de cette commande a changé
  entre-temps : la fiche a été actualisée » (warning) instead of the error. `sellerOrderDetailProvider`
  now watches the orders revision (push / resume / mutation) and keeps the previous order on screen while
  refetching.

**Not changed:** API, schema, env, dependencies (item thumbnails stay `Image.network` with a placeholder
+ `cacheWidth`; no `cached_network_image` added to the seller app), analytics (the API owns
`order_confirmed` … events; the app adds none), the state machine, pricing, commission.

**Tests (seller 288, +41; analyze 16 infos, down from 20; buyer untouched, `responsive.dart` identical).**
`order_status_ui_test` (exactly the three seller statuses are actionable and have a primary label, card
labels, no raw enum / English, tones, filter coverage and order, READY step wording, empty copy);
`order_detail_screen_test` (skeleton not spinner, load error + retry, CTA per status + « Votre action »,
READY neutral, five non-seller statuses with the right heading, buyer privacy, FC formatting and
foreground money, timeline = logs only, confirm with revision bump and double-tap guard, refusal
validation, failure keeps state + API message + retry, stale → reload + message, status change while a
dialog is open, push refetch, immediate CTA update while the refetch hangs, cancelled order without
estimate, 320/360/390/412 × 1.0/1.5, 600/834/1024/1280 readable centred bar). Existing dashboard,
lists and forms tests follow the new labels and the per-bucket empty copy.

**Runtime (Pixel 8 Pro, development flavor, local API, Marie's seed orders — every mutation reverted).**
Action Center « Commandes à confirmer » → list on « À confirmer » with the amber pill → detail skeleton →
detail. **Real conflict:** the same order confirmed through the API with curl while the app showed it
pending → « Confirmer la commande » → dialog → warning « Le statut de cette commande a changé
entre-temps », fiche reloaded to « Confirmée » with « Commencer la préparation ». Then prepare → ready:
dialogs, busy button, fiche updated at once, « Prise en charge par Teka · En attente de collecte par
Teka », timeline En attente → Confirmée → En préparation → Prête pour collecte with tones; the list on
« En préparation » lost the card; the dashboard moved 1/1/1 → the right buckets and the badge followed.
Refusal on the restored pending order: button disabled until a reason, then « Annulée », « Commande
refusée. L’acheteur a été informé », timeline note « Rejetée par le vendeur : … », « À confirmer »
list empty with its own copy. Text scale 1.3× / 1.5× on the detail: wraps, line total drops under the
quantity on narrow layouts (fix found by the 320 px test), no clipping. Tablet 800 pt portrait and
1280 pt landscape: list cards capped, detail and bar centred in the readable column. **Two defects found
on the device and fixed before this PR was opened:** a dialog opened on a stale fiche (status refreshed
underneath) reported the raw API message instead of « a changé » — the pre-dialog status is now the
reference; the fiche lagged the slow dev refetch by 5–7 s after a success — the response now seeds it.
A third: a cancelled order read « Prise en charge par Teka » with an estimate card — now « Commande
clôturée », « aucun encaissement », no estimate. Restored byte-for-byte: three order statuses, the six
status-log rows created, the product stock the refusal had restored, `paymentStatus`, cancellation
fields, the COD transaction (`FAILED/order_cancelled` → `PENDING`), and the password hash (verified).
iOS: not built (no native change).

**Local tooling note (not the repo):** an Android Studio update shipped a Java 25 JBR, which Gradle's
Kotlin DSL compiler cannot parse (`IllegalArgumentException: 25.0.3`), so `flutter build apk` failed
before any Dart compiled. Fixed on this machine with `flutter config --jdk-dir` → JDK 21; nothing in the
repository changed and CI is unaffected (it installs its own JDK).

**First-launch notification permission (follow-up, not buried):** Android's system prompt still appears
over the dashboard on first launch and, after a reinstall, again. It did not obstruct this QA. Moving it
behind an onboarding moment is a product decision for a later PR (profile / settings, PR F, or its own).

**Buyer PII decision to confirm:** the seller detail no longer shows the buyer's phone, street, reference
or recipient phone (the API still sends them; seller-web still shows them). Reversible in one widget if
sellers turn out to need a contact channel other than Teka.

### Seller UX PR D — `seller-mobile/ux-products` (Products, form, image manager, 2026-09-08)

**Seller UX PR C merged** as `5d55f03` (merge commit; head `aac1296` unchanged, 15/15 checks + CodeQL green,
seller-mobile + trackers only). Develop synced and clean; `CI` + CodeQL green on `5d55f03`. **Buyer-PII
decision confirmed** by the product owner: seller order detail keeps name + town only.

**Products baseline (source + live app).** Traced: `GET/POST /v1/sellers/products`, `GET/PATCH /:id`,
`DELETE /:id` (archive) and `/:id/hard` (purges Cloudinary), `/:id/{submit,withdraw,restore,duplicate}`,
`POST /:id/images` (multipart, ≤ 8, no status rule) + `DELETE /:id/images/:imageId` (Cloudinary destroy),
`GET /v1/browse/categories` (3-level tree), `GET /v1/browse/categories/:id/attributes` (leaf-only),
`GET /v1/brands?categoryId=` (« Autre » included by the server). Rules kept exactly: leaf-only enforced
by the API **when the category changes** (legacy products keep theirs), brand relevance server-side,
promo `> 0 && < price`, `condition` always `NEW`, edit-after-publish (price / promo / stock live, content
back to review).

| Element | Verdict |
|---|---|
| List mechanics: 350 ms debounced search with reset version, route-synced status filter, race-safe pagination, `SellerListLoading` | **Already good** — kept. |
| Card | **Visually weak** — raw sizes, no stock, no effective price, no action signal for a refused product. |
| Status labels | **Redundant** — chip and filter bar each had their own copy; « En attente » meant review here and a new order elsewhere. |
| Detail | **Weak** — bare spinner, generic error, price in brand red, obsolete « Neuf » line, no promo, images « Ajouter » for draft/rejected only while the edit form managed them for any status. |
| Rejection | **Confusing** — reason in a red box with no « what to do », edit button like any other. |
| Form | **Confusing** — one flat list, « Titre (français) », category error as a snackbar, brand in a dropdown (unusable at 40 brands), spinners for brands/characteristics, generic « Une erreur est survenue » on save, **description not validated although the API requires it**, and **off-screen fields never validated** (lazy ListView + `FormState.validate()`). |
| Category selector | **Already good** — searchable, accent-insensitive, full path, leaf-only selection, tree for any depth. Kept; the form now warns on a legacy intermediate / inactive category. |
| Dynamic characteristics | **Already good** — API-driven, generation guard on category change, SELECT/MULTISELECT/NUMERIC/BOOLEAN/TEXT. Kept. |
| Image manager | **Already good** on the rules (≤ 8, compress ≤ 500 KB WebP, auth-retry once, owner-scoped delete, permission copy); **visually weak** (spinner per tile, no cover mark, generic delete dialog, raw snackbars). |
| Upload hardening, `image_picker` 1200/80, compression | **Untouched.** |

**What changed (seller-mobile only, 12 lib files).**

- `presentation/product_status_ui.dart` (new): label / filter label / icon / tone / strip heading + step /
  card action label per `ProductStatus`; `productFilterOrder` (« À corriger » first); `productEmptyCopy`;
  `discountPercent` (derived, never stored). Only REJECTED asks the seller to act; tones: neutral draft and
  archive, warning review, success online, destructive rejected and suspended; brand red on none.
- `widgets/product_card.dart` (new): `ProductCard`, `PriceLine` (effective price first, original struck,
  « −X % » success pill), `StockLabel` (« Stock : N » / « Rupture de stock » warning pill), `ProductThumbnail`
  (static placeholder, `cacheWidth`). One semantics label per card.
- `products_list_screen.dart`: shared vocabulary, per-bucket empty copy, search empty copy naming the query,
  labelled FAB.
- `product_detail_screen.dart` rewritten: `ProductDetailSkeleton`; `SellerListMessage` error; strip
  « Brouillon / En cours de révision / En ligne / Correction requise / Archivé / Suspendu par Teka » with the
  step sentence and, when refused, « Motif indiqué par Teka » (the API's seller-facing `rejectionReason`; no
  admin-only note exists on this payload); price card (promo + stock + leaf + town); photos with a
  « Couverture » tag and « Gérer » for draft / rejected / **online** (the edit form already managed online
  photos, the detail now agrees); description; characteristics; lifecycle actions unchanged in behaviour
  (submit / withdraw / restore / duplicate / archive) on theme buttons whose long labels wrap at 1.5×,
  with specific dialogs (« Teka examinera la fiche… Pendant la révision, vous pourrez la retirer mais pas
  la modifier », « Il disparaît de votre boutique… Vous pourrez le restaurer plus tard ») and double-pop
  guards; API French reasons on failure; the « Neuf » line removed.
- `product_form_screen.dart` rewritten: sections in the seller's order (Photos on edit → Informations →
  Catégorie et marque → Caractéristiques → Prix → Stock); a create notice « Les photos s’ajoutent à
  l’étape suivante »; inline « Choisissez un type de produit. » that scrolls the selector into view;
  **legacy warning** (« « Chaussures » est une catégorie générale… » / « n’est plus proposée ») that never
  guesses a child; `BrandSelector` sheet (searchable above 6 brands, « Sans marque » first, « Autre » from
  the API); static loading lines; helpers (« 45.000 FC », « −10 % · Vous économisez 4.500 FC », « 0 =
  rupture de stock ») on two lines; `autovalidateMode` after the first submit; `Enregistrer et ajouter des
  photos` / `Enregistrer les modifications`; success copy says when content goes back to review; failure
  keeps the form and shows the API's reason. **Two defects fixed:** description now validated (the API
  answered « La description est requise » and the seller only learnt on save); the body is a `Column`, so
  every field is built and validated (`FormState.validate()` only reaches built fields — the old lazy
  ListView let an empty description through). `ProductEditScreen` cold route: `ProductFormSkeleton` +
  shared error.
- `product_image_manager.dart` + `image_upload_tile.dart`: sorted by `displayOrder`, « Couverture » on the
  first tile (constrained at large text), static placeholders, source sheet on the white theme with a
  title, « Envoi… » in the add tile, delete dialog « Supprimer cette photo ? … retirée définitivement de la
  fiche et de nos serveurs », app snackbars. Picker size 1200/80 and compression untouched.

**Not changed:** API, schema, env, dependencies (thumbnails stay `Image.network`), analytics (the app has
no product events; none added), Buyer Mobile (`responsive.dart` identical).

**Tests (seller 330, +42; analyze 5 infos, down from 16).** `product_status_ui_test` (only REJECTED
actionable, French everywhere, tones, filter coverage, empty copy, derived discount), `product_card_test`
(price / stock / status, promo strike + pill, rejected pill + rupture, semantics + navigation, 320/360/412
at 1.5×), `product_detail_screen_test` (skeleton, rejected strip + reason + one CTA, promo/stock/cover/Gérer,
actions per status, submit refused without photos, submit dialog + double tap + status move, API reason on
failure, archive dialog + return to list, 320/412/834/1280), `product_form_test` (category required inline,
leaf-only load + change clears brand and specs, brand sheet search + « Autre » + empty, legacy warning
without foreign characteristics and unchanged categoryId on save, edit prefill == create payload
(centimes, brand, promo, quantity, NEW, specs), promo below price + null clears, quantity required / zero,
description required, busy guard + navigation to the new product, API failure keeps the form,
320/360/600/1024/1280 at 1.0–1.5×). Image-manager, forms, lists, dashboard and tablet tests follow the new
copy and the Column form.

**Runtime (Pixel 8 Pro, development flavor, local API, disposable data — all reverted).** Marie: list
(promo strike-through, stock, chips) · « À corriger » empty copy · create form (notice, sections) · save
with nothing → inline category error scrolled into view · category sheet search « chem » → « Chemises ·
Mode › Homme » · brands for the leaf (Nike, Lacoste, Autre, « Sans marque » first) → Lacoste ·
characteristics loaded (Taille SELECT, Couleur, Matière) · « 45.000 FC » and « −10 % · Vous économisez
4.500 FC » live · **save refused by the API « La description est requise »** (defect found, fixed, retested
in the widget suite) · save → « Fiche enregistrée en brouillon » → detail skeleton → detail (promo, Stock 4,
Chemises, « Ajouter des photos ») · image manager → **gallery** photo (Android photo picker) → « Envoi… »
→ « Photo ajoutée » → tile with « Couverture » · **camera** (emulator scene) → second photo · delete second
→ dialog → gone from the tile grid, **from the database and from Cloudinary (404 on the public id)** ·
submit → dialog → « En cours de révision » · withdraw → « Produit retiré de la révision » · edit prefilled
(photos inline, path, Lacoste, Taille M) · category → Pantalons: brand reset to « Sans marque »,
characteristics refreshed · Taille L, stock 7 → « Modifications enregistrées » → detail Pantalons / Stock 7
/ Taille L · legacy « Chaussures Nike Air Force 1 » (category « Mode › Chaussures », intermediate) → edit
shows the warning, no brands, no foreign characteristics. Patrick: dashboard « Produits à corriger 1 » →
« À corriger » → card « Refusé · À corriger » → detail « Correction requise » + « Motif indiqué par Teka :
Prix anormalement bas… » + « Corriger et resoumettre ». Tablet 800 pt portrait: detail, edit form (price
pair side by side, image manager inline), category sheet capped at 640; 1280 pt landscape: form, detail,
list. Text 1.3× / 1.5×: list and detail wrap, cover tag now scales down. **Cleanup:** the QA product
hard-deleted through the seller endpoint (`purgedAssets: 1`, Cloudinary 404), both password hashes restored
byte-for-byte (temporary password 401s), no pre-existing product changed (checked field by field), QA photo
removed from the emulator. Cloudinary was only ever *read* by the check script (dev and prod share one
cloud). iOS: not built (no native change).

**Environment incidents during this QA, recorded because they cost an hour:** a network drop killed the
emulator and left the dev API's Prisma pool unable to reconnect (« Can't reach database server » →
« Timed out fetching a new connection »); 18 idle server-side sessions from the killed process had to be
terminated with `pg_terminate_backend` before a fresh API could serve; the API restart then invalidated
the app session once. None of it is app behaviour; the app's own message in that state was the API's
« La description est requise », which turned out to be the real defect.

**Known limitation (taxonomy debt, not this PR):** a product remediated onto a new leaf can carry legacy
characteristic rows whose attribute ids belong to the old category; the detail lists them (the API
preserves them) but the edit form cannot prefill the new leaf's fields from them. Documented in
`docs/seller-catalog-taxonomy.md`; a leaf-characteristics audit is the fix.

### Seller UX PR E — `seller-mobile/ux-earnings-payouts` (Earnings + payouts, 2026-09-08)

**Seller UX PR D merged** as `a6b0d7c` (merge commit; reviewed head unchanged, 15/15 checks + CodeQL green,
seller-mobile + trackers only). Develop synced and clean; `CI` + CodeQL green on `a6b0d7c`.

**Earnings baseline (source + live app).** Traced: `GET /v1/sellers/wallet` (`balanceCDF` = `availableCDF`,
`pendingCDF` = inside the 2-day window, `totalEarnedCDF` = **gross** of delivered sales,
`totalCommissionCDF`, `pendingPayoutCDF` = legacy alias of available — field names frozen), `GET
/v1/sellers/earnings` (rows with the API-derived `state` REVERSED → PAID / RESERVED → HELD → AVAILABLE, the
commission rate snapshotted per row), `GET /v1/sellers/payouts` + `GET /v1/sellers/payouts/:id` (owner-scoped:
another seller's id, a deleted id or garbage all answer the same French 404), `POST /v1/sellers/payouts`
(under `SELECT … FOR UPDATE`; **pays the whole available balance — there is no amount field**;
`MIN_PAYOUT_AMOUNT_CDF` = 5.000 FC → 400 with the current balance in the message; an open payout → 409
« Vous avez déjà une demande de retrait en cours… »), `GET/PATCH /v1/sellers/payout-method` (saved
destination). Statuses `REQUESTED → APPROVED → PROCESSING → COMPLETED`, `REJECTED` from any of the three
open states; the row carries `requestedAt / approvedAt / processingAt / processedAt / rejectedAt` plus
admin *ids* (`approvedById`…) that the app never reads. `docs/payouts.md` reconfirmed: **no payout state
requires anything from the seller** — no Action Center task, none added.

| Element | Verdict |
|---|---|
| Mechanics: tab structure, race-safe pagination, refresh on the `earnings` revision (push / resume), min-balance and open-payout pre-checks mirroring the API, saved destination prefill, owner-scoped detail, notification routes | **Already good** — kept. |
| Wallet summary | **Misleading** — three equal cards in brand red / success / warning; « Revenus totaux » was the *gross* (a seller read it as money owed); the reserved amount of an open payout was nowhere; a failed wallet request rendered « 0 FC ». |
| Payout CTA | **Weak** — always prominent, disabled without a way to the blocking payout. |
| Request screen | **Risky** — no confirmation, operator dropdown, no statement of the amount, generic error on the API's 400 / 409 and no refetch of the stale balance. |
| Status vocabulary | **Low contrast** — payout and earning chips on the base colours as text; « Réservé » in brand red. |
| Lists | **Exposed** — the full Mobile Money number on every payout row; raw sizes; gains in green, commission in destructive red. |
| Detail | **Thin** — spinner, amount + chip + « Demandé le / Payé le » only; no history. |
| Loading / empty | **Generic** — three spinners, « Aucun revenu pour le moment ». |

**What changed (seller-mobile only, 9 lib files).**

- `presentation/payout_status.dart`: tones move to the *Foreground* tokens (REQUESTED warning, APPROVED /
  PROCESSING info, COMPLETED success, REJECTED destructive; earnings HELD warning, AVAILABLE success,
  RESERVED info, PAID / REVERSED neutral — brand red on none); icons per status; `PayoutStatusUi.isOpen`;
  `maskPhone` (« +243 97• ••• 001 »); `payoutEvents` — dated facts from the row's timestamps only
  (« Demandé le », « Approuvé le », « Virement lancé le », « Payé le » / « Refusé le » / « Échec le »
  when the failure came after the transfer started), never a future step, never the admin.
- `data/models/earning_model.dart`: additive `approvedAt / processingAt / rejectedAt` on `PayoutModel`
  (older responses simply omit them).
- `providers/earnings_provider.dart`: `walletError` (a failed wallet is an error, not « 0 FC »);
  `EarningsState.openPayout`; `requestPayout` keeps the API's French reason and, on 400 / 409, refetches
  wallet + earnings + payouts; **`refresh()` and the post-request reload now refetch wallet, earnings and
  payouts together** (runtime defect: only the wallet and the visible tab were reloaded).
- `widgets/wallet_card.dart` rewritten: `WalletSummaryCard` (hero « Solde disponible » in foreground
  `headlineMedium`, « X FC en attente » warning badge + the 2-day sentence, « X FC · virement en cours »
  info badge from the open payout's own amount, then « Ventes livrées (montant brut) / Commission Teka
  prélevée / Vos gains nets (depuis le début) » on `WalletLine`s that drop the amount to its own line rather
  than break it), `WalletSummarySkeleton`, `HeroAmount` (`FittedBox` — one line at any scale).
- `widgets/earning_tile.dart`: net amount strong in the foreground colour, « Vente X − commission Y (rate) »
  muted, state on `SellerStatusBadge`; one semantics label.
- `widgets/payout_tile.dart`: amount, status chip, « opérateur · masked number », « Demandé le », the
  reason (rejected) or reference (completed); tap → detail.
- `earnings_screen.dart`: `minPayoutCdf` mirrors the API for the disabled-button copy only; scoped
  « Solde indisponible » card with retry; `PayoutRequestAction` — live only when the API would accept,
  otherwise the reason in words and « Voir le virement en cours »; `SellerListLoading` / contextual empty
  copy (« Vos gains apparaîtront ici après la livraison… », « …dès que votre solde disponible atteint
  5.000 FC » with « Demander un virement » or « Voir mes gains ») anchored at the top of the tab body (the
  NestedScrollView centred it below the fold); « Actualiser » action; static load-more footer.
- `request_payout_screen.dart` rewritten: « Montant du virement : X FC — la totalité de votre solde
  disponible » (no amount input invented); blockers re-evaluated on every wallet refresh (wallet missing,
  open payout with a link, below the minimum with both figures); radio `_OperatorPicker`; `TextFormField`
  with `validatePayoutPhone` (`^\+243\d{9}$`, French reasons); confirmation dialog « Confirmer la demande
  de virement » repeating amount + « opérateur · full number » + « …un virement vers un mauvais numéro ne
  peut pas être annulé » (scrollable, double-pop guard); busy lock « Envoi en cours… »; success snackbar
  with the amount then pop; failure keeps the values, shows the API reason in a live region.
- `payout_detail_screen.dart` rewritten: `PayoutDetailSkeleton`; hero + chip + hint; « Destination » card
  (operator, full number, reference selectable, reason or « Non précisée »); « Historique » card; shared
  error with « Réessayer » + « Voir tous mes virements ».

**Not changed:** API, schema, env, dependencies, analytics (no earnings events exist; none added), the
`sellerRefreshProvider` semantics, notification routes, Buyer Mobile. Nothing about the payout destination
is logged, sent to Sentry or to analytics; the number is masked in lists and shown only where the seller
must verify it.

**Tests (seller 387, +57; analyze 5 infos unchanged).** `earnings_screen_test` (hierarchy + « 9.350 FC »
formatting, reserved vs available, wallet error → retry, skeleton without spinner, eligibility at 5.000 /
4.999 / open payout → link, earning row tones, payout rows + masking + tap, empty earnings → orders, empty
payouts below / above the threshold, list error scoped, « Actualiser » refetching all three, 320/360/412 at
1.0–1.5×, 1024 readable), `request_payout_screen_test` (amount statement + prefill, French validation
before any call, confirmation repeats full destination, cancel sends nothing, confirm saves the destination
then sends once on a double tap, 400 stale balance → reason + values + refetch + disabled, 409 → link to
the open payout, below-minimum on entry, in-flight lock, widths, tablet), `payout_detail_history_test`
(REQUESTED lists only « Demandé le », COMPLETED four dated events in order + reference once, « Échec le »
vs « Refusé le » + « Non précisée », skeleton, widths, `payoutEvents` never invents a step, admin ids
ignored), `payout_ui_helpers_test` (`maskPhone`, `validatePayoutPhone`, vocabulary — only COMPLETED reads
« Payé », open states, tones never brand red, `openPayout`, `walletError`). Fixture:
`test/support/seller_earnings_fixtures.dart`. The existing `payout_detail_screen_test` strings are pinned
unchanged (« Payé », « Payé le », « Refusé / échec », « de nouveau disponible », « Voir tous mes
virements », « Réessayer », « M-Pesa (Vodacom) »).

**Runtime (Pixel 8 Pro, development flavor, local API, Marie's dev rows — disposable, all reverted).**
Another seller's genuine empty wallet (0 FC, « Aucun gain pour le moment » + « Voir mes commandes ») ·
Marie: summary 63.000 FC available / 115.000 gross / − 11.500 / 103.500 net, HELD « En attente (retour
possible) » and AVAILABLE rows with « Vente … − commission … (10 %) » · Virements: the completed payout
(masked number, « Référence : MPESA-QA-… ») → detail: « Payé », full number, reference, history Demandé
27/02 → Approuvé 04/09 16:50 → Virement lancé 16:51 → Payé 16:53 · request screen: « Montant du virement
63.000 FC », submit empty → both French errors, « 0970000001 » → format error, valid number → the keyboard's
done key opens the confirmation (amount + « M-Pesa (Vodacom) · +243970000001 ») · **a payout created through
the API while the dialog was open** (seller-web simulation) → Confirmer → « Envoi en cours… » with the form
locked → « Vous avez déjà une demande de retrait en cours. Veuillez attendre son traitement. » verbatim,
values kept, 0 FC refetched, button disabled with its reason, « Voir le virement en cours » → detail
« Demande reçue », « Demandé le » only · back: « 63.000 FC · virement en cours », blocked button + link,
Virements with the REQUESTED row · Gains: **« Disponible » still shown for the reserved earning — defect,
fixed** (earnings now reload with the wallet) · revert → « Actualiser »: **badge and blocked button
persisted — same defect, same fix** · rebuilt: reserved row correct, refresh clears the reserved state ·
**the in-app request**: M-Pesa + number → confirmation → « Demande envoyée. Teka examine votre demande de
63.000 FC. » → summary reserved, Virements « Demande reçue » row · 1.3× / 1.5×: summary lines and earning
headers wrap with the amount on its own line, badges wrap, request and detail readable · tablet 800 pt
portrait (skeleton, then loaded) and 1280 pt landscape (summary, request, detail) in a readable column.
**Cleanup:** both QA payouts deleted (`691ffc9b…` from the API, `a14d629c…` from the app), the reserved
earning reset (`isPaid` false, `payoutId` null), `payoutMethod` / `payoutPhone` back to null, the password
hash and `passwordSetAt` restored byte-for-byte (temporary password 401s), bearer token and cookie jar
deleted, app logged out, emulator and API stopped. iOS: not built (no native change).

**Recorded, not changed (API-side):** `getSellerWallet` counts `pendingCDF` from `deliveredAt`, so a HELD
earning whose DELIVERED order carries no `deliveredAt` (Marie's `TK-20260412-6BEE`, an older row) is shown
as « En attente (retour possible) » in the list but missing from the « en attente » badge. Data
inconsistency of old rows + a defensive `state` derivation; a backfill or a `state`-based pending sum is
the fix, out of this PR's scope.

**Risk:** low — presentation and refetch scope only; the request flow keeps the same two calls in the
same order; the API decides every rule. The one behavioural change is that refresh, push / resume and the
post-request reload now issue three requests instead of two (page 1 of each list).

### Seller UX PR F — `seller-mobile/ux-profile-verification` (Profile, commune, verification, 2026-09-08)

**Seller UX PR E merged** as `0ecbcea` (merge commit; reviewed head `2e68f29` unchanged, 15/15 checks +
CodeQL green, seller-mobile + trackers only). Develop synced and clean; `CI` + CodeQL green on `0ecbcea`.
**The `pendingCDF` / HELD / `deliveredAt` inconsistency recorded under PR E stays open** (see the
follow-ups below and « Next exact step »).

**Baseline (source + live app, walked before any change).** `GET /v1/auth/me` (user + `sellerProfile`
with `city { id, name }` and `commune { id, name }`), `PATCH /v1/users/profile` (`UpdateProfileDto`:
names ≥ 2 chars with French messages, `IsEmail` « Adresse email invalide »; an email change resets
`emailVerified` and **changes the login identifier with no re-authentication** — recorded, not changed),
`POST /v1/users/avatar`, `PATCH /v1/sellers/profile` (`UpdateSellerProfileDto`: `businessName` ≥ 2,
`phone` `^\+243\d{9}$` « Numéro de téléphone invalide », `cityId` validated by DB lookup, `communeId`
resolved server-side — must exist, be active and belong to the city; required when the city has an active
commune library; `null` clears only when it has none), `GET /v1/cities` + `GET /v1/cities/:id/communes`
(active rows only — no client-side list of towns), `GET /v1/sellers/verification` (`verificationStatus`
NOT_SUBMITTED | PENDING_REVIEW | VERIFIED | REJECTED, `verificationNote` only when REJECTED, `requiredTypes`
by `businessType`, `missingTypes`, `limits`, documents without any storage id or URL) and
`POST /v1/sellers/verification/documents` (multipart; magic-byte + MIME + size re-checked server-side;
replacement marks the previous live document SUPERSEDED with a retention `purgeAfter`; the required set
complete → PENDING_REVIEW; a VERIFIED seller replacing material evidence → PENDING_REVIEW). Statuses map
1:1 to the four backend states — nothing invented (no « incomplete » stage exists server-side; the
NOT_SUBMITTED card says how many documents are missing from the API's `missingTypes`).

| Element | Verdict |
|---|---|
| Commune cascade, `communeRequired` / `retainedCommuneId` mirror, only-changed-fields save, API reasons through `friendlyErrorMessage` | **Correct already** — kept. |
| Verification flow: server-driven required set, magic-byte pre-check, one upload at a time, replace warning for VERIFIED, OTHER label prompt, progress, API status rendered after upload | **Correct already** — kept. |
| Account header | **Presentation** — dark card, status chip colour-only in white text, no town · commune, brand red on all icon frames, raw sizes. |
| Account menu | **Functional defect (found by the new tests)** — `ListTile`s in a `DecoratedBox`: ripple never painted. Also no signal on the one row that needs the seller. |
| Header refresh after an edit | **Functional defect (found on the device)** — the reload hooked on `await context.push()` never fired; a saved name or commune stayed stale until pull-to-refresh. |
| Personal information | **Usability** — no validation (the API answered), raw `ScaffoldMessenger` toasts, generic « Erreur lors de l'enregistrement », the dashboard greeting stale until relogin. |
| Shop profile | **Usability** — flat list, no validation, banners on base colours, a saved town missing from the list silently showed the hint. |
| Verification | **Presentation + usability** — base-colour badges, « Requis » in brand red, no « what to do » on REJECTED, spinner, generic error. |
| Security / notifications / deletion | **Out of scope** except raw snackbars → `showAppSnackbar`. |
| Seller application (registration) | **Out of scope** (auth flow). |
| Notification-permission prompt | **Investigated** — see decision below. |

**What changed (seller-mobile only, 11 lib files).**

- `verification_status.dart`: tones on the Foreground tokens (neutral / warning / success / destructive);
  `actionRequired` (REJECTED only — the Action Center's rule); `ApplicationStatusUi` (« Boutique
  approuvée » / « Demande en révision » / « Demande rejetée »); `DocumentStatusUi` tones likewise.
- `profile_screen.dart` rewritten: `SellerIdentityCard` (shop `titleLarge`, person, login email, town ·
  commune, two `SellerStatusBadge`s), `ProfileSkeleton`, `SellerListMessage` error, `DashboardErrorRow` when
  a refetch fails with content kept, menu sections on `labelLarge`, `Material` sections, neutral icon
  frames (destructive frame + « Action requise » pill under the subtitle on the refused verification row —
  the pill moved out of the trailing slot after the 320 px / 1.5× layout assertion), reload on the
  `profile` / `verification` refresh revisions and on return from a pushed edit screen; analytics events
  unchanged (`seller_account_tab_opened`, `seller_account_menu_item_tapped`, `seller_logout_tapped`).
- `personal_info_screen.dart` rewritten: `FormSkeleton`, `Form` with `validateName` / `validateEmail`
  (the API's words), sections « Identité » / « Connexion », the email helper says it is the login, only
  changed fields sent, API values shown back, `AuthNotifier.updateUser` (new: merges non-null fields into
  the session user), API reason in a live region with values kept, busy lock, `showAppSnackbar`.
- `shop_profile_screen.dart`: sections, `validateShopName` / `validateShopPhone`, `_saveError` banner in
  a live region (API reason verbatim, « Choisissez votre commune pour cette ville. »), stale-town notice
  (« Votre ville enregistrée, Goma, n’est plus proposée… sinon elle reste inchangée » — the dropdown shows
  the hint, other edits never send `cityId`), tokens on the banners, `FormSkeleton`, shared error.
- `verification_screen.dart` (UI half): `VerificationSkeleton`, shared error + retry, status card with the
  badge and, when REJECTED, the « Action requise » strip (« Motif de Teka RDC : … » / « non précisé »,
  « Remplacez le document refusé ci-dessous… », one `ElevatedButton` « Remplacer le document refusé » →
  `_correctionType` = the refused required type, else any refused, else the first missing), document
  tiles with a « Requis » / « Facultatif » pill, the state as a compact badge, refused outline, one
  semantics label per tile, progress and error rows in tokens; pickers, dialogs, validation and the upload
  path untouched.
- `seller_refresh_provider.dart`: the record gains `profile`; `profileChanged()`.
  `profile_repository.dart`: `onChanged` hook called after `updateProfile` and `updateSellerProfile`;
  `ProfileUser.copyWith(avatar)`.
- `security_screen.dart`, `notification_settings_screen.dart`, `account_deletion_screen.dart`: raw
  `ScaffoldMessenger` toasts → `showAppSnackbar` (one line each).
- `auth_provider.dart`: `updateUser`.

**Not changed:** API, schema, env, dependencies, analytics, Cloudinary lifecycle (`SUPERSEDED` +
`purgeAfter` on replacement, verified live), the seller application screen, login / password reset /
sessions, Buyer Mobile (`responsive.dart` byte-identical). Nothing about documents, identity numbers,
phone numbers or payout destinations is logged or sent to Sentry / analytics.

**Notification-permission decision.** On a cleared install the system prompt (« Allow Teka Vendeur Dev to
send you notifications? ») lands on the dashboard right after the first login, while the dashboard
loads. Kept: it is asked once by the OS (Android never re-prompts after two denials, iOS after one; the
app calls `requestPermission` on login only), the value is evident for an app whose purpose is order
alerts, and the notification-settings screen already explains a denial with a path to the phone
settings. A pre-permission explainer would add a second dialog on the very first screen; recorded as a
follow-up to revisit if PostHog shows denial rates worth it.

**Tests (seller 461, +74; analyze 5 infos unchanged; buyer 501 unchanged).**
`test/support/seller_profile_fixtures.dart` (in-memory `/v1/auth/me`, cities, communes, writes with a
hold and switchable failures). `profile_screen_test` (hierarchy + badges, no phone in the header,
skeleton, error + retry, refused row → « Action requise » → navigation, tones, refresh on the `profile`
and `verification` revisions with content kept, return-from-edit refetch, logout dialog cancel / confirm →
session cleared → login, account isolation across sessions, 320/360/390/412 at 1.0 and 1.5×,
600/1024/1280, `updateUser`, repository hook), `personal_info_screen_test` (prefill, skeleton + error,
validation before any call, changed fields only + session sync, unchanged form, email normalised + copy,
API refusal keeps values, busy lock, widths, tablet), `shop_profile_screen_test` (prefill with commune,
skeleton + error, name / phone validation, town change → communes reloaded → commune required → payload,
town without communes, stale town kept, API refusal keeps values, commune retry, pending read-only, widths,
tablet), `verification_screen_test` additions (tones, strip + button → refused type, « non précisé »,
skeleton + error, semantics label, rejected company at 320–412 × 1.0–1.5, 600/834/1280); the two
pre-existing debug `print`s in that file removed. Existing verification strings pinned unchanged.

**Runtime (Pixel 8 Pro, development flavor, local API, Marie + Patrick dev rows — disposable, all
reverted).** Cleared install → login → system notification prompt on the dashboard (allowed) → account
card (« Boutique approuvée », « Non vérifié », Lubumbashi) → personal information: « M » → « Le prénom doit
contenir au moins 2 caractères » → « Marie-Claire » → « Informations enregistrées » → header « Marie-Claire
Kabila » and dashboard « Bonjour, Marie-Claire » at once → shop profile: legacy commune null shown as
« Commune * » required → Kampemba → « Boutique mise à jour » → header « Lubumbashi · Kampemba » → last
name edit → header follows on return (after the refresh-revision fix; before it the header stayed stale) →
verification (NOT_SUBMITTED, « Il manque 1 document ») → « Prendre une photo » → emulator camera → « Envoi
en cours… » then « Vérification du fichier… » while the API pushed to Cloudinary → « En attente de
vérification · JPEG, 27 Ko » → admin refusal simulated in the dev DB (REJECTED + reason, document REJECTED)
→ pull-to-refresh: header « Vérification refusée », tile « Action requise »; dashboard « Vérification à
refaire » (count 4) → tap → strip with « Motif de Teka RDC : Photo illisible… » → 1.3× / 1.5× → « Remplacer
le document refusé » → camera → PENDING_REVIEW, first document SUPERSEDED (`purgeAfter` +90 days), second
PENDING, FCM « Documents reçus » delivered to the emulator → account at 1.5×, shop form at 1.5× → tablet
800 pt portrait (account, verification, personal information) and 1280 pt landscape (account, verification,
shop form) in a readable column → logout dialog → Patrick → his own account (no Marie data) → logout.
**Cleanup:** Cleanup verified field by field: Marie's two QA documents deleted with both Cloudinary assets destroyed (2 destroyed, 0 missing), her first name, last name, commune and verification fields restored, both password hashes and `passwordSetAt` restored byte-for-byte (temporary password 401s), Patrick untouched apart from the restored hash; the QA scripts holding the temporary password deleted. Cloudinary: the two QA assets destroyed
(`teka-rdc/seller-documents/<profile>/<doc>`), nothing else touched (dev and prod share one cloud).
iOS: not built (no native change; interactive simulator tooling not exercised).

**Recorded, not changed (follow-ups).**
- API: changing the login email via `PATCH /v1/users/profile` needs no re-authentication and no
  confirmation of the new address (`emailVerified` reset only). Security follow-up, not a PR F change.
- Seller Web parity: `/dashboard/profile` has no notice for a saved town missing from the active list and
  no « Action requise » signal on the account page; the verification vocabulary is identical (same
  labels / hints). Follow-up, no contradiction introduced.
- Notification-permission pre-prompt (above).
- Still open from earlier PRs: first-launch prompt placement (this decision), order-number header wrap at
  1.5×, plain `Image.network` thumbnails, legacy characteristic prefill (taxonomy audit), **API
  `pendingCDF` excludes a HELD earning without `deliveredAt`**, no golden tests, iPad / iOS runtime never
  exercised.

**Risk:** low — presentation, validation mirrors and refetch scope; the API decides every rule; the
upload path, pickers and dialogs are unchanged. The one behavioural addition is the `profile` refresh
revision (one extra `GET /v1/auth/me` after a save, on the account screen only).

### Remaining Seller UX findings by PR (from the baseline audit + this PR's walk)

| PR | Surface | Findings to act on |
|---|---|---|
| **B** dashboard + Action Center | `features/home` | **Done in PR B** — text theme, tokens, shaped skeleton, verification task, Suivi, one badge. Left: the first-launch notification-permission prompt still lands on the dashboard (system prompt; moving it needs an onboarding decision). |
| **C** orders | `features/orders` | **Done in PR C** — one status vocabulary, cards, detail skeleton, strip, dialogs, conflict reload, timeline tones. Left: the order-number header wraps under a wide chip at 1.5× (cosmetic); item thumbnails remain `Image.network` (no cache dependency in the seller app). |
| **D** products / form / images | `features/products` | **Done in PR D** — vocabulary, cards, detail skeleton + strip, sectioned Column form with validation fixes, brand sheet, legacy warning, image manager polish. Left: thumbnails stay `Image.network`; legacy characteristic rows cannot prefill a new leaf's fields (taxonomy debt). |
| **E** earnings + payouts | `features/earnings` | **Done in PR E** — wallet hierarchy (available hero, reserved / pending badges, gross − commission = net), one payout/earning vocabulary on foreground tones, masked numbers in lists, request flow with amount statement + confirmation + stale-balance refetch, detail with a dated history from the API's timestamps, skeletons, contextual empty states. Left: the API's `pendingCDF` excludes a HELD earning whose order has no `deliveredAt` (API-side, recorded below). |
| **F** profile / commune / verification / settings | `features/profile`, `features/verification` | **Done in PR F** — identity card + labelled badges, actionable row, skeletons, validators in the API's words, stale-town notice, verification strip + one correction button, semantic tones, refresh revision. Left (out of scope, recorded): seller application (registration) screen spacing; login-email change without re-auth (API); notification pre-prompt. |
| cross-cutting | `features/promotions` (17/12/2), `features/reviews` (9/4/1), `features/notifications` | Folded into the PR whose navigation reaches them (promotions → B, reviews → F, notifications → B). |

## Checkpoint (2026-09-08) — read-only status of the whole pre-scale-readiness initiative

Recorded after Seller UX PR F merged (`f2b8d49`, CI + CodeQL green on `develop`). Nothing was
implemented during this checkpoint. Every claim below was re-verified against the code on `f2b8d49`
(three read-only audits: buyer-web SEO, API/web security controls, CI/media/mobile evidence), the
merged-PR list and `origin/main`.

### Headline: what production is running

**`main` = `78c6ef9` (release PR #669, 2026-09-06 09:55 UTC). Every PR merged since — #670 to #710,
104 commits, 106 files under `apps/api`, the three web apps, `nginx/` and `.github/` — is on `develop`
only.** Production therefore still carries the Phase 0 findings that PRs 1–5 fixed: S1 cross-surface
privilege escalation (D2a), S2 stored XSS through JSON-LD, S4 payments IDOR, S5 no auth throttling or
login lock, S6 Cloudflare real IP, S7 `next` 15.5.18, S8 unbounded MIME-trusting uploads, S9 the old
CSP with `unsafe-eval`, and CI without web/Flutter gates. The store builds likewise predate the Buyer
Mobile functional fixes (buyer 0.1.7+9, Sep 4; seller 0.1.9+11, Sep 6 — the latter carries only the
verification screen). **The first action of the next phase is a `develop → main` release of the
security work, not more feature work.** What that release needs: one additive auto-applied migration
(`2026-09-06_auth_rate_limits.sql`, model `AuthRateLimit` — the only schema delta since `main`), no env
change (PR 2–4 records), nginx reload (real-IP + HSTS-only headers), the stale rollback procedure in
`docs/deployment.md` rewritten first (see Infrastructure below), and the manual Cloudflare origin
firewall.

### A. Buyer Mobile functional readiness — COMPLETE (closure table above, PRs #686–#698)

Authentication/OTP (BUYER-only, D1), offline cold start (A2/A3), session/account isolation (A4/MS5),
cart + checkout + promotional pricing (A1, quote totals, price-change notice, idempotent placement),
orders + order detail (one French status mapping, all filters, snapshot address), addresses + recipient
phone (one canonical rule, server-validated town ↔ commune), ratings (create/edit/delete, one visibility
predicate, « Achat vérifié »), profile + editing + avatar (D11 lifecycle, multipart retry, session user
sync), notifications (refetch on open/push/resume, iOS local notifications initialised), deep links (App
Links + `teka://`, category slugs, city-gate parking), discovery/search/wishlist/town selection (data-driven
towns), logout/account switching (caches cleared), loading/error/empty states and accessibility (UX PR
A–D), tablet (PR 12). **Incomplete: nothing functional.** Validation-only gaps: iOS runtime never driven;
buyer-web browser QA of the address flow skipped (D2/D3 QA-stack cookies); dev/staging App-Link hosts
without `assetlinks.json`. Recorded debt: nameless legacy buyers nudged, not forced; `search_performed`
sends the free-text term (phones scrubbed, emails not — decision 10 kept).

### B. Buyer Mobile UX/UI — COMPLETE

PRs A `7dadf23` (#701), B `a57dcf5` (#702), C `cf0f148` (#703), D `9ff8b64` (#704). Major
improvements: design tokens + one image treatment + one empty-state language; home/search/category cards;
PDP/cart/checkout (unit vs subtotal, delivery quote wording, step names, COD glyph, success next-steps);
orders/ratings/profile/notifications (white dialogs and sheets app-wide, status colour only on chips,
list skeletons). Remaining cosmetic debt (deliberate): raw `fontSize`/radius literals on screens no PR
touched; the banner scrim over a pale image. Validation gaps: iOS/iPad runtime never exercised (no
simulator input tooling in any session); no golden tests; UX PR A and C did not re-run the tablet.

### C. Seller Mobile functional readiness — COMPLETE for the surfaces owned by this initiative

Dashboard + Action Center (PR B: actionability derived from API transitions; payouts deliberately absent),
orders + lifecycle (PR C: specific dialogs, conflict reload, timeline from `statusLogs`), products +
create/edit (PR D: description and lazy-form validation defects fixed), product images + Cloudinary
lifecycle (owner-scoped delete destroys the asset; hard-delete purges), characteristics/category/brands
(server-driven), earnings + payouts (PR E: refresh scope defect fixed), profile + commune + verification +
documents (PR F: header refresh defect fixed; SUPERSEDED + 90-day purge verified live with the daily
cron), notifications (push routes UUID-checked), auth/session isolation (verified Marie → Patrick), tablet
(PR 13 + every Seller UX PR at 800 pt portrait and 1280 pt landscape). **Previously recorded technical
debt — all still open, none functional-blocking:** legacy product characteristic prefill (taxonomy
audit); plain `Image.network` thumbnails (no cache dependency by decision); **API `pendingCDF` excludes a
HELD earning whose DELIVERED order has no `deliveredAt`** (old rows; a backfill or state-based sum);
notification-permission pre-prompt (decision recorded in PR F: keep the single OS prompt); no golden
tests; iOS runtime never exercised.

### D. Seller Mobile UX/UI — series A–F COMPLETE

| PR | # | Merge | State |
|---|---|---|---|
| A foundation + splash | #705 | `8086594` | merged |
| B dashboard + Action Center | #706 | `5825cb3` | merged |
| C orders | #707 | `5d55f03` | merged |
| D products / form / images | #708 | `a6b0d7c` | merged |
| E earnings + payouts | #709 | `0ecbcea` | merged |
| F profile / commune / verification | #710 | `f2b8d49` | merged |

Completed UX work: per-app tokens, text theme, semantic tones, white surfaces, one vocabulary per
domain (orders, products, payouts/earnings, verification), skeletons, scoped errors, contextual empty
states, phone 320–412 at 1.0–1.5× and tablet 600–1280 in tests. Functional debt found and fixed on the
way: 9 device-found defects across B–F (all recorded in their PR records). Validation debt: iOS runtime;
golden tests. Optional polish: seller application (registration) screen spacing; order-number header
wrap at 1.5×; notification pre-prompt.

### E. Tablet readiness matrix (evidence = Android emulators only)

| | Phone | Tablet portrait | Tablet landscape | iOS / iPad runtime |
|---|---|---|---|---|
| Buyer Mobile | VERIFIED (PR 6–11, UX A–D walks on the Pixel 8 Pro) | VERIFIED (PR 12: 14 screens at 800 pt; UX B/D re-runs) | VERIFIED (PR 12 at 1280 pt; UX B/D) | **NOT VERIFIED** (TestFlight uploads only; no simulator/device input in any session) |
| Seller Mobile | VERIFIED (Seller UX A–F full walks) | VERIFIED (PR 13: 3 screens; Seller UX A–F: dashboard, orders, products, earnings, account, verification, forms at 800 pt) | VERIFIED (PR 13: 10 screens; Seller UX A–F at 1280 pt) | **NOT VERIFIED** (same) |

`flutter build ios --no-codesign` succeeds for both apps; both have shipped to TestFlight (buyer 0.1.7+9,
seller 0.1.9+11) and reached their tester groups — that is upload verification, not runtime.

### F. Buyer Web SEO — NOTHING FROM WORKSTREAM B HAS SHIPPED

> Superseded 2026-09-08 by SEO-1 (`buyer-web/seo-1`, open): see the « SEO-1 » record below for what
> changed and what remains. The table here is the pre-SEO-1 state.

The plan's SEO PRs 9 and 10 were never opened (the record numbering diverged: PRs 9–13 became
buyer-mobile/tablet work). Code on `f2b8d49` matches the 2026-09-06 audit item for item, re-verified:

| Item | State |
|---|---|
| Sitemap | Emits home, `/categories`, `/recherche` (noindex — contradictory), 8 CMS pages, 2 active towns, 374 town × category; **0 products** (`limit=500` vs the API's `@Max(100)` → 400 swallowed; no pagination loop; `sitemap.test.ts` mock masks it); `lastmod` = generation time; uncached (3 `no-store` calls per hit); `/promotions` absent. |
| Product URLs / canonical | Strong: `/{ville}/{slug}-{code}`, wrong town/slug → single 308, self-canonical absolute, `og:updated_time`. |
| Category / town × category URLs | Strong URLs; **`<h1>Catégorie</h1>` fallback ships on all 374 pages**; title doubles the brand; cursor-only « Charger plus » (products 13+ uncrawlable, no `rel` links); empty categories indexable and in the sitemap (`productCount` declared, unused). |
| Server-rendered content | **None that ranks**: every listing/PDP surface is `'use client'` with `useEffect` fetches; the PDP fetches the product server-side for metadata/JSON-LD and discards it; the homepage `<h1>` never renders server-side (banner skeleton). Town landing `<h1>` is the one exception. |
| Internal linking | Header categories and footer town links are client-fetched → absent from HTML; PDP « Catégorie » link is the legacy global path (308 to the default town). Product cards link canonically. |
| Metadata / OG | Titles/descriptions/canonicals present everywhere; PDP `og:type` `website`, no `product:price:*`; descriptions carry raw markdown; « Likasi » in 5 metadata strings for a town that 404s; `og-default.png` is 3.7 KB. |
| JSON-LD | Product (truthful `aggregateRating`, inert `shippingDetails`, no `priceValidUntil`), BreadcrumbList on PDP + category, Organization + WebSite on `/` only, **`Organization.logo` 404** (`/icons/icon-512.png` does not exist); escaping XSS-safe (PR 1). No `ItemList`, `Review`, `LocalBusiness`. |
| robots.txt | Private routes disallowed, social scrapers allowed, sitemap referenced; dead `Host:` line; no AI-crawler policy in the repo (Cloudflare-managed, undocumented — decision 6). |
| Search / pagination / duplicates | `/recherche` noindex,follow (in the sitemap anyway); `skipTrailingSlashRedirect: true` site-wide → every page 200 at `/x` and `/x/` (canonical collapses it); no case normalisation (`/Lubumbashi` 404s). |
| Active towns | Inactive towns 404 (only `getActiveCities()` resolves) — correct; Likasi copy is the leftover. |
| Core Web Vitals | `next/font` swap; Clarity `afterInteractive`; **PostHog initialised in a root client provider with autocapture + session recording (not deferred)**; SW registration inline script; content-by-JS architecture is the dominant cost. |
| Image SEO | `next/image` with `priority` on LCP images, alt from titles; no `f_auto,q_auto` on storefront URLs (JSON-LD `image` is the raw original); category tiles `alt=""`. |
| French-language SEO | `lang="fr"`, French copy; « marketplace RDC » intent absent from titles (« supermarché en ligne »); town descriptions templated. |
| Structured-data validity | Syntactically valid, escaped; semantically incomplete (above). |
| Tests | sitemap (masked), urls, json-ld escaping, middleware; **no** metadata/canonical/JSON-LD-content/redirect-table tests. |

**Remaining technical SEO work for eligibility and crawlability (no ranking promised):** SEO-1 (small,
no decision needed except Likasi): paginate the sitemap product fetch at `limit=100` with a failing-fetch
test, real `lastmod`, drop `/recherche`, add `/promotions`, cache the sitemap; category `<h1>` from the
server route; homepage `<h1>` server-rendered; `Organization.logo` to an existing asset + site-wide
Organization/WebSite in the layout; strip markdown in descriptions; `og:type` product + price tags; PDP
category link via `categoryHref`; brand-doubled titles; « Autre » brand suppressed; Likasi strings from
`getActiveCities()` (decision 7). SEO-2 (larger): server-render the first page of every grid and the PDP
core (`initialProducts`/`initialProduct` props into the existing client components); server-rendered
header categories + footer towns; empty town × category `noindex, follow` + sitemap exclusion from a
per-city `productCount` (decision 5, needs the categories API to expose it); crawlable pagination
(`?page=` with `rel` links or `noindex` beyond page 1); trailing-slash 308 scoped around `/ingest`;
BreadcrumbList/LocalBusiness on town pages; ItemList on listings; PostHog via `next/script` deferred;
metadata/JSON-LD/redirect tests.

### G. Security readiness — Phase 0 findings reconciled against `f2b8d49`

| Finding | Status | Evidence |
|---|---|---|
| WhatsApp OTP restricted to BUYER (S3/D1) | FIXED (on develop, **not in prod**) | #672 `745e2d4`; `buyer-otp.service.ts` `isOtpEligible`, verify refusal before any mutation |
| Stored XSS / JSON-LD (S2) | FIXED (not in prod) | #674; `json-ld.tsx` `serializeJsonLd` + tests; only 2 `dangerouslySetInnerHTML` sites, both safe |
| Payments IDOR (S4) | FIXED (not in prod) | #674; actor-scoped `order.findFirst`, 6 e2e cases |
| Upload MIME/magic-byte validation (S8) | FIXED for product/avatar/KYC (not in prod); **PARTIALLY FIXED overall** | #674 `image-upload.ts`; **S13 `POST /v1/sellers/documents` (seller application) still unthrottled, row-less, no owner binding, no orphan sweep** |
| Upload limits (S8) | FIXED (not in prod) | multer `limits` 5 MB/1 file + `@Throttle 20/min` + `@IdentityThrottle('upload')`; `fieldArrayIndexLimit: 0` on all four multipart endpoints + `MulterError` → French 400 (multer 2.3.0 pin, 2026-09-09) |
| Avatar/product media lifecycle (A6/D11) | FIXED (not in prod) | #693; strict `avatarPublicIdFromUrl`, destroy with `invalidate`; product delete destroys; hard-delete purges |
| App-review bypass (S10) | FIXED (not in prod) | #674; placeholders, constant-time compare, production boot error; default `false` — **not a production refusal** (ACCEPTED RISK, env-controlled) |
| Origin/surface binding (S1/D2a) | FIXED (not in prod) | #675; Origin → cookie namespace, role → namespace, 18 e2e; `X-Teka-Surface` telemetry only |
| CORS | PARTIALLY FIXED / ACCEPTED RISK | credentials + storefront origin still allowed (mitigated by D2a); **no `methods` allow-list, no `maxAge`** |
| Cookie isolation | FIXED (D2a) — admin/seller `SameSite=Strict`, per-surface names; `Domain=.teka.cd` remains (D2b NEEDS DECISION) | `auth.controller.ts:332-382` |
| CSRF protection | FIXED by construction (not in prod) | no Origin match ⇒ no cookie read ⇒ 401; no separate CSRF token (ACCEPTED) |
| Auth / OTP / login-lockout / password-reset / refresh throttling (S5/D8) | FIXED (not in prod) | #676 `AUTH_LIMITS` (otp 3/10 min, verify 10/15 min, login 10 → 15 min lock, reset 3/h, register 3/h, refresh 60/15 min), Postgres store, `Retry-After`, 18 e2e |
| Cloudflare real-IP (S6) | FIXED in config (not in prod) | `nginx.prod.conf` 22 `set_real_ip_from` + `real_ip_header CF-Connecting-IP` |
| Cloudflare direct-origin protection | OUTSTANDING (manual infra) | 80/443 published to the world; recommendation only (`docs/deployment.md`) |
| CSP (S9) | FIXED (not in prod) | #677; seller/admin nonce + `strict-dynamic`, buyer `'self' 'unsafe-inline'` (SEO surface, documented); enforced, **no report endpoint** |
| Clickjacking / security headers (S20) | FIXED (not in prod) | XFO DENY + `frame-ancestors 'none'`, Permissions-Policy, COOP/CORP, HSTS nginx-only, headers on static assets, `private, no-store`; 9 API e2e + 3 web suites |
| Dependency auditing (S18) | FIXED (not in prod) | #678 blocking `pnpm audit --prod --audit-level=high`; 71 → 5 advisories; 2 documented exceptions (`effect`, `deepmerge-ts`) — the `sharp` exception was closed 2026-09-09 by the 0.35.4 pin (`security/sharp-0.35.4`) |
| Dependabot | PARTIALLY FIXED | config present (npm, actions, pub ×2, docker; **bundler not covered**); npm version updates work since #688 (`packageManager` pinned — PR #692 produced); **the weekly *security* job for `esbuild` fails** (the remaining pinned exception; manual bump needed — the `sharp` one was resolved by the 0.35.4 pin, 2026-09-09); stale PRs #549/#565/#595 open |
| GitHub Actions permissions/pinning (S17) | FIXED (not in prod) | all 10 workflows `permissions: contents: read`; every `uses:` SHA-pinned; **`deploy.yml` still curls `docker-rollout@v0.9` by tag and expands secrets into the remote shell string** (OUTSTANDING, PR 15) |
| Secret hygiene | FIXED / verified | no credentials in tracked files or history; `.env*` ignored; artifacts are binaries only |
| Admin authorization | FIXED (unchanged, verified) | class-level `@Roles('ADMIN')` on every admin controller; SUPPORT read paths explicit |
| Seller authorization | FIXED (unchanged, verified) | owner-scoped payouts/earnings/products/documents |
| Buyer authorization | FIXED (unchanged, verified) | ownership-scoped orders/addresses/reviews (no `@Roles('BUYER')`, empty results for others — ACCEPTED) |
| SUPPORT/FINANCE login/authorization (S21) | NEEDS DECISION (3) | admin-web admits both; dashboard bounces non-ADMIN; FINANCE has no `@Roles` anywhere |
| Payout destination security (S12) | NEEDS DECISION (9) / OUTSTANDING | `PATCH payout-method` = one update, no re-auth, notice, audit or cooling-off |
| Admin API boundary (D2b) | NEEDS DECISION (2b) | requirements recorded in PR 2 |
| Admin action audit (S11) | PARTIALLY FIXED | audit rows on payouts/commission/verification/users only; product/order/review/settings/broadcast actions and `hardDelete` actor still unaudited; suspend has no self-guard / session revoke |
| DTO bounds + banner links (S14/S22) | OUTSTANDING | seller product list `limit` unbounded; banner `linkUrl` only `@IsString()` (admin-stored `javascript:` link possible) |
| Web containers as root (S16) | OUTSTANDING | only the API Dockerfile has `USER node` |
| Clarity / privacy (S19) | PARTIALLY FIXED | removed from seller-web; buyer masking is a dashboard setting — **not verifiable from the repo** (manual check required) |
| PostHog / privacy | PARTIALLY FIXED | replay off on seller/admin, `maskAllInputs` buyer, phone scrub; emails not scrubbed; search terms sent (decision 10) |
| Sentry / PII | PARTIALLY FIXED | phones-only scrub (E.164 form) on API/web/mobile; no email/JWT scrub; **no `sentry_scrub_test` in either app (MS6)** |
| Deep-link validation | PARTIALLY FIXED | https hosts allow-listed, slugs/UUIDs checked; **MS3 `teka://` skips the host list; MS2 buyer push router interpolates any string** |
| Cloudinary upload security | FIXED | private `authenticated` documents, expiry-enforced downloads, row-first orphan strategy, daily purge cron running |
| Mobile hardening (MS1 `allowBackup`, MS4 `IOSOptions`, MS7 obfuscation) | OUTSTANDING | plan PR 8 never shipped; both manifests unset; secure storage without `IOSOptions`; no R8/obfuscation |

### H. Deferred decisions — current status and release importance

| Decision | Status | Important before large-scale deployment? |
|---|---|---|
| D2b dedicated admin API under `admin.teka.cd/api` | Deferred; requirements recorded (PR 2) | No — D2a closes the escalation; D2b is defence in depth (P2) |
| Admin cookie `Domain` removal | Part of D2b | No (P2, with D2b) |
| Shared `.teka.cd` cookie implications | Mitigated by Origin → namespace + role binding + `SameSite=Strict` | Documented; residual risk accepted until D2b |
| Cloudflare direct-origin protection | Not done (manual firewall / Authenticated Origin Pulls) | **Yes (P1)** — every throttle and WAF layer is bypassable direct-to-origin |
| SUPPORT / FINANCE access (decision 3) | Open; bounce loop, no privilege issue | No (P2) unless those roles are staffed |
| Payout destination re-auth / cooling-off (decision 9) | Open | **Yes (P1)** — session theft = redirected payouts; small API change |
| Search-term analytics privacy (decision 10) | Kept (phones scrubbed) | No (P3: add email scrub) |
| Avatar deterministic cleanup (decision 11) | Done (D11, derive from URL); 4 legacy orphans await a prod reference check | No (P3) |
| Empty town/category SEO (decision 5) | DONE — approved and implemented in SEO-2 (`03035e3`): town-scoped `noindex, follow` + sitemap exclusion | Closed |
| Likasi metadata (decision 7) | DONE — implemented in SEO-2 (`03035e3`): service-area copy, navigation and metadata derive from the active-town API | Closed |
| Cloudflare AI-crawler policy (decision 6) | Open; managed rule outside the repo | No (P3: document it) |

### I. CI/CD and supply chain

12 required-check candidates run on every PR (`Lint & Type Check` — type-check only, `API Tests` unit +
e2e, `Web Tests`, `Web Build` ×3, `Flutter Tests` ×2, `Flutter Analysis` ×2, `Dependency Audit`,
`Release Config` with the migration-manifest gate + TestFlight-group test) + CodeQL default setup.
**Branch protection is not enforced** (free plan on a private repo; `scripts/ruleset-main.json` committed,
not applied; the pre-push hook is the only guard on `main`). All `uses:` SHA-pinned, all workflows
read-only tokens; gaps: `docker-rollout` fetched by tag inside `deploy.yml`, secrets expanded into the
remote shell string, no bundler ecosystem in Dependabot, no post-deploy smoke step, no automated rollback.
Dependabot: version updates healthy (open PRs #689, #692, #695, #696 to review); the weekly npm
*security* job for `esbuild` fails on the documented exception until it is bumped by hand (`sharp`
resolved 2026-09-09 by the 0.35.4 pin);
stale #549/#565/#595 to close.

### J. Cloudinary / media

Product images: upload WebP `q_auto`, thumbnail by URL transform (`f_auto,q_auto`), owner-scoped delete
destroys (destroy runs before the row delete — a DB failure afterwards leaves a dangling row; low),
hard-delete/reset purge in chunks. Avatars: replace-then-destroy with `invalidate`, strict public-id
derivation. Verification documents: private, row-first, `uploadedAt IS NULL` orphan candidates, SUPERSEDED/
REJECTED `purgeAfter` 90 days, **daily 04:00 cron running** (verified: `ScheduleModule` registered, three
crons live). Orphans: read-only `report-avatar-orphans.ts` (4 legacy assets pending a prod check); no
product-image orphan report (cascade covers it). Legacy: seller *application* documents (pre-verification
KYC photo) have no row/sweep (S13). Delivery: seller-web transforms lack `f_auto,q_auto`; mobile relies on
the API thumbnails; buyer-web JSON-LD `image` is the raw original. Dev and prod share one cloud — never a
broad cleanup.

### K. Release classification

**P0 — must fix before large-scale deployment**
1. Ship `develop → main` (release PR, merge commit): the five security PRs, CI gates, Buyer Mobile
   functional fixes, tablet and UX work are all unreleased; production runs `78c6ef9` with S1/S2/S4/S5/
   S6/S7/S8/S9 open. Prerequisites — **the documentation half is now done** (rollback procedure,
   release checklist, smoke matrix, `auth_rate_limits` verified additive/idempotent/on the manifest:
   see « Release-readiness documentation » below): what remains is the manual copy of
   `nginx/nginx.prod.conf` to the VPS during the release window (the deploy does not sync it — without
   it the D8 real-IP block and the D4 header ownership never take effect and browsers get duplicate
   CSP headers), the hand-run smoke matrix (no automated smoke exists), and then the Android store
   builds (buyer at least — its store build predates A1 cart totals).
2. Cloudflare origin firewall / Authenticated Origin Pulls + SSL Full (strict) — manual infra, same day as
   the release (rate limits and WAF are bypassable direct-to-origin until then).

**P1 — should fix before large-scale deployment**
3. ~~SEO-1 + SEO-2 (Workstream B)~~ — **DONE** (SEO-1 `6234f0c`, SEO-2 `03035e3`, unreleased with the
   rest of develop). No longer a blocker. Deferred, non-blocking SEO leftovers (header mega-menu SSR,
   `keywords`, `ItemList`, `/promotions` SSR, 404 double robots meta — B; `og-default.png` design and
   PostHog deferral — E) are recorded in the « SEO-2 » record; no SEO-3 is planned.
4. Payout destination re-auth + notice + cooling-off (S12, decision 9).
5. Seller application document upload: row-first + owner binding + throttle + sweep (S13) — unbounded
   private-asset creation by any authenticated account.
6. Banner `linkUrl`/`linkTarget` validation (S22) and DTO bounds (S14).
7. Branch protection / required checks applied (repository setting; GitHub Pro or public repo).
8. Mobile hardening PR 8: MS1 `allowBackup`, MS2 buyer router UUIDs, MS3 `teka://` host check, MS4
   `IOSOptions`, MS6 scrub breadth + tests, MS7 R8/obfuscation — before the next store releases.
9. Clarity masking confirmed « Strict » in the dashboard (or the tag disabled).
10. Dependabot: bump `esbuild`, close #549/#565/#595, add `bundler` (`sharp` → 0.35.4 done 2026-09-09,
    `security/sharp-0.35.4`).

**P2 — can safely follow after deployment**
11. D2b admin API boundary + host-only admin cookie; SUPPORT/FINANCE model (decision 3).
12. S11 audit rows for the remaining admin actions, suspend self-guard + session revoke.
13. S16 web containers non-root + `no-new-privileges`; `deploy.yml` secrets via `envs:`; pin
    `docker-rollout` by SHA; automated post-deploy smoke; CSP reporting endpoint; CORS `methods`.
14. iOS/iPad runtime validation session (device or simulator input tooling) for both apps.
15. API `pendingCDF` vs HELD/`deliveredAt` backfill or state-based sum.

**P3 — optional polish / technical debt**
16. Golden tests; legacy characteristic prefill (taxonomy audit); `Image.network` thumbnails; seller-web
    `f_auto,q_auto`; notification pre-prompt; seller application screen spacing; order-number header wrap
    at 1.5×; email scrub in analytics/Sentry; AI-crawler policy documentation; avatar legacy orphans;
    `keywords` meta; `og-default.png`.

### Release-readiness by dimension (develop `f2b8d49`)

| Dimension | State |
|---|---|
| Code correctness | Verified by tests and device walks for every PR in the initiative |
| Automated tests | API 766 unit / 214 e2e (PR 4 baseline, grown since), buyer-web 97+, seller-web 36, admin-web 60, buyer-mobile 501, seller-mobile 461; all green on `f2b8d49` |
| Android runtime | Verified per PR on the Pixel 8 Pro + tablet emulators |
| iOS runtime | **Not verified** (uploads only) |
| Web runtime | Verified in PR 1–4 (isolated API + `next start` ×3); buyer-web address flow QA skipped; no SEO runtime re-check since the audit |
| Security | Fixed on develop, **unreleased**; P1 items above |
| SEO | Audit-state; Workstream B unshipped |
| Infrastructure | Rollout + health checks fine; rollback doc wrong; origin unfirewalled; no automated smoke |
| Production configuration | No env change needed since `main`; nginx reload; Clarity masking unverified |
| Observability | Sentry on API/web/mobile (CSP now allows it); Prometheus/Grafana alerting not verified in this checkpoint |
| Data / migration | One additive auto-applied migration pending (`auth_rate_limits`); manifest gate green |
| Rollback | Old image tags exist in GHCR; procedure undocumented/wrong — fix before the release |

**Is `develop` suitable for a `develop → main` release PR now?** Technically yes for the code (CI +
CodeQL green, additive migration, no env change), and the security content makes it urgent — **after**
the rollback procedure is rewritten and the release checklist (migration confirmation, nginx reload,
smoke matrix, Cloudflare firewall) is in hand. Do not open it without the owner's approval.

### Release-readiness documentation (2026-09-08, docs only — no application code)

Produced by the checkpoint's P0 prerequisite. `docs/deployment.md` only; no behaviour, schema, env or
infrastructure was changed, and nothing was applied to production.

**The rollback problem, exactly.** The documented procedure was
`git log` → `git checkout <hash>` → `docker compose build` → `docker compose up -d`. Four reasons it
cannot run on this production host, each verified against the code:
1. `/home/deploy/teka-rdc/` is a **flat directory, not a git checkout** (stated in `deploy.yml`'s own
   comment, which is why the compose file has to be scp'd) — `git log` / `git checkout` have no
   repository to act on.
2. `docker compose build` has nothing to build: `docker-compose.prod.yml` declares **no `build:`
   section** — every service pins `image: ghcr.io/ipanga/teka-rdc/<svc>:latest` — and the host carries
   no source tree.
3. `docker compose up -d` (no service argument) recreates **all five containers at once**, including
   nginx, dropping live connections — the deploy deliberately never does this (it uses
   `docker rollout` per service and only ever *reloads* nginx).
4. Even if 1–3 were solved, `:latest` still resolves to the **bad** image, so the procedure would
   redeploy the very version being rolled back.

**Corrected approach (now in `docs/deployment.md` → Updates and Rollback).** Four independent layers:
*application* (revert on `main`, let CI redeploy — the normal case); *container/image* (every deploy
also pushes an immutable `:<git-sha>` tag, so an emergency rollback pulls that SHA and pins it through
a small `rollback.yml` compose override with
`docker compose --env-file .env.production -f docker-compose.prod.yml -f rollback.yml up -d --no-deps <svc>`
— the same `up -d --no-deps` form the deploy itself uses for a host with no running container; a
zero-downtime variant retags `:latest` locally and reuses the workflow's single-`-f`
`docker rollout` invocation, with the caveat that the next `compose pull` undoes the retag);
*nginx/config* (`nginx.prod.conf` and `.env.production` are operator-managed on the VPS — take a
timestamped `.bak` before editing, restore it, `nginx -t`, `nginx -s reload`, never `up -d nginx`);
*database* (see below). The runtime-only variables that only the deploy job exports
(`SENTRY_RELEASE`, `SENTRY_ENVIRONMENT`, `POSTHOG_API_KEY`, `APP_REVIEW_*`) must be re-exported by hand
during a manual rollback or compose interpolates them empty.

**`auth_rate_limits` migration — verified, nothing applied.**

| Question | Answer |
|---|---|
| Filename | `apps/api/prisma/migrations/manual/2026-09-06_auth_rate_limits.sql` |
| In the production auto-apply manifest? | **Yes** — line 31 (last entry) of `manual/auto-apply.list`; `sh prisma/migrations/check-manifest.sh` passes (« 10 entries, all present, unique, non-destructive, idempotent CREATEs ») |
| Additive? | Yes — one new table `auth_rate_limits` (+ one index). No `ALTER`, no `DROP`, no data mutation; it is the only schema delta between `main` `78c6ef9` and `develop` (Prisma model `AuthRateLimit`) |
| Idempotent? | Yes — `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`; `apply-auto.sh` additionally records it in `_manual_migrations` so it runs once |
| Rollback required? | **No.** The previous release never references the table, so rolling application code back leaves it inert. `DROP TABLE "auth_rate_limits";` exists only as an optional cleanup, and would be a hand-applied *Apply prod migration* run, never an auto-apply entry |
| Old-version compatibility | Yes — an unreferenced extra table. This is exactly the expand-phase contract the manifest requires |

Deploy expectation for the release: **1 applied, 9 skipped** (the other nine were applied in earlier
deploys — the last production deploy reported « 0 applied, 9 skipped »).

**Unexpected finding — `nginx/nginx.prod.conf` is not synced by the deploy.** `deploy.yml` scps
**only** `docker-compose.prod.yml`; the nginx config, `.env.production` and certbot data stay
operator-managed (the workflow says so). That file changed substantially since `main` (+73 / −34: the
Cloudflare `set_real_ip_from` block from D8 and the header-ownership rewrite from D4). If the release
ships without a manual copy of that file: per-IP `limit_req` zones keep keying on Cloudflare edge
addresses (the identity-keyed limits in the API are unaffected), and browsers receive **two** CSP and
two `X-Frame-Options` headers — nginx's old permissive policy alongside each app's new one. Added to
the release checklist as a manual pre-release step with its own verification (`I8` in the smoke
matrix detects the stale-config case).

**Cloudflare origin firewall** is documented as a MANUAL PRODUCTION STEP (allow list, the SSH
lock-out risk — `deploy.yml` connects from a GitHub-hosted runner with no fixed IP —, the HTTP-01
renewal caveat on port 80, how not to lock ourselves out, verification commands, rollback). Nothing
was applied.

**Release checklist and smoke matrix** now live in `docs/deployment.md` (the existing « Production
Checklist » was split into a first-deploy provisioning list and a per-release checklist —
AUTOMATED / MANUAL / POST-DEPLOY — rather than adding a new document). The smoke matrix covers
infrastructure (13 read-only checks incl. the duplicate-CSP detector, the 401 boundary, Sentry,
PostHog, Clarity), buyer (10), seller (8) and admin (5); the only writes it asks for are one COD order
on a disposable buyer and, optionally, that same order's seller transition.

**Also corrected while verifying commands** (same file, both stale rather than merely imprecise): the
first-deploy section told the operator to `docker compose build` on the VPS and to run
`npx prisma migrate deploy` — there is no `build:` section and no Prisma migration history
(`apps/api/prisma/migrations/` has no `migration_lock.toml`); it now pulls the CI-built images and
runs `apply-auto.sh`. The `NEXT_PUBLIC_GOOGLE_CLIENT_ID` build-arg note went with it (Google OAuth was
removed in Apr 2026 and the variable exists nowhere in the code).

### SEO-1 — `buyer-web/seo-1` (Buyer Web SEO, 2026-09-08 — MERGED `6234f0c`, PR #713)

Buyer Web only, plus one additive API field. No change to Seller Web, Admin Web, either mobile app,
business rules, auth, checkout, orders, payments or infrastructure. Every item below was re-audited
on `e45d9fb` before it was touched, then verified on the **served HTML of the production build**
(`next build` + `next start`, dev API on the dev DB: 307 active products, 187 categories, towns
Lubumbashi + Kolwezi) with `curl` and in Chrome (desktop 1280 px and an emulated 390 px phone).

**Finding-by-finding (Workstream B numbering):**

| # | Re-audit | Root cause | Fix | Verified |
|---|---|---|---|---|
| H1 sitemap 0 products | confirmed | `limit=500` vs the API's `@Max(100)` → 400, swallowed to `null`; no pagination; test mock accepted any query | `fetchAllSitemapProducts()` walks the real cursor at `limit=100` (dedupe by id, a page whose cursor does not advance throws, hard cap `MAX_PRODUCT_PAGES=50` → 5 000 products, beyond which it throws naming `generateSitemaps()` as the split), **strict** source failures (`SitemapSourceError` → the route 500s and crawlers keep their last copy — never a silently thinner sitemap), generated at **request time** (`dynamic = 'force-dynamic'`) with the upstream calls cached 3 600 s | dev build: **683 URLs, 296 products, 4 API pages, 0 duplicates**, 42 sampled product URLs all 200; test mock now paginates like the API (limit > 100 → 400); with the API unreachable the route answers **500** (verified) |
| H2 no product/category/town links in HTML | confirmed | every listing page fetched in `useEffect` | server routes fetch what the client fetched after paint and pass it as `initial*` props (below) | category page 12 product + sub-category + breadcrumb hrefs, town page 20 product + 7 category hrefs, footer 2 town hrefs on every page — all in `curl` output |
| H3 PDP has no H1/price/seller in HTML | confirmed | product fetched for metadata then discarded | `initialProduct` into `ProductDetailPage` (state seeded, effect skips the fetch when it matches) | `<h1>`, `250.000 FC`, seller, description in the HTML; 1 product request per render |
| H4 `<h1>Catégories</h1>` on 374 pages | confirmed | client fetch resolved the name | `initialCategory` (name, breadcrumb, children from `getCategoryDetail`) + first product page (same query the client used) | `<h1>Supermarché</h1>`, no skeleton |
| H5 homepage has no `<h1>` | confirmed — **worse than recorded**: with an admin banner the page had no `<h1>` even after hydration (banner titles are `<h2>`) | the `<h1>` lived only in the no-banner fallback; the carousel started in `loading` | `initialBanners` from the server (an empty list renders the hero `<h1>` server-side) + `srTitle` → a visually hidden `<h1>` above the slides | exactly one `<h1>` in the HTML and in the hydrated DOM in both states |
| H6 empty town × category pages | **not reproducible on dev** — see SEO-2 findings | — | no change (decision 5) | 0 of 374 empty on the dev DB |
| H7 `Organization.logo` 404; JSON-LD on `/` only | confirmed | `/icons/icon-512.png` never existed | `lib/site-identity.ts`: `Organization` (`@id`, `logo` = `/logo.svg` — test asserts the file exists — `sameAs`, `areaServed` CD, `contactPoint`) + `WebSite` (`SearchAction` → `/recherche?q=`) rendered from the root layout on every page | `logo.svg` 200 `image/svg+xml`; both blocks on every page inspected |
| M1 markdown in descriptions | confirmed | raw `description` in meta/OG/JSON-LD | `lib/seo-text.ts` `plainText()` + `truncateForMeta()` shared by PDP metadata, JSON-LD and the town CMS description | meta description and JSON-LD `description` plain |
| M2 `og:type: website`, no price tags | confirmed | Next's metadata API rejects `og:type=product` (throws at render) | no `openGraph.type` in metadata; `<ProductOpenGraph/>` emits `og:type=product`, `product:price:amount` (effective price, 2 decimals), `product:price:currency=CDF`, `og:availability`, hoisted into `<head>` by React 19 | **one** `og:type` in the head, in `<head>` after hydration |
| M3 `/x` and `/x/` both 200 | confirmed | `skipTrailingSlashRedirect: true` for the `/ingest` proxy | middleware 308s any trailing-slash path to the slash-less canonical, except `/ingest*` | `/lubumbashi/` → 308 `/lubumbashi`; `/x/categorie/y/` → 308 |
| M4 cursor-only « Charger plus » | confirmed | design | **strategy decided, no `?page=` URLs** (below) | — |
| M6 PDP « Catégorie » link = legacy global path | confirmed (breadcrumb was already city-scoped) | one call site | `categoryHref(product.city?.slug, product.category)` | 0 `/categorie/` legacy hrefs on the PDP |
| M7 `lastmod` = generation time everywhere | confirmed | `new Date()` | `lastModified` only on products, only when `updatedAt` parses (API list items now carry `updatedAt` — additive `select`); omitted on home/static/town/category rather than faked | 296 `<lastmod>` = product `updatedAt`, none elsewhere |
| M8 « Likasi » in metadata | confirmed (4 strings) | hard-coded copy | **documented, not changed** (decision 7) — the new Organization copy is town-free | — |
| M9 titles double the brand | confirmed | page title repeated « sur Teka RDC » under the layout template | `{name} à {ville} — Acheter en ligne` | `<title>Supermarché à Lubumbashi — Acheter en ligne \| Teka RDC</title>` |
| M10 `/recherche` in sitemap, `/promotions` absent | confirmed | list | fixed | `/recherche` absent, `/promotions` present |
| L5 no `sameAs` | confirmed | — | added | — |
| L10 sitemap uncached | confirmed | `no-store` fetches per hit | per-fetch `next.revalidate = 3600` inside a request-time route | second hit served from the data cache (7 ms), no API call |
| L11 no metadata/JSON-LD/redirect tests | confirmed | — | route tests (below) | — |

**Server-rendered content — the smallest change that puts indexable content in the first HTML.**
No page was converted to a server component; the existing client components gained optional
`initial*` props and skip their first fetch when a prop is present (absent prop = the previous
client behaviour, so an API failure at render time degrades to what shipped before, never to a
crash). Per surface: category route → `initialCategory` + `initialProducts`/`initialPagination`
(same `categoryId/cityId/sortBy=newest/limit=12` query, asserted by test) + `initialCities`; town
landing → categories + popular + newest grids for the town + towns; homepage → categories +
banners + towns (product rails stay client-side: they depend on the buyer's selected town, which
is client state; the `/{ville}` pages carry the server-rendered grids); PDP → `initialProduct` +
towns; footer → `initialCities` and a `hydrateCities` store action (no-op once a list is present),
so the header issues no second `/v1/cities` request. The routed components are keyed
(`city:category`, `product.id`, `city.id`) so a client navigation to another category/product/town
remounts with that page's server data; the category guard is a key ref set once, so React
strict-mode double effects cannot discard the server page in development. Facets (attributes,
brands) and the header mega-menu categories remain client-side — filter UI, not indexable content
(the mega-menu is the one navigation surface still absent from the HTML; the footer towns, the
homepage category grid and every page's breadcrumb cover discovery).

**Pagination / cursor strategy (decided, M4).** Keep the cursor « Charger plus »; do **not** add
`?page=N` URLs. Cursor membership is unstable (a new product shifts every later page), so numbered
pages would be duplicate, unstable indexable URLs — the opposite of what a crawler needs. Product
discovery is guaranteed by two stable paths instead: the complete sitemap (every canonical product
URL, real `lastmod`) and the server-rendered first page of every town × category (12 links) plus
the town pages (20). Products beyond the first page are reachable through the sitemap and through
their own canonical URLs; nothing depends on a crawler executing « Charger plus ». Threshold for
`generateSitemaps()` (one sitemap per 5 000 products) is documented in `sitemap.ts` and enforced by
the cap.

**Canonical strategy.** Slash-less canonical everywhere (`/lubumbashi`, `/lubumbashi/categorie/x`,
`/lubumbashi/{slug}-{code}`); `/x/` 308s to `/x` in the middleware (the `/ingest` proxy is the only
exemption); PDP canonical is the product's true town URL (wrong town/slug 308, asserted by test);
legacy `/categorie/x` and `/categories/{uuid}` keep their single-hop 308 to the default town
(re-verified). No case normalisation was added (`/Lubumbashi` still 404s — remaining, low).

**Structured data.** Organization + WebSite once per page from the root layout (removed from the
homepage); Product JSON-LD keeps the D4/S2 escaping (`</script>` in a title asserted to stay
`\u003c/script\u003e`), `description` plain text, `image` = every image (array) or the single URL,
`offers.price` = the effective (discounted) price — the same `effectiveCentimes()` the cart uses —
`aggregateRating` still gated on `totalReviews > 0`; BreadcrumbList unchanged (city-scoped items).
Not added (SEO-2): BreadcrumbList/LocalBusiness on town pages, `ItemList` on listings, `Review`.
« Autre » placeholder brand (M11) still reaches `brand` — remaining.

**Metadata / OG.** PDP: no `openGraph.type` (product tags hoisted, above), plain-text description
≤ 160 chars with the category and seller tail, `keywords` left as-is (L12, remaining). Category:
title fixed. Town CMS description: shared `plainText`. Likasi strings untouched (decision 7).

**Sitemap membership (final):** `/`, `/categories`, `/promotions`; 8 CMS static pages; active towns
(`/v1/cities`); every category × active town (empty ones **still listed** — decision 5); products
with a canonical town URL **and** a `shortCode` (see unexpected findings). `/recherche` (noindex)
out. `lastmod` only on products.

**Tests.** buyer-web Vitest **155** (was 129): `sitemap.test.ts` rewritten (14: multi-page walk with
cursors `p100/p200`, `limit ≤ 100`, cross-page dedupe, empty catalogue, 400 on the products call
rejects, 500 on a later page rejects, cap → throws naming `generateSitemaps`, lastmod semantics per
class, membership, uniqueness, shortCode-less exclusion), `seo-text` (4), `site-identity` (4, incl.
« the logo file exists » and « no town name in identity copy »), `middleware` +4 (trailing slash),
**`initial-html.test.tsx`** (13 — `renderToStaticMarkup` = the server pass: category/PDP/town/home/
footer content and hrefs present with **zero** `apiFetch` calls, plus the no-prop fallback shells),
**`[ville]/[product]/page.test.tsx`** (6 — metadata title/description/canonical/no og type; rendered
document: Product + BreadcrumbList content, one `og:type=product` + price tags, escaping, body
`<h1>`/links/towns, single product request; wrong-town and stale-slug 308; 404),
**`[ville]/categorie/[slug]/page.test.tsx`** (3 — title without brand, canonical, first-page HTML
with 12 product links + sub-category + breadcrumb + towns and the exact upstream query, 404s). API:
`browse.service.spec.ts` +1 (`updatedAt` selected and mapped) → **828 unit, 231 e2e**; workspace
`tsc` clean; buyer-web `next build` clean (2 pre-existing lint warnings in the error boundaries).

**Runtime validation performed (production build, `next start`, dev API).** `curl` view-source of
`/`, `/lubumbashi`, `/lubumbashi/categorie/supermarche`, a PDP, `/sitemap.xml`, the four redirect
cases and the response headers (one CSP, `X-Frame-Options: DENY`, `Cache-Control` private on the
PDP — unchanged). Chrome desktop 1280 px: homepage, town, category, PDP, sitemap — hydrated DOM
re-checked for `<h1>` count, product/category/town hrefs, JSON-LD types, the product OG tags in
`<head>`, zero skeletons on town/category/PDP, **no console errors or hydration warnings on any
page**. Emulated 390 px phone (DevTools viewport emulation — the extension's window resize did not
change the viewport on this machine): PDP, category, homepage — no horizontal overflow, one `<h1>`,
content and links present.

**Performance.** All new server fetches go through `serverFetch` (`next: { revalidate: 60 }`) and run
in `Promise.all`; Next's request memoisation dedupes the PDP's `generateMetadata` + page fetch
(asserted: one product request per render). Per page the server now issues what the client used to
issue after paint — no net increase in API load, and the client's first fetches are skipped when the
server data is present. The sitemap moved from 3 uncached calls per hit to a request-time route whose
upstream fetches are cached 3 600 s (≈ 4 product-page calls + categories + cities per hour). No N+1 (the list endpoints are the same
paginated calls). Not addressed: PostHog still initialises eagerly (M12), `og-default.png` (L1).

**Security.** JSON-LD escaping preserved and re-asserted; CSP unchanged (no new inline scripts — the
OG tags are static `<meta>`); no cookie/surface/auth change; the middleware redirect runs **before**
the auth gating with a plain `new URL(request.url)` (no header-derived host); only public browse
data is server-rendered (product, category, city, banner, categories — nothing user-scoped); no
secrets in HTML; analytics untouched.

**Backward compatibility.** API: one additive field (`updatedAt`) on `/v1/browse/products` list
items. Every `initial*` prop is optional; components without them behave exactly as before. URLs:
no route added or removed; trailing-slash URLs now 308 instead of 200 (canonical already pointed
there). Sitemap consumers get a larger file with `lastmod` on products only.

**SEO-2 findings — empty town × category pages (decision 5, no change made).** Quantified on the
dev DB: **0 of 374** pages empty (187 categories × 2 towns, every leaf answered ≥ 1 product for
each town), because the demo catalogue (`Product.isDemo`, P3c) seeds one product per leaf per town
and `RETIRE_DEMO_CATALOG` defaults to `false`. The 2026-09-06 live sample (`farine`, `pates`,
`cereales` → 0) was taken on production, whose demo coverage could not be checked from here.
Structural facts for the decision: the categories API exposes only a **global** `productCount`, so a
per-town gate needs an API change (`productCount` per `cityId` on `getCategoryDetail`, or a count
in the sitemap walk); the sitemap keeps listing every town × category pair; empty listings render
the empty state with the `<h1>` and sub-category links (`follow`-worthy). Recommended policy
(unchanged): `noindex, follow` + sitemap exclusion when the **town-scoped** count is 0 — and, if
the demo catalogue stays live in production, the policy only ever bites for a town activated
without seeded demo products or an admin-created category. Awaiting the owner's decision.

**SEO-2 findings — Likasi (decision 7, no change made).** Hard-coded public references: `app/page.tsx`
(homepage `description`), `app/layout.tsx` (default `description`), `app/promotions/page.tsx`
(description), `app/[ville]/[product]/page.tsx` (404 fallback description). Production activation
semantics: `GET /v1/cities` returns active towns only — Lubumbashi + Kolwezi — and `/likasi` 404s
(`findCityBySlug` resolves active towns only); the master `City` row is untouched. The new
`site-identity.ts` copy is deliberately town-free (test-asserted). Recommended fix: derive the
« Livraison à … » phrase in those four strings from `getActiveCities()` (already available in each
route) so activating Likasi changes the copy without a deploy of text; not done pending the
product decision.

**CI failure on the first run, and the fix (`Web Build (buyer-web)`).** The first CI run of PR #713
failed: `Error occurred prerendering page "/sitemap.xml" … SitemapSourceError: /v1/browse/categories —
unreachable`. Root cause: with `next.revalidate` set on every fetch, Next classified `/sitemap.xml`
as a build-time prerender (ISR), and the image is built in CI/Docker where no API exists — the new
strict failure did exactly what it was designed to do, at the wrong time. The old code passed the same
build only because it swallowed the error into an **empty** sitemap baked into the image. Fix:
`export const dynamic = 'force-dynamic'` on the route (test-asserted) — generated per request, upstream
calls still cached for an hour (explicit `next.revalidate` is honoured inside a dynamic route).
Reproduced and verified locally with `API_INTERNAL_URL` pointed at a dead port: `next build` now
succeeds (`ƒ /sitemap.xml`), and at request time the sitemap answers 500 while `/` and `/categories`
still answer 200 with their client-fetch fallbacks (`/{ville}`, category and product pages 404 without
the API — the routes cannot resolve the town/product, unchanged from before).

**Deploy-time behaviour worth knowing (not a regression, documented for the release runbook).** `/`
and the `/{ville}` pages are prerendered at build time (ISR 60 s) in an environment without the API,
so the image ships them with the client-fetch shells (no categories/banners, and for `/` no server
`<h1>`). On the first requests after a deploy Next serves that stale HTML (`x-nextjs-cache: STALE`)
while regenerating in the background; the third request in the local run was already the full page
(`HIT`, `<h1>` + 7 category links; town page `HIT` with the product grids). Before SEO-1 those pages
shipped the same shells permanently, so nothing regressed; the post-deploy smoke matrix (B1/B2) hits
both, which warms them. A build-time warm-up or `force-dynamic` for `/` is an SEO-2 option.

**Unexpected findings.**
- **10 dev products have no city** (`30000000-…`, the Phase 3 seed): no canonical town URL, so
  product cards link to the flat `/{tail}` (which the `[ville]` dispatcher resolves) and the sitemap
  excludes them (296 of 307). Dev data; production membership could not be checked from here.
- **One dev product has no `shortCode`** (`84921017-…`, created 2026-04-12 — before the 2026-06-06
  city-first backfill, which the dev DB never received) and its slug ends in a code-shaped suffix;
  the route parsed that suffix as the resolver code and **the sitemap listed a URL that 404'd**.
  Products without a `shortCode` are now excluded (a data repair, not a URL); `products.service`
  always generates one on create and the prod backfill covered older rows.
- The dev homepage banner points at a non-existent Cloudinary demo asset: the server HTML holds
  the carousel (with the hidden `<h1>`), the client swaps to the hero on image error — the designed
  fallback, no hydration mismatch.
- PDP shows a lone « ~ » under the price when `priceUSD` is null (`product-detail-page.tsx:349`,
  pre-existing, not SEO — left).
- Homepage category tiles link to the town-less `/categorie/{slug}` (308 to the default town) in the
  first HTML because the buyer's town is client state — by design; the town pages carry the
  town-scoped links.

**Remaining SEO defects (not in this PR):** header mega-menu categories client-only; banner
carousel navigates with `router.push` (no `<a>`); `og-default.png` blank; `keywords` meta; « Autre »
brand in JSON-LD; no BreadcrumbList/LocalBusiness on town pages, no `ItemList`; PostHog not deferred
(M12); no case-normalisation redirects; CSP has no reporting endpoint; decisions 5 and 7.

**Git.** Branch `buyer-web/seo-1` from `e45d9fb`, 5 commits (`21a4b29` sitemap + API field,
`6b69e4c` identity/JSON-LD/OG/descriptions/PDP initial data, `2485178` trailing slash, `6fd2f24`
server-rendered initial data + tests, `252f0d0` homepage `<h1>` with banners + shortCode guard),
plus the docs commit and `sitemap: force-dynamic` (the CI fix, with its own docs update).

### SEO-2 — `buyer-web/seo-2` (Buyer Web SEO, decisions 5 + 7 approved, 2026-09-08 — MERGED `03035e3`, PR #714, 2026-09-09)

SEO-1 merged as `6234f0c` (PR #713; develop CI 15/15 + CodeQL green). SEO-2 implements the two
policies the owner approved, then classifies and partly fixes the SEO-1 leftovers. Buyer Web plus
one backward-compatible API addition. Nothing merged, nothing deployed.

**Decision 1 — empty town × category pages (implemented).**

*Authoritative eligibility.* A product is publicly eligible for a town when
`BrowseService.publicProductWhere(cityId)` matches it: `status = ACTIVE`, `deletedAt IS NULL`,
`cityId = <town>`, and — when demo retirement (P3c) is on — not a demo product in a retired
category. That is the exact filter the storefront listing (`browseProducts`) starts from, so the
count and the listing cannot disagree. Seller state is not a separate term: suspend/reject flows
move products out of `ACTIVE`, which the filter already honours; DRAFT / PENDING_REVIEW / REJECTED /
INACTIVE / soft-deleted rows and products of another town never count. The count is TOWN-scoped
(the global `productCount` stays what it was and is not used for indexability).

*API (additive, backward compatible).* `GET /v1/browse/categories?cityId=` → every node's
`productCount` becomes the eligible-in-town count, computed with **one** `groupBy(categoryId)` for
the whole tree and rolled up like the global counts; `GET /v1/browse/categories/:identifier?cityId=`
→ `productCount` = eligible products in the town across the subtree (self + children +
grandchildren, the set the page lists). Without `cityId` both answer byte-for-byte as before (no
existing consumer sends it — checked buyer/seller web + mobile). `cityId` is validated by shape
(seeded ids are non-RFC4122), 400 otherwise. Indexes used: `products(status)`, `(cityId)`,
`(categoryId)`, `(deletedAt)` — existing.

*Buyer Web.* The category route fetches the detail with `?cityId=` (memoised across
`generateMetadata` + page) and sets `robots` through `lib/indexability.ts`: count > 0 →
`index, follow`; 0 → `noindex, follow`. The page stays reachable and self-canonical, renders its
`<h1>`, breadcrumb, sub-category links, footer towns and the « Aucun produit trouvé. » empty state;
no redirect, no fake 404. The sitemap fetches one tree per ACTIVE town (`?cityId=`, 2 calls today,
bounded by active towns, never per category) and lists a pair only when its town count is
positive. Both read the same count, so a pair leaves and returns together as inventory changes
(route ISR 60 s; sitemap upstream cache 1 h).

*Before / after.* Before: every town × category pair was indexable and in the sitemap regardless
of inventory. After (dev DB, verified live): a category empty in both towns → `noindex, follow` in
both, absent from the sitemap; a category with one product in Lubumbashi only → Lubumbashi
`index, follow` + listed, Kolwezi `noindex, follow` + not listed; the populated pages unchanged.

**Decision 2 — Likasi (implemented).**

References found and classified: *public service-availability copy / SEO metadata* — root layout
description, homepage title + description, promotions description, product 404 fallback
description (the four from SEO-1), plus two more the Likasi grep could not see because they named
only the active pair: the `/categories` hub description and its visible intro copy, and the header
drawer's hard-coded `/lubumbashi` + `/kolwezi` links. *Master data* — `seed.ts` (`Likasi`,
`isActive: false`, delivery-zone fees), the `cities.service` slug comment: kept. *Examples/tests* —
SEO-1 tests using an inactive Likasi fixture: kept. *Shared constants* — `HAUT_KATANGA_TOWNS` in
`@teka/shared` (address forms, not public copy; no buyer-web consumer): kept. *Structured data* —
`site-identity.ts` already town-free. *CMS content* — the eight content pages checked on the dev
API: no Likasi.

Fix: `lib/service-area.ts` (`deliveryPhrase`, `deliveryTitle`, `joinTownNames`) builds the copy
from `getActiveCities()` — `GET /v1/cities`, active only, the same source that resolves `/{ville}`
— so the six strings now read « Livraison à Lubumbashi et Kolwezi » (title: « Livraison Lubumbashi
& Kolwezi »), the header drawer's towns come from the hydrated town store, and an activation of
Likasi shows up on its own (tested with a mocked active Likasi: « Lubumbashi, Kolwezi et Likasi »).
With no active town known the phrase degrades to « en RD Congo », never to a stale town. Likasi
was not activated and not deleted; `/likasi` still 404s; no Likasi in metadata, navigation,
sitemap, structured data or service-area copy (verified in the served HTML and the browser). Also
corrected while there: the homepage still advertised « Paiement Mobile Money » (retired
2026-05-26, Rule 11) — now « Paiement à la livraison ».

**Remaining SEO-1 findings — classification (A fix now · B valid, low value · C intentional ·
D stale · E product decision).**

| Finding | Class | Outcome |
|---|---|---|
| Banner carousel navigates with `router.push` from a div | A | fixed — slides are real `<a href>` (`lib/banner-href.ts`; site-relative `url` targets internal, absolute external in a new tab) |
| `/categories` hub client-only while in the sitemap at priority 0.9 | A (found during the audit) | fixed — server-rendered tree + towns, same `initial*` pattern |
| Case normalisation (`/Lubumbashi` 404) | A | fixed — middleware 308s any upper-case path to lower-case (query untouched, `/ingest` exempt) |
| « Autre » placeholder emitted as schema.org Brand | A | fixed — `lib/brand.ts`, falls back to the seller Organization |
| Header drawer hard-coded towns | A (decision 2) | fixed — from the active-town store |
| Header mega-menu categories client-only | B | deferred — discovery covered by the homepage grid, the `/categories` hub, town pages and breadcrumbs; SSR-ing the header means threading data through every route |
| `og-default.png` is a 1200×630 single-colour square | E | needs a designed asset (brand decision); documented |
| `keywords` meta (5 files) | B | harmless, ignored by Google; left (removal has zero SEO value) |
| Town-page BreadcrumbList / LocalBusiness | C | not added — a two-item breadcrumb carries nothing, and Teka is not a per-town LocalBusiness (no physical address per town): the semantic requirements are not met |
| `ItemList` on listings | B | not added — product links are already in the HTML; ItemList adds no eligibility without a carousel use-case |
| PostHog initialised eagerly (autocapture + replay) | E | analytics behaviour change — deferred, documented |
| 404 page carries two robots metas (Next's automatic `noindex` + the layout's `index, follow` with `googleBot` preview directives) | B | left — the most restrictive directive wins; the layout block is what sets `max-image-preview: large` |
| `/promotions` in the sitemap but client-rendered | B | left — time-boxed content, low index value; candidate for the same `initial*` pattern later |
| Sitemap product walk cache (1 h) vs new products | C | by design (documented in SEO-1); a new product appears within the hour |
| `/Recherche?q=A%20B` redirect re-serialises the space as `+` | C | equivalent query encoding; search reads it through `URLSearchParams` |

**Tests.** buyer-web Vitest **181** (was 156): category route +5 (town-scoped request, populated,
global-but-not-in-town → noindex + canonical + rendered empty state, one product, 0→2→0
transitions), sitemap +2 (per-town exclusion/inclusion with bounded calls, return after restock),
indexability 2, service-area 4, service-area metadata for the four routes 3 (active only, Likasi
appears when active, degradation), banner-href 2, brand 1, middleware +2 (case), initial-HTML +3
(banner href, hub, header towns), product route +1 (« Autre »). API: **839 unit** (browse spec +10:
definition with retirement on/off, listing shares the base, global vs town counts, roll-up,
zero-town, subtree count, global-but-not-in-town; DTO spec 2), **233 e2e** (+2: `?cityId=` grouped
query + roll-up, invalid cityId 400). Workspace `tsc` clean; buyer-web `next build` clean.

**Runtime validation (production build, `next start`, rebuilt dev API on the dev DB).** To exercise
the empty case the dev DB has no empty pair (demo catalogue), so two temporary product-type
categories were created under « Smartphones » with Prisma (`qa-seo2-vide`: no product;
`qa-seo2-lshi`: one ACTIVE product in Lubumbashi only) and deleted afterwards (cleanup verified:
0 categories, 0 products left, catalogue back to 307). Served HTML (`curl`): populated Lubumbashi
and Kolwezi Smartphones → `index, follow`, self-canonical, product links; `qa-seo2-vide` in both
towns → 200, `noindex, follow`, self-canonical, `<h1>`, sub-category + town links, empty state, no
product link; `qa-seo2-lshi` → Lubumbashi `index, follow` + 1 product link, Kolwezi
`noindex, follow`; sitemap → the Lubumbashi pair listed, the Kolwezi pair and the empty category
absent, no `likasi`; `/Lubumbashi` and `/Kolwezi/Categorie/Smartphones` → 308 lower-case;
`/likasi` → 404 (Next's automatic `noindex`); homepage / hub / promotions / product-404 descriptions
name Lubumbashi et Kolwezi only, no « Mobile Money »; homepage banner slide is
`<a href="/categories">`; one CSP header. **Transition, live:** the `qa-seo2-lshi` Lubumbashi page
served `index, follow`; its only product was deleted (API count → 0); the first request after the
60 s ISR window served `noindex, follow`. Chrome, desktop-width tab and DevTools-emulated 390 px
phone: empty Lubumbashi page, populated and empty Kolwezi pages, populated Lubumbashi page,
homepage, `/categories`, `/likasi` 404, `sitemap.xml` — hydrated DOM re-checked for robots,
canonical, links, empty state, copy; no console errors or hydration warnings; no horizontal
overflow.

**Performance.** Category route: one extra query on the API side only when `cityId` is present (a
subtree lookup + one indexed `count`), replacing nothing; the page fetch count is unchanged (detail
memoised). Sitemap: the single global categories call became one call per active town (2), each a
single grouped query server-side; upstream cache 1 h unchanged. `/categories` hub: one server
fetch replacing the client fetch. No N+1 anywhere; mobile APIs untouched (default responses
identical).

**Security.** Public browse data only; `cityId` shape-validated; no seller/user/private inventory
exposed (counts are of already-public products); JSON-LD escaping and CSP unchanged; auth
boundaries, cookies, uploads untouched; the middleware change only lower-cases the path.

**Backward compatibility.** API: optional query param, default responses unchanged. Buyer Web:
banner targets resolve to the same URLs as before (relative `url` targets now open in the same
tab instead of a new one); upper-case URLs now 308 instead of 404; `/categories` gets SSR props
with the client fallback intact.

**Remaining release blockers (unchanged by SEO-2):** the `develop → main` release itself
(release checklist, manual `nginx.prod.conf` copy, Cloudflare origin firewall the same day, smoke
matrix), then the Android store builds. SEO work is no longer a blocker for the release decision;
the E items above (`og-default.png`, PostHog deferral) are product/analytics decisions.

### sharp 0.35.4 — `security/sharp-0.35.4` (dependency security, 2026-09-09 — **merged `2e0454d`, PR #718**)

**Trigger.** GHSA-rgj7-g3m4-5g8c, published 2026-09-08 21:25 UTC (high): `sharp` < 0.35.4 inherits the
libheif advisories GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545; patched in 0.35.4. The blocking
`pnpm audit --prod --audit-level=high` job went red on `develop` and on the docs PR #715 with no code
change. Teka's product images are user-controlled, so the advisory is in scope and was **not** added to
`ignoreGhsas`.

**Path.** `sharp` 0.34.5 reached the tree only as `next@15.5.25`'s optional dependency — six paths,
`next` and `@sentry/nextjs → next` in each of buyer-web, seller-web and admin-web. The API never resolves
it and no application code imports it; the sole consumer is the Next.js image optimizer (`/_next/image`),
which buyer-web drives from every `next/image` product surface (seller/admin have no `next/image` usage,
only the optimizer route). Uploads never touch Node `sharp`: they are validated in the API
(`common/uploads/image-upload.ts`) and transformed by Cloudinary.

**Fix (root `package.json` + `pnpm-lock.yaml`).** `pnpm.overrides` gains `"sharp@<0.35.4": "^0.35.4"`
in the same style as the PR 5 pins; Next's own optional range is `^0.34.3 || ^0.35.4`, so nothing is
forced outside what Next supports and Next itself was not touched. The PR 5 exception
`GHSA-f88m-g3jw-g9cj` (`sharp` < 0.35.0) is removed from `ignoreGhsas` — two exceptions remain
(`effect`, `deepmerge-ts`). Lockfile delta: `sharp` 0.35.4, the `@img/sharp-*` 0.35.4 and
`@img/sharp-libvips-*` 1.3.3 prebuilds (plus the two new wasm targets 0.35 ships), `semver@7.8.5` and
`@emnapi/runtime@1.11.3` (sharp's own dependencies), and the `(@types/node@20.19.34)` re-key of the
`next` / `@sentry/nextjs` snapshot ids because sharp 0.35 declares an optional `@types/node` peer — the
`next` and `@sentry/nextjs` versions are unchanged. No other package moved.

**Runtime requirement.** `sharp` 0.35.4 needs Node ≥ 20.9.0 (0.34 accepted ^18.17). CI's
`setup-node@20` resolves 20.20.2, every Dockerfile's `node:20-alpine` is the `20.20.2-alpine` digest
(musl prebuilds `@img/sharp-linuxmusl-x64` present), local development runs 22. Satisfied everywhere.

**Verified.** Audit: `sharp` gone from the blocking job and from the informational full-tree run.
`pnpm type-check` ×5; vitest buyer 181 / seller 36 / admin 60; API unit 839. Three production
`next build`s, each started as its standalone server: the optimizer on all three transcodes a real
Cloudinary JPEG (110 KB → 17 KB WebP at 384 px) and buyer-web's local PNG/WebP sources, AVIF-accept
included, with `sharp` 0.35.4 / libvips 8.18.6 / libheif 1.23.2 loaded through Next's own resolution;
unconfigured hosts still 400. Buyer Web SEO on the served HTML unchanged: home, `/lubumbashi`,
`/categories`, `/lubumbashi/categorie/mode`, the PDP (Organization / WebSite / Product / BreadcrumbList
JSON-LD, canonical to the short-code URL), search `noindex, follow`, `/categorie/…` 308, 683-URL sitemap,
robots. Seller and admin: `X-Robots-Tag` + meta `noindex, nofollow` on every response, `robots.txt`
`Disallow: /`, every dashboard route 307 to login. Linux: all four Docker images (`api`, `buyer-web`, `seller-web`, `admin-web`) built locally from the new lockfile on `node:20-alpine` (20.20.2, musl; arm64 host) — inside the running buyer-web image `sharp` 0.35.4 / libvips 8.18.6 loads the `linuxmusl` prebuild, WebP and AVIF round-trip, the container's optimizer returns WebP for the Cloudinary sample and the home page SSRs at 200; the x64 musl prebuild sits in the lockfile at the same version and is exercised by the release PR's Docker checks (`pr-validation.yml` runs only for PRs into `main`).

**Found alongside, not mixed in.** Three `multer` 2.2.0 advisories published minutes after the `sharp`
one (GHSA-wc9g-mqfw-jrwm, GHSA-qfvm-cv95-jqjf, GHSA-535w-7cp7-47q4; all high; patched in 2.3.0) had not
reached the registry's audit feed when PR #715's job ran but do now — they fail the same blocking job and
are reachable on the API's live upload path (`@nestjs/platform-express`). The existing
`"multer@<2.2.0": "^2.2.0"` pin is the natural mechanism; a separate decision — taken the same day
as the sibling PR `security/multer-2.3.0` (#719), recorded below.

### multer 2.3.0 — `security/multer-2.3.0` (dependency security, 2026-09-09 — **merged `bd406cb`, PR #719**)

**Trigger.** Four `multer` advisories published 2026-09-08 21:28–21:30 UTC, minutes after the `sharp` one
(`security/sharp-0.35.4`): **GHSA-wc9g-mqfw-jrwm** (high 7.5 — two crafted text-field names crash the
process with an uncaught `RangeError: Invalid array length`), **GHSA-qfvm-cv95-jqjf** (high 7.5 — file
descriptor leak on aborted uploads, `diskStorage` only), **GHSA-535w-7cp7-47q4** (high 7.5 — an
`items[4294967294]` field name materialises a maximum-length sparse array and the next field on the
same base walks it, pinning the event loop) and **GHSA-qvfw-j98x-7q72** (low 3.7 — `fileSize` bypass
with an async `fileFilter`). All `< 2.3.0`, patched in `2.3.0`. They reached the registry's audit feed
after PR #715's job ran, so the blocking Dependency Audit fails on them from now on. None was added to
`ignoreGhsas`.

**Path.** `multer` 2.2.0 was the API's direct dependency (`apps/api`, `^2.2.0`) and
`@nestjs/platform-express` 11.1.14's (which pins `2.0.2` — the PR 5 override `multer@<2.2.0 → ^2.2.0` is
what already lifted it), five paths in all, none in the web apps. Four multipart endpoints, all
`FileInterceptor` on memory storage with explicit `limits`: product images, avatars, application
documents, verification documents. No `diskStorage`, no `fileFilter` — so GHSA-qfvm and GHSA-qvfw were
never reachable; GHSA-wc9g and GHSA-535w were, unauthenticated, on every one of the four.

**Remediation.** Root `pnpm.overrides` `multer@<2.3.0 → ^2.3.0` (the existing rule, raised). Lockfile
delta: `multer` 2.2.0 → 2.3.0, nothing else. Two boundary adaptations the diff of 2.2.0 → 2.3.0 made
necessary, both in the API boundary only: (1) **`limits.fieldArrayIndexLimit: 0`** on all four
endpoints (`multipartFieldNameLimits` in `common/uploads/image-upload.ts`, spread into
`imageUploadLimits` and the two document interceptors) — the GHSA-535w guard ships **opt-in** and the
advisory asks applications to set it to the smallest index they need. Re-measured on the synchronised
branch against the installed 2.3.0 with Teka's own limits: the `items[4294967294]` request still hangs
past a 45 s timeout **without** the limit, and answers `LIMIT_FIELD_ARRAY_INDEX` 400 in 11.3 ms / 10.9 ms
CPU / 54 MB RSS **with** it; the crash payload is `INVALID_FIELD_NAME` 400 in 10.4 ms either way (that
one the version bump alone closes). No Teka client sends bracketed field names, so 0 is the minimum. (2) **`MulterError` →
French 400** in `HttpExceptionFilter`: 2.3.0's new codes (`INVALID_FIELD_NAME` — the former crash;
`LIMIT_FIELD_ARRAY_INDEX`; `STREAM_DESTROYED`) are unknown to `@nestjs/platform-express`'s
message-matching `transformException`, which passed them through raw — the filter would have answered
« Erreur interne du serveur » 500 and paged Sentry for a client-driven request. Now « Requête multipart
invalide » 400, logged at warn, no Sentry, no parser detail echoed; `LIMIT_FILE_SIZE` keeps its French
413. Two other 2.3.0 changes were checked and need nothing: files of exactly `fileSize` bytes now pass
multer (busboy gets `fileSize + 1`) — Teka's own ≤ 5 MB checks still decide, one byte more is buffered
at most; and `%0A` / `%0D` / `%22` are decoded in `originalname` — `sanitizeFilename` reduces the
stored name to `[A-Za-z0-9._-]` (unit test added). Nest 11 / Express 5 / `@types/multer` 2.0.0 unchanged.

**Evidence.** New e2e `test/multipart-boundary.e2e-spec.ts` (14 tests through the real multer/busboy
chain on all four endpoints): the crash pair and the array-index pair are French 400s in milliseconds
with the server answering afterwards; 5 MB + 1 → French 413 on all four; exactly 5 MB reaches
`validateImageUpload` (400 from the bytes, not 413); SVG-as-PNG and PNG-as-JPEG refused from the bytes;
empty file, JSON body, missing boundary, truncated body, second file, wrong file field, five text fields,
200-byte field name → all 4xx, never 5xx, no stack/parser detail in the body; 401 on all four without a
session; 403 for a buyer on product images and verification documents; a seller cannot name another
seller's product (404, nothing uploaded). API unit 841 / e2e 247 (multipart 14 new), type-check ×5, vitest
181 / 36 / 60, flutter seller 461 / buyer 501 (the multipart-retry and auth-interceptor suites included).
**Runtime probe** on an isolated API (:5051, this build, dev DB, disposable buyer + approved seller +
draft product): valid JPEG avatar → 201, served asset a WebP with the EXIF marker gone; valid PNG product
image → 201 with a `teka-rdc/products/…` id; valid PDF verification document → 201, profile
PENDING_REVIEW, row `application/pdf` 193 B with the sanitised original name; application JPEG → 201
private id; 5 MB + 1 → 413 French on image and document; PNG-as-JPEG / SVG-as-PDF → French 400; truncated
and boundary-less bodies → 400; both advisory payloads → « Requête multipart invalide » in < 400 ms,
`/health/live` 200 after; no session 401, buyer on seller routes 403, two files 400; an expired token →
401 with **no** asset, the fresh-token retry → 201 with exactly one new row (image count 1 → 1 → 2) — the
HTTP-level shape of the mobile 401-refresh-retry. Cleanup verified: the five Cloudinary assets destroyed
(then `api.resource` 404 for each), all rows deleted (2 audit, 1 document, 2 images, product, profile,
2 users), 0 remaining, 0 rows carrying the QA tag. Resource behaviour unchanged by construction: the
oversized body is still refused while streaming (busboy's limit), memory storage buffers at most
`fileSize + 1` bytes per file, and the field-name guards fire per field before `append-field` allocates.

**Pre-existing, not changed here (recorded):** Nest's own multer messages for the limits it does map are
English 400s (« Too many files », « Multipart: Boundary not found », « Unexpected field ») and the
401 / 403 bodies are Nest's defaults — the same on 2.2.0; a French pass over those is a separate,
non-security item.

### Release-readiness audit (2026-09-09, `develop` `65aee0f` — read-only, no application change)

**Baseline.** #715 merged `65aee0f` after #718 (`2e0454d`, sharp 0.35.4) and #719 (`bd406cb`, multer 2.3.0).
`develop` `65aee0f` == `origin/develop`; CI 12/12 + CodeQL green; blocking Dependency Audit green (2 documented
exceptions left: `effect`, `deepmerge-ts` — both only inside `@prisma/config`, CLI-time; low `joi` ×2; dev-only
Vitest moderate + `esbuild` low). `main` `78c6ef9` (2026-09-06); **133 commits / 36 merges / 410 files
(+34 861 / −9 615)** ahead: buyer-mobile 126 files, seller-mobile 119, api 70, buyer-web 49, .github 11,
seller-web 10, admin-web 8, docs 10, nginx 1, packages/shared 1 (`phone.ts`), root package.json + lockfile.
**Migrations pending: one** — `2026-09-06_auth_rate_limits.sql` (new empty table + index, `IF NOT EXISTS`,
on `auto-apply.list`, no data touched, old code never reads it; rollback not required). **Env: no new
API variable** (`env.validation.ts` diff empty); build-arg/secret `NEXT_PUBLIC_CLARITY_PROJECT_ID_SELLER_WEB`
became unused (Clarity removed from seller-web); mobile flavors unchanged. **Nginx: `nginx/nginx.prod.conf`
+73/−34 pending and NOT deployed by `deploy.yml`** (only `docker-compose.prod.yml` is scp'd): the D8
Cloudflare `set_real_ip_from` + `CF-Connecting-IP` block and the D4 header ownership (nginx keeps HSTS only,
apps own CSP/XFO/XCTO/Referrer/Permissions/COOP/CORP). Live production today: old nginx (HSTS `preload`,
nginx-owned CSP, `x-powered-by` still present) and the API already emits duplicate HSTS/Referrer/XCTO —
shipping the new images without the nginx copy makes the web duplicates appear too.

**Cloudflare (probed).** All four hosts resolve to Cloudflare (nameservers, A/AAAA, `server: cloudflare`,
`cf-ray`). `docker-compose.prod.yml` publishes 80 and 443 to the world; the origin address lives only in
the `DEPLOY_HOST` secret, so direct-to-origin reachability could not be probed from this session and must
be assumed reachable (as `docs/deployment.md § Cloudflare origin firewall` records). No Authenticated Origin
Pulls (`ssl_verify_client` absent). SSL mode and the orange-cloud state are dashboard facts to confirm by
hand. What depends on Cloudflare being upstream: WAF/DDoS, and nginx's three per-IP `limit_req` zones
(`api_limit` 30 r/s, `auth_limit` 5 r/s, `webhook_limit`) which, with the new conf, key on
`CF-Connecting-IP` only when the connecting address is a Cloudflare range — a direct connection cannot spoof
it (bypass problem, not spoofing). The D8 identity-keyed limits in the API are unaffected by the path.

**Admin / financial security (code-verified).**
- **S12 — BLOCKER → RESOLVED by PR #722 (`295e801`, `security/payout-destination-reauth`, merged
  2026-09-09); the finding as audited was:** `POST /v1/sellers/payouts` accepts an inline `payoutMethod`/`payoutPhone` that wins
  over the saved profile (`payouts.service.ts` `dto.payoutMethod ?? sellerProfile.payoutMethod`), and
  `PATCH /v1/sellers/payout-method` is one update with no password, no notice, no audit row, no cooling-off;
  no `@Throttle`/`@IdentityThrottle` anywhere in `payouts/`. One stolen seller session → the whole
  available balance requested to an attacker's mobile-money number, invisible to the seller and to the
  admin (nothing marks a destination change). Fix (~150 lines, own PR): password re-auth on
  `updatePayoutMethod` (reuse `account-deletion.service.ts` `reauthenticate`), `payoutMethodChangedAt`
  (additive migration) + 24 h cooling-off on request, drop the inline destination from
  `RequestPayoutDto`, audit row + push/email notice, throttle both routes, seller-web/mobile password field.
- **S13 — RECOMMENDED.** `POST /v1/sellers/documents` (BUYER+SELLER) has no throttle, no row, no owner
  binding, no sweep: any OTP-registered account can create unbounded private Cloudinary assets (~500 MB/min
  per IP under the global backstop). Cost/availability, not data. Immediate: `@Throttle 10/min` +
  `@IdentityThrottle('upload')`; then route through `SellerDocumentStorageService` with an
  `APPLICATION` type and the daily sweep.
- **S22 — RECOMMENDED.** Banner `linkTarget` is `@IsString()` only; buyer-web `banner-href.ts` emits a
  `url`-type target verbatim (`javascript:` → stored XSS under the storefront's `'unsafe-inline'` CSP;
  `//evil` → open redirect). Precondition: an admin account. Fix ~30 lines (DTO validator per `linkType` +
  protocol/host guard in `banner-href.ts` + tests); bundle S14.
- **Login-email change (users `PATCH /profile`) — RECOMMENDED**, same PR as S12: no re-auth, no notice to the
  old address, nothing sent for "re-verification", and a duplicate email answers a 500 (no `P2002` handling).
  It is the escalation path from a hijacked session to a permanent takeover + payout redirect.
- S14 DTO bounds — SAFE TO DEFER (self-scoped heavy query, 100 KB junk strings; bundle with S22).
- S11 audit rows / self-suspend guard / refresh refusing SUSPENDED — SAFE TO DEFER, except the two
  one-liners (self-guard, `SUSPENDED` on refresh) which fit any pre-release PR.
- S21 SUPPORT/FINANCE — NEEDS OWNER DECISION (no exposure: FINANCE has no grant, SUPPORT is read-only via API,
  admin-web bounces both; nothing creates these roles).
- **D2b — SAFE TO DEFER, explicitly not mandatory:** D2a (Origin → cookie namespace, stored role → namespace,
  `SameSite=Strict`, HttpOnly, 18 e2e cases) closes every cross-surface path; the residual is cookie
  planting across `.teka.cd`, which needs an existing admin credential and gains nothing. Cheap interim:
  CORS `methods` + `maxAge`.
- Privileged-operation inventory: every money-moving path (payout transitions, commission, earning reversal
  on cancel/return) is audited or actor-stamped; unattributed: product hard-delete (actor not passed), user
  status change (reason discarded), reviews, settings, broadcasts, banners/content/promotions. No admin
  step-up re-auth exists anywhere (only account deletion and password change).

**Functional findings (code-verified, none block the COD chain).** RECOMMENDED: buyer-web never renders the
USD price — `priceUSD` arrives as a cents *string* (BigInt serialisation) while `formatUSD(number)` expects a
number → empty, plus a stray « ~ » on PDPs with a USD price; a naive `Number()` fix would show cents as
dollars (100×) — fix with /100 + a `format.ts` test (buyer-mobile is correct). SAFE TO DEFER: `pendingCDF`
excludes a HELD earning whose DELIVERED order lacks `deliveredAt` (and such a row can never become AVAILABLE) —
no live path creates one, prod counted 0 on 2026-09-03 → **re-count in the release checklist**; seller-web
stale-town notice; legacy characteristic prefill; seller-mobile `Image.network` (full-size cover on the list
— one-line `thumbnailUrl` win); order-number wrap at 1.5×; registration-screen spacing; avatar orphans; cart
total not refetched on tab focus; no avatar-removal endpoint; ~15 s offline failure on cold start. ALREADY
RESOLVED: notification prompt (by decision), success-screen raw status, guest 401s, address phone
normalisation, order-detail spinner. NEEDS OWNER DECISION: seller order detail shows name + town only
(seller-mobile) while seller-web still shows the full buyer address — confirm the PII policy, then align.

**Buyer Mobile.** 501 tests, 6 info-level analyzer hits (documented). Every area verified on the Android
phone AVD per PR (auth/OTP with the mock provider, offline cold start, session isolation, cart + A1 promo
totals, COD checkout idempotency, single address, orders, reviews, avatar, real FCM, App Links from
`teka.cd`, search, categories, PDP, wishlist), tablet 1280×800 both orientations, 1.3×/1.5×. Deep-link
parser is a superset of `urls.ts` (no drift; a bare `/{ville}` link opens the browser by design).
**iOS/iPad runtime: NOT VERIFIED** (only `flutter build ios` + TestFlight uploads 0.1.6/0.1.7; no tester
feedback recorded). Gaps: real Gupshup OTP on a store build, App Links on a Play-signed install (Play App
Signing fingerprint still an operator step), Sentry/PostHog receipt from a production build, no
TalkBack/VoiceOver pass, no golden tests, MS1–MS7 unshipped.

**Seller Mobile.** 461 tests, analyzer clean. Auth, dashboard, Action Center, orders (the four seller
transitions match `ORDER_STATUS_TRANSITIONS` exactly; conflicts reload; refusal restores stock; READY hands
off to Teka), products lifecycle incl. hard-delete asset purge, multipart 401-refresh retry (byte-identical
`core/network` across apps), taxonomy/attributes, verification incl. rejection → resubmission with real FCM,
profile, commune, earnings, payouts (409 verbatim), tablet, 1.3×/1.5× — all DEVICE on the Pixel 8 Pro AVD.
**Nothing blocks a seller from fulfilling a COD order.** iOS/iPad NOT VERIFIED; same MS gaps; no seller App
Links (deferred by design).

**Store-build delta (provable).** No tags, no GitHub releases; identity lives in workflow runs + PROGRESS.
Buyer: latest TestFlight `f113778` (0.1.7, 2026-09-04, build 1788505790), latest AAB artifact `3564c16`
(0.1.6+8) — **26 commits / 134 files of buyer-mobile since**, i.e. every functional fix (A1 cart totals,
offline logout, iOS foreground notifications, slug deep links, avatar retry…), tablet and UX A–D are in
**no** distributed build. Seller: latest `78c6ef9` (0.1.9+11, TestFlight 1788689147 + AAB artifact) —
**14 commits / 119 files since**: UX A–F incl. the conflict-reload, form-validation, earnings-refresh and
header-refresh fixes and the splash fix are undistributed. pubspec versions unchanged since `main`
(buyer `0.1.7+9`, seller `0.1.9+11`): iOS build numbers are CI epoch stamps (strictly increasing), but
Android `versionCode` must exceed whatever Play holds — **which the repository cannot prove** (the AAB
workflow only stores an artifact; PROGRESS records the Play upload as manual/pending for 0.1.8/0.1.9 and
nothing for 0.1.5/0.1.6). Safe next values: buyer `0.1.8+10`, seller `0.1.10+12`; confirm in Play Console.

**Buyer Web SEO (production build of `65aee0f`'s web sources, served HTML).** Home, `/lubumbashi`,
`/kolwezi`, `/categories`, 374 town × category pages, 296 product pages (`/{ville}/{code}`, self-canonical,
Product JSON-LD; the root `/{code}` form 308s to it), static pages; Organization/WebSite/BreadcrumbList;
683-URL sitemap with `lastmod` on products and no Likasi; `/likasi` 404; search `noindex, follow`;
`/panier`, `/connexion` `noindex`; `/commandes`, `/favoris` 307 to login; unknown paths 404 with no stack;
robots.txt disallows `/profil/ /panier/ /paiement/ /favoris/ /commandes/` with the social-crawler empty
`Disallow:` pattern; seller/admin `X-Robots-Tag` + meta `noindex` on every response. Two dev-only
artefacts, not defects: `/a-propos` 404s on the dev DB (prod 200 — the `about` content row exists there);
a legacy dev product without `shortCode` declares a canonical that 404s (prod sample: 0 such rows; the
sitemap excludes them). Known deferred: 404 page carries both `index, follow` and `noindex` metas (Google
takes the restrictive one); header mega-menu SSR, `keywords`, `ItemList`, `/promotions` SSR, `og-default.png`.
**Technical SEO is release-ready; rankings depend on off-page work after launch (real catalogue depth,
backlinks, Search Console submission of the sitemap, Business Profile) — no claim is made about them.**

**Web / API security regression (production builds + isolated API `:5051`).** CSP (buyer `'self'
'unsafe-inline'` documented; seller/admin nonce), `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy,
Permissions-Policy, COOP/CORP, `private, no-store` on logins, no `X-Powered-By`, no source maps in
`.next/static`. API: helmet headers, CORS echoes only allow-listed origins (evil origin gets no
`Access-Control-Allow-Origin`; `methods` list still absent — P2), 401 boundary, error envelope with no stack,
bad password → French 401, per-IP throttle 100/min → French 429 with `Retry-After: 60`, multer boundary
(14 e2e + runtime probe, #719). Sentry: **API and web SSR rely on Sentry's server-side scrubber for request
bodies/cookies/headers** — `@sentry/core` `requestDataIntegration` defaults include cookies/headers/data and
`httpServerIntegration` captures bodies ≤ 'medium'; so a 5xx on `otp/verify` or `login/email` can ship
the OTP code / password / session cookies unless the Sentry project scrubs them (pre-existing; ~10-line fix:
`requestDataIntegration({ include: { cookies:false, headers:false, data:false } })` in `instrument.ts` and a
`beforeSend` dropping `cookie`/`authorization` in the three `sentry.server.config.ts`). Mobile scrub covers
message + breadcrumbs only (no live leak; MS6). Logs: `buyer-otp.service.ts:319` logs a raw phone on
delivery failure; `whatsapp.module.ts` *warns* instead of refusing a mock provider in prod (Rule 14 says
refuses) — both pre-existing, cheap. PostHog: no event carries PII; buyer-web replay masks inputs only
(rendered text on `/profil` `/commandes` `/paiement` is recordable — policy decision). Clarity: buyer-web
only, gated on env; masking is a dashboard setting (verify « Strict »); seller-web tag removed.

**CI/CD.** 12 CI jobs + CodeQL (default setup) on PRs and pushes to develop/main; `pr-validation.yml`
(type-check + 4 Docker builds) only on PRs into `main`; deploy = build/push `:latest` + `:<sha>` → scp
compose → EXPAND migrations from the new image (`set -eu`, aborts before any swap) → `docker rollout` per
service with compose health gates → `nginx -t` + reload (reloads on every deploy, comment says "if changed").
Manifest guard (`check-manifest.sh`) in `Release Config`: 10 entries OK. **Branch protection (read):**
ruleset « Protect main » enforces merge-commit-only, no deletion/force-push, **but no required status checks**;
`develop` has no rules. Recommended: require the 13 CI/CodeQL check names on both, plus the four
`docker-build-check` legs on `main`; disable squash/rebase repo-wide.

**Data safety.** Only intentional mutation: the new empty `auth_rate_limits` table (+ its hourly sweep of its
own rows). Crons unchanged: KYC retention purge (destroys expired private assets by design), account-deletion
anonymisation (orders/financials retained). `RETIRE_DEMO_CATALOG` is a dormant setting. **`run-prod-seed`
is far heavier than "foundational"**: it deactivates/re-slugs every category, remaps real products by
category name, soft-deletes demo products, and upserts cities *including `isActive`/`slug`* — keep it off
the release path (its `RUN` gate is the only guard). Nothing in the release deletes products, users,
orders, payouts, reviews or product/avatar assets, or alters order snapshots, town assignments or balances.

**Classification.**
- **A. MUST FIX BEFORE RELEASE: none outstanding.** The single entry, S12 payout destination, was
  **fixed and merged as `295e801` (PR #722)** — see « S12 » below: the saved destination is now the only
  routing authority (an inline one is accepted only when identical, 409 otherwise), a real change needs
  the current password (400 missing / 403 wrong, counted in the login lock), stamps a 24 h cooling-off
  (payout requests 409 with the reopen date), writes a masked `PAYOUT_METHOD_CHANGED` audit row in the
  same transaction under the same row lock as the request, notifies the seller on feed + push + email,
  and is throttled 5/h per seller. Payout snapshots stay immutable; the distributed seller-mobile
  0.1.9 build keeps working, so no store release is forced.
- **B. MANUAL RELEASE-WINDOW ACTIONS — ALL DONE 2026-09-09** (release `9a89249`, deploy run
  34380668330; nginx installed + reloaded and the Cloudflare/Hetzner origin firewall applied, both
  independently re-verified — see « Production hardening close-out (2026-09-09) » below). As planned:
  copy `nginx/nginx.prod.conf` → VPS (`.bak`, `nginx -t`, reload;
  rollback = restore `.bak` + reload); Cloudflare origin firewall the same day (allow 443 [+80 per the
  HTTP-01 caveat] from Cloudflare ranges only, keep 22 reachable for the deploy runner, out-of-band console
  open, verify direct-IP fails and `teka.cd` still 200s; confirm SSL Full (strict) + orange cloud); pre-merge:
  diff review, migration prediction (1 applied / 9 skipped), rollback SHA + GHCR tag present, DB backup age
  known, the prod `DELIVERED AND deliveredAt IS NULL` count; post-deploy: health ×3, containers, one CSP per
  host, Sentry release, the 36-check smoke matrix, release record.
- **C. RECOMMENDED AFTER RELEASE / BEFORE LARGE-SCALE ROLLOUT:** login-email re-auth (bundle with S12 if the
  PR is opened anyway), S13 throttle + row-first, S22 banner link validation (+S14), Sentry request-data
  opt-out ×4, buyer-web USD price fix, MS1–MS7 before the next store builds, branch-protection required
  checks, S11 one-liners, Clarity « Strict » confirmation, CORS `methods`, the raw-phone log line and the
  mock-provider prod refusal, iOS/iPad runtime session, Play App Signing fingerprint in `assetlinks.json`.
- **D. SAFE TO DEFER:** D2b, S11 full audit coverage, admin step-up re-auth, S14 alone, the functional
  cosmetics above, golden tests, PostHog replay text masking (policy), `esbuild`/Dependabot chores, doc
  drifts (`docs/sentry.md` client file name, deploy nginx-reload comment).
- **NEEDS OWNER DECISION:** S21 role model; seller-visible buyer PII policy (web vs mobile parity);
  PostHog replay masking on buyer account pages; whether the S12 PR precedes the release PR (recommended) or
  the release ships with an interim admin control (compare each payout's destination with the profile and
  phone the seller before marking paid) until it lands.

**Verdict at the time of the audit: READY AFTER SPECIFIC BLOCKERS** — one code blocker (S12), then the
manual release-window actions. **Superseded 2026-09-09 (twice): S12 merged as `295e801` (PR #722), the release shipped as `9a89249`,
and BOTH manual release-window actions (nginx copy + reload, Cloudflare/Hetzner origin firewall) were
applied and independently re-verified the same day. No production blocker remains — see « Production
hardening close-out (2026-09-09) » below.** The original recommended sequence follows, for the record.
Recommended sequence: (1) `security/admin-and-financial` PR — S12 (+ login-email re-auth, S13 throttle, S22,
S14, the two S11 one-liners, Sentry request-data opt-out; small, all in the same threat model) → full CI →
approval → merge; (2) re-run this audit's automated gates on the new `develop`; (3) `develop → main` release
PR (merge commit) with the checklist in `docs/deployment.md`; (4) release window: nginx copy + reload
(before or right after the deploy; either order is safe because `set_real_ip_from` only narrows trust),
Cloudflare firewall the same day; (5) deploy runs the one migration in EXPAND; (6) post-deploy smoke matrix;
(7) bump pubspec versions, `release-mobile-aab`/`ipa` for both apps, manual Play internal-testing uploads
(confirm the Play `versionCode` first), TestFlight distribution; (8) 24–48 h Sentry/PostHog/error-rate watch,
then the P1 follow-ups (MS1–MS7, branch protection, D2b).

### S12 — `security/payout-destination-reauth` (payout destination, 2026-09-09 — **merged `295e801`, PR #722**)

**Root cause.** Two independent holes let a stolen seller session move money. (1) `POST
/v1/sellers/payouts` took an OPTIONAL inline destination that **won over the saved profile**
(`payouts.service.ts`: `dto.payoutMethod ?? sellerProfile.payoutMethod`) and snapshotted it on the
payout — so a single request could route the whole balance to any number the caller typed. (2)
`PATCH /v1/sellers/payout-method` was one `sellerProfile.update` with **no re-authentication, no
audit row, no notice, no cooling-off and no throttle** — only a `logger.log`. Threat model: an
attacker holding a seller cookie (shared device, phishing, XSS) cashes out silently; the seller
learns nothing and the admin who pays out has no signal the destination ever changed.

**New rule — the saved destination is the only routing authority.** `POST /v1/sellers/payouts`
accepts `{}` and snapshots `SellerProfile.payoutMethod`/`payoutPhone`. An inline destination is
tolerated **only when identical** to the saved one (backward compatibility, see below); any mismatch
is a French 409 « La destination indiquée ne correspond pas à celle enregistrée sur votre profil… ».
No saved destination → 400 asking the seller to save one first.

**Re-authentication.** A *real* change to `PATCH /v1/sellers/payout-method` requires the seller's
current `password` in the body, verified with `verifyPassword` against `User.passwordHash` (the same
primitive as login and account deletion). Missing → 400 « Le mot de passe est requis pour modifier la
destination de retrait. »; wrong → **403** « Mot de passe invalide. » — 403 deliberately, **not** 401,
because every Teka client treats a 401 as an expired session and would refresh + replay, doubling the
attempt and rotating the refresh token for nothing. A wrong password also counts in the shared
`login` bucket (by email), so brute force through this route hits the same 10-failure / 15-minute
lock as the login form. The password is never logged, never persisted, never returned, and never
reaches analytics or Sentry (asserted in unit + e2e).

**Cooling-off — 24 h** (`PAYOUT_METHOD_COOLING_OFF_MS`). A successful change stamps
`SellerProfile.payoutMethodChangedAt`; for 24 h afterwards `POST /v1/sellers/payouts` answers 409
naming the reopen time in French/Lubumbashi time. `GET /v1/sellers/payout-method` now returns
`{ payoutMethod, payoutPhone, changedAt, payoutsAvailableAt }` so both clients can disable the button
with the date instead of provoking the 409. 24 h was chosen as the smallest window that still spans a
night: the seller is told on three channels at the moment of the change, and the attacker cannot cash
out before the seller can react.

**Snapshot semantics (unchanged history).** `Payout.payoutMethod`/`payoutPhone` stay exactly as
written at request time for every status — REQUESTED, APPROVED, PROCESSING, COMPLETED, REJECTED. A
later profile change never rewrites them, and admin approve/process/complete/reject are untouched
(they never accepted a destination; admin-web already labels the value « Destination (figée à la
demande) » and has no control that could substitute one). Regression-tested in the runtime probe: an
in-flight REQUESTED payout kept `AIRTEL_MONEY/+243990000002` after the profile was changed back to
`M_PESA/+243970000001`.

**Concurrency.** The change runs inside `$transaction` with the **same** `SELECT … FOR UPDATE` row
lock `requestPayout` takes, and re-reads the row under the lock: a request racing a change sees
either the old destination or the new one plus its cooling-off, never a mix, and two concurrent
changes serialise (the second sees the first's row and no-ops if identical). The audit row is written
in the same transaction — a rolled-back change leaves no audit, a committed one can never lack it.
The notice is fired after commit, fire-and-forget: a failed push/email never rolls back the security
change.

**Audit + notice.** `admin_audit_logs` gains `PAYOUT_METHOD_CHANGED` (`entityType: 'seller_profile'`,
**actorId = the seller's own user id**, before/after with the phone **masked** `+243•••••01` via
`maskPayoutPhone`; no raw number, no password). The seller is notified on **every** channel, not
push-or-email: a `UserNotification` feed row (`PAYOUT` / `payout_method`), a push, and the new
« Destination de retrait modifiée » Resend email naming the masked destination, the change time, the
reopen time and « contactez le support » if they did not make the change.

**Rate limiting.** New identity-keyed scope `payoutMethodChange` = **5 / hour per seller user id**
(`AUTH_LIMITS`, DB-backed `auth_rate_limits`, French 429 + `Retry-After`), counting every attempt
including wrong passwords, plus a `@Throttle` 10/min per IP. Conservative on purpose: a legitimate
seller correcting a typo has room, a support case is unaffected, and scripted enumeration is not.

**Schema.** One additive nullable column `SellerProfile.payoutMethodChangedAt`, migration
`prisma/migrations/manual/2026-09-09_payout_method_changed_at.sql` (`ADD COLUMN IF NOT EXISTS`, on
`auto-apply.list`, manifest gate green at 11 entries). **NULL for every existing seller on purpose** —
a destination saved before this release is treated as settled, so nobody is retro-blocked and no
historical change timestamp is fabricated. Old code never reads the column, so it is a clean EXPAND
step.

**Backward compatibility with the DISTRIBUTED seller-mobile 0.1.9+11 (checked, mandatory gate).** That
build PATCHes the *prefilled* (therefore unchanged) destination before every payout request and then
POSTs it inline. Both keep working: an unchanged destination is a **password-free no-op** (nothing
written, no audit, no notice, no cooling-off armed) and an inline destination equal to the saved one is
accepted. The only degraded path is a seller who *edits* the destination in the old app: the API
answers 400 with the French « Le mot de passe est requis… », which that build surfaces verbatim from
`error.message` — a clear instruction, not a crash or a silent failure. **No forced mobile release is
required before this API ships**, and the new build (this PR) adds the password field.

**Clients.** *seller-web* `/dashboard/earnings`: the request modal now shows the saved destination
read-only with a « Modifier » action; the editor carries operator + number + a
`type="password" autoComplete="current-password"` field marked `data-ph-no-capture`, the French
security explanation, and only sends `password` when the destination actually changed; the request
button is disabled with the cooling-off line and the request body is `{}`. Pure logic extracted to
`lib/payout-destination.ts` (+14 tests). *seller-mobile* `request_payout_screen`: same shape —
read-only destination, « Modifier la destination », obscured password field with a visibility toggle
and `AutofillHints.password`, cooling-off as a fourth blocker, empty POST body, password cleared on
save/cancel/dispose and never held in provider state or recorded by the test fixture (which stores only
*whether* a password was present). A real UI defect was found and fixed while testing: the Save button
was gated on controller text with nothing listening, so it stayed disabled while the seller typed —
controller listeners added. *admin-web*: **unchanged** (already read-only and explicitly labelled).

**Evidence.** API unit **853** (+12), e2e **257** (+10, all through the real guards/DTO/service/filter),
type-check ×5, seller-web **41** (+5 files → +14 cases), buyer-web 181, admin-web 60, seller-mobile
**472** (+11), buyer-mobile 501, `flutter analyze` clean of warnings (5 pre-existing infos in untouched
files), seller-web and API production builds green. **Runtime probe** on the isolated API (:5051, this
build, dev DB, a disposable seller with a real password + one eligible earning, cookie auth through the
D2a Origin binding): GET returns exactly the four fields; unchanged PATCH without a password → 200
no-op with **0 audit rows**; change without a password → 400; wrong password → 403 with the destination
**unchanged in the DB** and no echo of the password; `POST {}` → 201 snapshotting M_PESA; inline
mismatch → 409 with **0 payouts created**; identical inline → 201; correct password → 200 with the DB
destination changed, the cooling-off stamped, `payoutsAvailableAt` exactly +24 h, an audit row with
masked phones and `actorId` = the seller, and a feed row whose body carries `+243•••••02`; a request
during the window → 409 naming the reopen time with 0 payouts created; after the window → 201 with the
**new** destination; the in-flight payout kept its old snapshot after a further change; the throttle
answered 429 with `Retry-After` once the 5/h bucket was spent (the last two also hit the 10/min per-IP
cap); no session → 401. Every fixture removed afterwards and verified: 0 users, profiles, orders,
payouts, earnings, audit rows or feed rows left.

**Remaining risks / not in this PR.** The 24 h window is only as good as the seller reading one of the
three notices — a seller with no push token and no email would see only the in-app feed (the code warns
in that case). An attacker who also owns the seller's password (not just a session) is unaffected by
re-auth; that is the login-email-change follow-up (RECOMMENDED, S12-adjacent) and password-reset
hardening, deliberately out of scope here. Admin step-up re-auth for `complete`, S11 audit coverage,
S13/S14/S22 and D2b remain as classified in the 2026-09-09 audit.

### Production hardening close-out (2026-09-09 — release `9a89249` + both manual steps)

**Release.** PR #723 (`develop → main`) merged as **`9a89249`**; deploy run **34380668330** succeeded
17:04:28 → 17:10:45 UTC. EXPAND applied exactly `2026-09-06_auth_rate_limits.sql` then
`2026-09-09_payout_method_changed_at.sql` and skipped the nine already in `_manual_migrations`, before
the rolling swap; `set -eu` + `ON_ERROR_STOP=1` confirmed active.

**Manual step 1 — production nginx (operator).** The released `nginx/nginx.prod.conf` was installed on
the VPS (backup `nginx.prod.conf.before-20260909` kept on the box, **not** tracked in git),
`nginx -t` passed, and nginx was reloaded gracefully with all containers staying healthy. The operator
verified locally against `127.0.0.1` that teka.cd / seller / admin each answer 200 with one
application-owned CSP, one nginx-owned HSTS, seller `noindex, nofollow`, admin
`noindex, nofollow, noarchive`, buyer indexable, and that the API health/ready/live endpoints answer
through nginx with `database: ok`.

**Manual step 2 — Cloudflare/Hetzner origin firewall (operator).** Ports 80 and 443 restricted to the
approved Cloudflare paths; port 22 deliberately left open for the GitHub-hosted deploy runners.

**Independent re-verification from this session (read-only, external network, 2026-09-09).**
- Through Cloudflare: `teka.cd`, `seller.teka.cd`, `admin.teka.cd` each return **exactly one**
  `Content-Security-Policy` — the app-owned one — and **one** `Strict-Transport-Security`. **The
  duplicate CSP recorded immediately after the deploy is gone.** `X-Robots-Tag` unchanged on
  seller/admin; buyer carries none.
- Direct to the origin `178.104.179.42`: on 443 and on 80 the TCP handshake completes and the peer then
  **resets** (`errno 54`), returning no HTTP response, for all five hostnames — while
  `https://teka.cd` through Cloudflare answered `200` with `server: cloudflare` at the same moment.
  **The direct-origin bypass is closed.** Before the firewall the same probes returned 200/200/200/404
  and a 301 on :80, so the change is demonstrable rather than assumed.
- Certificate unchanged: Let's Encrypt, all five hostnames as SANs, 26 Aug → 24 Nov 2026 (75 days), and
  the ACME path still answers 404 through Cloudflare, so HTTP-01 renewal is unaffected.

**Two honest caveats.**
1. **GitHub → VPS SSH was not verifiable from this session.** My network cannot read an SSH banner from
   anywhere (the `github.com:22` control returned nothing either), so the port-22 probe proves nothing.
   The operator intended to leave 22 open and the firewall rule reflects that; **the next deploy is the
   proof**. If it ever fails at the SSH step, recover from the Hetzner Console — it is not an outage.
2. **Ports reject rather than drop.** A scanner still completes a handshake before the reset. Optional
   hardening (P3), not a defect.

**Not verified in this session and not claimed:** Sentry (no token or CLI available), VPS SSH posture
(`PasswordAuthentication`, `PermitRootLogin`, fail2ban), OS patch level, and the certbot renewal
authenticator recorded on the VPS.

### P1 admin / financial security follow-ups — `security/admin-financial-followups` (2026-09-09, open)

Five items the release-readiness audit classified P1, each re-verified as still open in current code
before being touched, in one reviewable PR. **No migration, no environment or secret change, no mobile
change, no API contract break.**

**A — login-email change now requires the current password.** `PATCH /v1/users/profile` wrote `email`
with no proof of identity, and for sellers and admins that email IS the login identity: a hijacked
session could point the account at an attacker's address, request a password reset there and own the
account permanently — the escalation path into the payout destination S12 guards. A real change (case-
and whitespace-insensitive) now needs the current password: **400** when missing, **403** when wrong
(403 rather than 401 so no client refreshes and replays; the attempt counts in the shared `login` lock
by email). Name-only updates and re-sending the same address stay password-free, so existing clients
keep working. The write, the `emailVerified` reset and a `LOGIN_EMAIL_CHANGED` audit row with **masked**
addresses commit together; the **previous** address is notified after commit with a new French template,
because it is the only address a legitimate owner still controls after a takeover. A duplicate address
is a French **409** saying only that it cannot be used — never that it belongs to someone else. Accounts
without a password (buyers on WhatsApp OTP) are refused explicitly. seller-web and admin-web show the
password field only when the email is actually edited, mark it `data-ph-no-capture`, and clear it on
success and in `finally`; the stale « vous demandera de le re-vérifier » copy is replaced by what
actually happens.

**B — S13 upload throttling.** `POST /v1/sellers/documents` (open to any authenticated **BUYER**,
creates a private Cloudinary asset per call, no row, no owner binding) and
`POST /v1/sellers/verification/documents` had **no throttle at all**, while the product-image and avatar
routes already had one. Both now carry `@Throttle` 20/min per IP plus `@IdentityThrottle('upload')`
(`AUTH_LIMITS.upload`, 30 per 10 minutes, keyed on the user id — never a phone or an email). All four
upload routes are now throttled. Size limits, magic-byte sniffing, declared-type agreement, EXIF
stripping, the field-name guard, ownership and the multipart retry path are untouched. **Still open**
(data governance, not abuse): row-first creation with owner binding and an orphan sweep for application
documents.

**C — S22 banner-link validation.** `linkUrl` and `linkTarget` were `@IsString()` only and buyer-web
turned them into real anchors, so an admin account could store `javascript:` (which the storefront CSP's
`script-src 'unsafe-inline'` permits on navigation) or `//evil.example` (an open redirect), surviving the
session that wrote it. Now validated on write against `linkType`: identifier types take a plain slug,
short code or UUID; `url` takes a site-relative path (single leading slash, never `//` or `/\\`) or an
absolute **https** URL; control characters and values over 500 characters are refused; title and subtitle
bounded. **The destination host is deliberately not restricted** — external campaign links are an
intentional capability the existing tests document, and the vulnerability was the scheme, not the
destination; gating on `https:` rejects `javascript:`, `data:`, `file:`, `vbscript:` and `blob:` by
construction plus `http:` as a downgrade. buyer-web `bannerHref()` applies the same rule at the sink as
defence in depth. Production carried **zero** banners when this landed, so no historical value was
invalidated.

**D — S14 request bounds.** Pagination was `@Type(() => Number)` only (a seller could ask for
`limit=1000000` and pull the whole catalogue with images in one query) and enum filters were free strings
cast into Prisma filters, answering **500** instead of 400. Bounded to the `PayoutQueryDto` convention:
`ProductQueryDto` and `SearchUsersDto` get `page >= 1`, `limit 1..100`, `@IsIn` on status/role and
`search <= 200`; `CreateAddressDto` gets 60/80-character bounds; `SellerCreatePromotionDto` 120/2000.
`AdminOrderQueryDto` was found **already bounded** and left alone.

**E — the two S11 one-liners.** `PATCH /v1/admin/users/:id/status` had no self-guard (an admin could
suspend or ban their own account and lock themselves out), discarded `dto.reason`, recorded no actor, and
left every refresh token of the suspended account valid — and the refresh path refused only `BANNED`, so
the session resumed the moment the status was lifted. Now a self-change is a French **403** before
anything is read; the status change, the revocation of every live refresh token (on SUSPENDED/BANNED
only) and a `USER_STATUS_CHANGED` audit row carrying actor and reason commit in one transaction; and
`refreshTokens()` refuses SUSPENDED alongside BANNED.

**Tests.** API **880 unit** (+27) and **268 e2e** (+11), buyer-web 187 (+6), seller-web 41, admin-web 60,
type-check ×5, three production web builds. New suites: `banner-link.validator.spec.ts` (11),
`update-profile-email.spec.ts` (9), `upload-throttling.e2e-spec.ts` (3), `dto-bounds.e2e-spec.ts` (8),
plus 4 admin-status and 3 refresh cases.

**Runtime verification** on an isolated API (:5051, this build, dev DB, disposable seller + admin +
second seller, cookie auth through the D2a Origin binding). Every path confirmed end to end: a name-only
update and an unchanged email need no password; a change without one is 400; a wrong password is 403 with
the address **unchanged in the DB** and no echo; a duplicate is 409 with no owner disclosed; the correct
password changes the address, resets `emailVerified`, and writes an audit row whose before/after are
masked (`q•••r@…` → `q•••d@…`) with no raw address or password; an admin suspending **themselves** is 403
with their status still ACTIVE; suspending another account returns 200, takes live refresh tokens from
**1 to 0**, and audits the actor and reason; refreshing a suspended session is 401 « Compte non trouvé ou
suspendu »; `limit=100` passes while 101, 1000000, `page=0`, `limit=abc` and `status=NOPE` are 400 with
no Prisma detail; `javascript:`, `data:`, protocol-relative, `http:` and a URL-as-identifier are all
refused while `/categories` and an https link are created; and the document upload answers **429 after 20
calls** with `Retry-After: 60` and no identifier in the body. All QA rows deleted afterwards and verified
at zero (users, profile, audit, banners, tokens).

**Not changed on purpose:** authentication and authorization semantics, CSRF/origin behaviour, Cloudinary
lifecycle, session/token rotation beyond the suspend case, mobile clients, and every API response shape
except the two new refusals.

### Sentry request-data minimisation — `security/sentry-request-data-minimization` (2026-09-09, open)

The P1 item, re-audited before implementation rather than taken on trust — and the audit found the
risk **understated**, not overstated.

**Root cause.** `@sentry/node` 10.53.1 enables `requestDataIntegration` by default with
`DEFAULT_INCLUDE = { cookies: true, data: true, headers: true, query_string: true, url: true }`, and
`httpIntegration` defaults `maxIncomingRequestBodySize` to `'medium'`, patching every incoming request
to buffer up to 10 kB of body. `sendDefaultPii` gates **only the client IP**, so it was never the
control anyone assumed it was. Verified by reading the installed SDK, not the docs: the option is
`maxIncomingRequestBodySize` on this version, not the `maxRequestBodySize` the docs show for
`httpServerIntegration`.

**Demonstrated, not inferred.** With a stub transport and a fake DSN against the then-shipping
`instrument.ts`, one 500 on `POST /v1/auth/login/email` produced an event containing the plaintext
password, the `Authorization` header, both session cookies, the OTP code, the `?token=` query value
and the email address. Only the phone number was scrubbed. The same probe after the fix reports all
eight secrets clean while retaining method, user-agent, content-type, surface, exception type and
message, ten stack frames, tags and environment.

**Fix, two layers.** Prevent collection (`maxIncomingRequestBodySize: 'none'`, `include: { cookies:
false, data: false }`, `sendDefaultPii: false` pinned) on the API and the three Next.js server
runtimes; then sanitise what remains via one shared implementation,
`packages/shared/src/security/sentry-sanitize.ts`, wired as `beforeSend` + `beforeBreadcrumb` on all
four JavaScript surfaces and all nine web runtime configs. It is deliberately shared rather than
copied four times: `@teka/shared` already ships in every client bundle, so it costs nothing, and a
security rule set that exists in four places drifts.

**Second finding, from the logging cross-check.** `consoleIntegration` is a Sentry default, so every
Nest `Logger` line becomes a breadcrumb — and this codebase logs in `key=value` style. Key-based
redaction never sees those, because there is no object key. An inline `key=value` rule was added and
proved against real log lines from `buyer-otp.service.ts` and the mock WhatsApp provider. Ordering is
load-bearing: JWT and `Bearer` must run before the inline rule, or `Authorization: Bearer <token>`
matches inline, consumes only the word `Bearer` and leaves the token intact. That regression was
caught by the probe and fixed.

**Mobile audited, deliberately unchanged.** Neither Flutter app has `sentry_dio` or `SentryHttpClient`,
so no request body, cookie or auth header can enter a mobile event; `setUser` carries only `id` and
`role`. Residual findings recorded in `docs/sentry.md` for the mobile hardening initiative: `beforeSend`
does not walk `exceptions`/`contexts`/`tags`/`user`, the `\+243\d{9}` regex misses local and spaced
forms, `retry_interceptor.dart` documents a query-strip that no code performs, seller-mobile never
clears the Sentry user on logout, `sendDefaultPii` is unpinned, there are no scrubber tests, and
`SENTRY_DSN` is empty in both production flavor files so mobile Sentry is currently a no-op.

**Not done, on purpose.** Sentry dashboard-side scrubbing is still recommended as defence in depth and
has **not** been verified — no Sentry auth token is available in this environment and no remote event
was inspected. The `global-error.tsx` files in all three web apps still never call `captureException`;
that is a missing feature, not a leak, and belongs in its own change.

**Third finding, from CodeQL on the PR itself.** The first draft of the sanitiser tripped
`js/polynomial-redos` (high) on the Cloudinary pattern: an unbounded `[^\s"'<>]*` either side of the
literal is polynomial on a long non-matching string, and this code runs inside `beforeSend` on data an
attacker can influence. Correct finding, fixed rather than dismissed — the host part now excludes `/`
so it cannot scan forward across a path, every quantifier is length-bounded, and a `MAX_STRING_LENGTH`
ceiling is applied before any regex runs. A 60 kB non-matching URL costs about 2 ms; four regression
tests cover it.

**Verification.** API 908 unit (+28) / 268 e2e; buyer-web 190, seller-web 44, admin-web 63 (+3 each);
type-check ×5; three production `next build`s. No migration, no environment or secret change, no
workflow change, no mobile change.

### Mobile security hardening — MS1-MS7 (2026-09-09, in progress)

Re-audited against current code before any change. Two corrections to the tracker.

**MS5 is largely already done.** A4 (`f0b034a`, PR #686) introduced `SessionScope` and already evicts the
cart snapshot, the cached profile, recently-viewed and recent searches on logout, on session rejection and
on both account-switch paths, with tests in `test/session/account_isolation_test.dart` and
`test/auth/offline_cold_start_test.dart`. Those four are **not** reimplemented. What remains is the town
(`teka_selected_city_id`), which has a real symptom: `clearCity()` exists but nothing calls it, and because
`hydrateFromProfile` bails on `if (state.hasCity) return`, buyer B inherits buyer A's town **and B's own
server-side `preferredCityId` is silently ignored**. `city_persistence_test.dart:223` is titled "logout
path" and covers a path production never takes, which is why the gap survived. Also open: the
`SellerAccountException` branch returns before `clearPrivateState()`, and the `cached_network_image` disk
cache is never cleared.

**MS5 as written does not apply to seller-mobile.** It has no cart, no recently-viewed, no searches, no city
and no image cache; `TypedCache`/`CacheKeys` are dead code never read by any feature, and the only
persisted state is the two tokens, which logout clears. The real seller gap is in memory: the notifications,
earnings, promotions and reviews notifiers have no reset on logout.

**New finding outside MS1-MS7.** buyer-mobile calls `ImageSource.gallery` for the avatar while its iOS
`Info.plist` declared no `NSPhotoLibraryUsageDescription`. iOS terminates an app that touches a
privacy-sensitive API with no usage string, so the avatar picker crashed on device and App Review would
reject the binary. Fixed in PR A; gallery only, since the buyer app never opens the camera.

**PR A — platform/storage/config (`mobile/hardening-platform-config`).** MS1 `allowBackup="false"` plus
cloud-backup and device-transfer exclusion rules; MS4 `IOSOptions(first_unlock_this_device)`, closing the
iOS half of a gap Android already covered with `encryptedSharedPreferences`; MS7 R8 shrink + obfuscation
with keep rules for the Flutter embedding, Firebase/GMS, `androidx.security` and Flutter's unused Play Core
references; and the iOS usage string.

MS7 was validated by running minified builds, not by the build succeeding, because R8 fails at runtime:
production AABs for both apps (R8 8.11.18, mapping files produced), then minified development-flavour
release APKs installed on a Pixel 8 Pro emulator. Both launched clean, with no ClassNotFound, NoSuchMethod
or MissingPlugin failures; Firebase initialised, `flutter_secure_storage` opened its encrypted store, and
the buyer app loaded live towns, categories, images and promotions from the dev API.

Baselines held: buyer 501 tests, seller 472, `flutter analyze` at 6 and 5 pre-existing infos.

**Still to come:** PR B (MS2 buyer router UUIDs, MS3 `teka://` host check, MS5 remainder) and PR C (MS6
scrubber breadth + tests, `sendDefaultPii` pinned, seller Sentry user cleared on logout).

**Note for whoever runs an iOS build:** `flutter build ios` rewrites
`ios/Runner.xcodeproj/.../Package.resolved`, bumping SwiftPM pins (app-check 11.3.0 → 11.3.1,
firebase-ios-sdk). That drift is incidental and was reverted out of PR A rather than shipped inside a
security change.

## Next exact step

**Production is released and hardened; the P1 admin/financial security follow-ups are MERGED**
(PR #725, `f9a9b34`) **and the Sentry request-data minimisation is implemented and awaiting review**
(`security/sentry-request-data-minimization`). Remaining, each its own small PR into `develop` with a
merge commit, none started without approval.

**P1.** (1) ~~Merge the admin/financial follow-up PR~~ — MERGED as `f9a9b34` (PR #725).
(2) ~~Sentry request-data opt-out~~ — IMPLEMENTED on `security/sentry-request-data-minimization`,
open and awaiting review; see the record above. (3) `mobile/security-hardening` MS1–MS7 — all
verified still open (no `allowBackup`, no `IOSOptions`, no scrub tests, no R8/minify) — **before**
the next store builds. (4) Branch-protection required checks (a repository setting: the `Protect
main` ruleset enforces merge-commits but no status checks, and `develop` has no rules).

**P2.** Buyer Web USD price (verified still broken: `priceUSD` typed `number` while the API serialises
BigInt as a string); seller-web stale-town notice; D2b admin API boundary; the rest of the S11 audit
coverage (product hard-delete actor, reviews, settings, broadcasts); row-first + orphan sweep for
application documents; Prometheus/Grafana alerting.

**P3.** `pendingCDF` vs HELD without `deliveredAt`; seller-mobile `Image.network` in 3 files; legacy
characteristic prefill; golden tests; origin firewall drop-instead-of-reject; the certbot hook reloading
rather than restarting nginx; `esbuild` and the stale Dependabot PRs.

**Owner decisions still open:** SUPPORT/FINANCE role model (S21); seller-visible buyer PII parity;
PostHog replay masking on buyer account pages; whether MS1–MS7 must precede the next store builds
(current preference: yes).
