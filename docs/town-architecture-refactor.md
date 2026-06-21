# Town Architecture Refactor — tracker

> **Resume anchor.** Single source of truth for the Town Architecture Refactor. On any resume: read this
> first, then `git log --oneline -20`, then continue from the first unchecked `[ ]` box. Each sub-task is its
> own commit; each phase is its own PR off `develop`. STATUS.md points here.

**Goal.** Replace the homepage "Achetez dans votre ville" section with a scalable, Amazon-style town-selection
architecture: a prominent header town selector, an SEO-safe first-visit modal, town persisted to
cookie + localStorage + user profile, all catalog browsing auto-scoped to the selected town, SEO landing pages
`/{ville}` preserved, and **future towns configurable from data only** (no hardcoded Lubumbashi/Kolwezi).

**Branch naming.** `feat/town-arch-p0-api`, `feat/town-arch-p1-buyer-web`, `feat/town-arch-p2-buyer-mobile`,
`feat/town-arch-p3-seller`.

## Locked decisions (user, 2026-06-21)

- **D1 — First-visit:** **Auto-modal, SEO-safe.** Auto-open the town modal on first visit (no town cookie),
  but as a client-side overlay *over* fully server-rendered content + cookie-gated so it shows once. Crawlers
  see the full page underneath (no content gate). Reverses the old opt-in stance, the safe way.
- **D2 — Profile persistence:** **Add `User.preferredCityId`** (nullable) + `PATCH /v1/users/me/preferred-city`;
  hydrate town from profile on login; save to profile on town change while authenticated. Cookie + localStorage
  always.
- **D3 — Promo targeting:** **Keep promotions / banners / categories GLOBAL.** Products + search are already
  town-scoped (`cityId`) — that is the core of requirement #4. No new schema/admin for per-city promos now.
- **D4 — Sellers:** Town-**selection** (browse-by-town) applies to **buyer-web + buyer-mobile** only. Seller
  apps get a **city PICKER** in the profile (replaces free-text `location`, uses the existing
  `SellerProfile.cityId` + `/v1/cities` data) — NOT browsing.

## Audit baseline (what already exists — Phase 0 done)

- **Header town selector** (`📍 {city} ▼`): EXISTS in buyer-web (`components/layout/header.tsx`) +
  buyer-mobile (home app-bar). Requirement #2 ≈ done; Phase 1 polishes it Amazon-style.
- **`/{ville}` SEO landing pages**: EXIST (`app/[ville]/page.tsx` + `components/pages/city-landing-page.tsx`),
  auto-set the active city from the URL, and **reuse the homepage components** (no separate UI). Requirement #5
  ≈ done.
- **products + search town-scoped**: DONE (`cityId` flows through browse/search/autocomplete on web + mobile).
- **city list is data-driven** via `GET /v1/cities`; future towns already appear in lists automatically.
- **Persistence today**: localStorage only (web `teka_city_id`/`teka_city`) / FlutterSecureStorage
  (`teka_selected_city_id`, mobile). NO cookie, NO user-profile field.
- **HARDCODED (blocks data-only towns)**: `apps/buyer-web/src/lib/city-accent.ts` (`accentForCity` +
  `heroImageForCity` `switch(slug)`) and `apps/buyer-mobile/lib/core/theme/teka_colors.dart`
  (`cityAccent(slug)`); hero images at `public/hero/{slug}.webp`. Phase 0 adds `City.accentColor` +
  `City.heroImageUrl`; Phases 1–2 switch the helpers to read city data.
- **`SellerProfile.cityId` already exists** (nullable) → D4 seller picker is mostly a frontend swap.

### DO-NOT-TOUCH (SEO / analytics / perf — preserve exactly)
Server components emitting metadata/JSON-LD: `app/page.tsx`, `app/[ville]/[product]/page.tsx`,
`app/[ville]/categorie/[slug]/page.tsx`, `app/layout.tsx`; `components/seo/json-ld.tsx`; `app/sitemap.ts`;
`public/robots.txt`; `lib/urls.ts`. Analytics: `lib/analytics.ts` + all `track()` sites. **Rule:** never convert
a server component to client; never move a `track()` call site; the first-visit modal must be a CLIENT overlay
over already-rendered content (never an SSR gate).

## Phase plan

### Phase 0 — API/DB foundation (branch `feat/town-arch-p0-api`) — CODE-COMPLETE
- [x] **P0.1** Prisma: `City.accentColor String?`, `City.heroImageUrl String?`; `User.preferredCityId String?
  @db.Uuid` + relation + index. Applied to dev via `prisma db execute` (plain `db push` would drop the
  raw-SQL `search_vector` FTS column — known divergence; additive migration used instead).
- [x] **P0.2** Idempotent manual prod migration
  `apps/api/prisma/migrations/manual/2026-06-21_town_architecture.sql` (ADD COLUMN IF NOT EXISTS ×3 + FK guard
  + index). **Apply to prod via the Action at release only (with explicit user authz).**
- [x] **P0.3** `GET /v1/cities` returns `accentColor` + `heroImageUrl` (scalar columns auto-returned); shared
  `City` type gains the two fields; admin cities create/update DTO + service accept them.
- [x] **P0.4** `PATCH /v1/users/me/preferred-city` (`{ cityId: string | null }`, validates the city exists +
  is active; `UsersService.setPreferredCity`); `/me` (auth) + `/v1/users/profile` include `preferredCityId`
  (scalar) + resolved `preferredCity` so web + mobile hydrate on login.
- [x] **P0.5** Unit: `users.service.spec.ts` set/clear/invalid (3). Auth guard is inherited (UsersController
  has no `@Public`). Full suite green: **132 unit + 116 e2e**; shared + api type-check clean. PR → develop.

### Phase 1 — buyer-web (branch `feat/town-arch-p1-buyer-web`) — CODE-COMPLETE
- [x] **P1.1** `lib/city-store.ts`: cookie persistence (`teka_city` = town id, non-httpOnly, SameSite=Lax,
  1y) + `teka_city_prompted` gate cookie; `setCity` fires `PATCH /v1/users/me/preferred-city` when authed
  (fire-and-forget via `useAuthStore`); `clearCity` clears the profile too; `hydrateFromProfile` (auth-provider
  calls it after `/me` — adopts the profile town only when no local selection; device choice wins).
- [x] **P1.2** First-visit SEO-safe auto-modal: `maybePromptFirstVisit()` opens `CitySelectorModal` as a
  client overlay AFTER the homepage renders (content already SSR'd → no crawler gate), cookie-gated to show
  once; pick OR dismiss sets `teka_city_prompted`. `CityPrompt` kept as the in-flow fallback.
- [x] **P1.3** Removed the homepage "Achetez dans votre ville" section; crawlable `/{ville}` links relocated
  to the **global footer** (site-wide internal linking; sitemap already covers them).
- [x] **P1.4** Header town selector → Amazon-style two-line "Livrer à / {ville}" (`deliverTo` +
  `selectCityShort` FR strings); data-driven accent surface.
- [x] **P1.5** Data-driven accents/hero: `lib/city-accent.ts` reads `accentColor` / `heroImageUrl` from the
  city record (no `switch(slug)`); all call sites pass the city object. Backfilled the two launch towns via
  `seed.ts` + idempotent migration `2026-06-21_town_identity_backfill.sql` (applied to dev). `[ville]` landing
  passes accent/hero through so the adopted town keeps its identity.
- [x] **P1.6** Verify: buyer-web type-check + 51 tests + scoped ESLint green; api type-check green; no
  server-component→client conversion, no `track()` site moved, no sitemap/JSON-LD/urls.ts change. PR → develop.
  *(Prod build not run — dev-server-collision rule; type-check used for verification.)*

### Phase 2 — buyer-mobile (branch `feat/town-arch-p2-buyer-mobile`) — CODE-COMPLETE
- [x] **P2.1** First-launch town gate **already existed** (router redirects authed users with no city →
  `/city-selection`). Added the missing pieces: profile **hydration** (`CityNotifier.hydrateFromProfile` wired
  via `ref.listen(authProvider)` in the `cityProvider` factory — adopts `preferredCityId` from `/me` when no
  local choice, so the gate is skipped when a profile town exists) + **PATCH** `/v1/users/me/preferred-city`
  on `selectCity`/`clearCity` (`CityRepository.setPreferredCity`, fire-and-forget). `CityModel` gains
  `accentColor` + `heroImageUrl`.
- [x] **P2.2** Data-driven accent: `TekaColors.cityAccent` now keys on `City.accentColor` (not slug); call
  sites (home app-bar, city-selection tiles) pass `accentColor`. No hardcoded Lubumbashi/Kolwezi.
- [x] **P2.3** Verify: `flutter analyze` clean (0 errors/warnings; pre-existing infos only); **76 + 3 new**
  tests green (`test/city/city_town_identity_test.dart`). PR → develop.

### Phase 3 — seller-web + seller-mobile (branch `feat/town-arch-p3-seller`) — CODE-COMPLETE
- [x] **P3.0** API: `UpdateSellerProfileDto.cityId` (validated by DB lookup — seeded city ids are
  non-RFC4122; empty string = no change); `/me` already returns `sellerProfile.cityId`.
- [x] **P3.1** seller-web profile: added a **Ville** `<select>` (from `/v1/cities`) bound to
  `SellerProfile.cityId`; `location` kept as a free-text **address/quartier** field (with hint). New FR strings
  `city`/`cityPlaceholder`/`locationPlaceholder`/`locationHint`.
- [x] **P3.2** seller-mobile profile: mirror — `DropdownButtonFormField` city picker (`ProfileRepository.getCities`
  + `CityOption`), `SellerProfileInfo.cityId`, `updateSellerProfile(cityId:)`; ARB `profileCity`/`profileCitySelect`/
  `profileLocationHint` + `flutter gen-l10n`.
- [x] **P3.3** Verify: api 132 unit + 116 e2e; seller-web type-check + ESLint; seller-mobile analyze (0
  errors/warnings) + tests. PR → develop.

### Release
- [ ] Real merge `develop → main` per phase or batched (NEVER squash); apply the P0 migration via the Action
  **with explicit user authorization**; back-merge `main → develop`; verify prod; tick here + PROGRESS.md.

## Verification checklist (per phase)
API: `pnpm test` + `pnpm test:e2e` in `apps/api`. Web: `pnpm --filter {app} type-check` + `build` (NEVER while
its dev server runs). Mobile: `flutter analyze` + `flutter test`. Confirm: no server-component→client
conversion in SEO pages; no `track()` site moved; FR-only strings; products still town-scoped.
