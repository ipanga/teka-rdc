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

### Phase 0 — API/DB foundation (branch `feat/town-arch-p0-api`)
- [ ] **P0.1** Prisma: `City.accentColor String?`, `City.heroImageUrl String?`; `User.preferredCityId String?
  @db.Uuid` + relation + index. `pnpm db:push` to dev.
- [ ] **P0.2** Idempotent manual prod migration
  `apps/api/prisma/migrations/manual/2026-06-21_town_architecture.sql` (ADD COLUMN IF NOT EXISTS ×3 + FK guard
  + index). Apply to prod via the Action **at release only** (with explicit user authz).
- [ ] **P0.3** `GET /v1/cities` returns `accentColor` + `heroImageUrl`; shared `City` type gains the two
  fields; admin cities CRUD DTO accepts them.
- [ ] **P0.4** `PATCH /v1/users/me/preferred-city` (`{ cityId: string | null }`, validates the city exists +
  is active); include `preferredCityId` (and resolved city) in the `/me` / auth-user response so web + mobile
  can hydrate on login.
- [ ] **P0.5** Unit/e2e: cities response shape; preferred-city set/clear + auth guard; `/me` carries
  `preferredCityId`. `pnpm test` + `pnpm test:e2e` green. PR → develop.

### Phase 1 — buyer-web (branch `feat/town-arch-p1-buyer-web`)
- [ ] **P1.1** `lib/city-store.ts`: add cookie persistence (`teka_city`, non-httpOnly, readable by SSR);
  on auth, hydrate from `user.preferredCityId` (profile wins if local empty); on `setCity` while authed, fire
  `PATCH /v1/users/me/preferred-city` (fire-and-forget).
- [ ] **P1.2** First-visit SEO-safe auto-modal: when no town cookie/localStorage on mount, open
  `CitySelectorModal` as a client overlay (content already rendered); set the cookie on pick/dismiss so it
  shows once. Keep `CityPrompt` as the in-flow fallback.
- [ ] **P1.3** Remove the homepage "Achetez dans votre ville" section; relocate the crawlable `/{ville}`
  links to the footer (preserve SEO discovery).
- [ ] **P1.4** Header: make the town selector prominent/Amazon-style (`📍 Livrer à {ville} ▼`).
- [ ] **P1.5** Data-driven accents/hero: `lib/city-accent.ts` reads `city.accentColor` / `city.heroImageUrl`
  from city data (fallback to brand red + default hero); remove the hardcoded `switch(slug)`.
- [ ] **P1.6** Verify: `pnpm --filter buyer-web type-check` + build green; no server-page/SEO/analytics diff;
  PR → develop.

### Phase 2 — buyer-mobile (branch `feat/town-arch-p2-buyer-mobile`)
- [ ] **P2.1** First-launch town gate (no stored city → city selection screen), profile hydrate on login +
  `PATCH preferred-city` on change.
- [ ] **P2.2** Data-driven accent: `teka_colors.dart cityAccent` reads city data (accentColor) instead of the
  slug switch; default fallback.
- [ ] **P2.3** Verify: `flutter analyze` + tests green; PR → develop.

### Phase 3 — seller-web + seller-mobile (branch `feat/town-arch-p3-seller`)
- [ ] **P3.1** seller-web profile: replace free-text `location` with a city PICKER (`/v1/cities` →
  `SellerProfile.cityId`); keep `location` for any free-text addendum if needed.
- [ ] **P3.2** seller-mobile profile: mirror the city picker.
- [ ] **P3.3** Verify both; PR → develop.

### Release
- [ ] Real merge `develop → main` per phase or batched (NEVER squash); apply the P0 migration via the Action
  **with explicit user authorization**; back-merge `main → develop`; verify prod; tick here + PROGRESS.md.

## Verification checklist (per phase)
API: `pnpm test` + `pnpm test:e2e` in `apps/api`. Web: `pnpm --filter {app} type-check` + `build` (NEVER while
its dev server runs). Mobile: `flutter analyze` + `flutter test`. Confirm: no server-component→client
conversion in SEO pages; no `track()` site moved; FR-only strings; products still town-scoped.
