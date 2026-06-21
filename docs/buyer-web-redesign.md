# Buyer-web visual redesign — tracker

> **Resume anchor.** This file is the single source of truth for the buyer-web (teka.cd) redesign
> initiative. On any resume: read this first, then `git log --oneline -20`, then continue from the first
> unchecked `[ ]` box. Each sub-task is its own commit; each phase is its own PR. STATUS.md points here.

**Status:** Phase 1 (buyer-web) **code-complete + validated** (palette/hero checkpoint approved by user
2026-06-21). type-check + production build green; PR open → develop. Phases 2 (mobile) + 3 (seller/admin)
deferred.
**Branch:** `feat/buyer-web-redesign`.
**Decisions (validated):** Modern Ruby red (`#C8102E`); town accents copper `#B87333` (Lubumbashi) / cobalt
`#1A56DB` (Kolwezi); checkpoint after palette+hero.
**Constraint:** buyer-web ONLY for Phase 1. No seller/admin/mobile until buyer-web is validated. Token-level,
low-risk changes; preserve all functionality, SEO, analytics, API contracts.

## Audit findings (Phase 0 — done)

- **Design is fully token-driven.** All colors flow from `--color-*` CSS vars in
  `apps/buyer-web/src/app/globals.css` (`@theme inline {}`). **Zero hardcoded hex in components** → a new
  palette is largely a token swap that ripples safely. Brand red today = `--color-primary-600 #BF0000`
  (Rakuten 485 C) — dark, pure, reads aggressive/dated.
- **Typography:** Inter via `next/font` (`layout.tsx` + `--font-inter`). Weights 400/500/600/700.
- **UI primitives** (`components/ui/`): Button, Badge, Card, Input, Label, Container, SectionHeader — CVA
  variants; safe to restyle.
- **Homepage** (`components/pages/home-page.tsx`, client): fallback hero = full-red gradient
  (`from-primary-700 via-primary to-primary-500`) — too red; category section = emoji cards grid; product
  carousels via `ProductGrid`/`ProductCard`.
- **City identity:** `lib/city-store.ts` (Zustand) + city prompt/modal. **No city-specific styling today.**

### DO-NOT-TOUCH (SEO / analytics / perf — preserve exactly)
Server components emitting metadata/JSON-LD: `app/page.tsx`, `app/[ville]/[product]/page.tsx`,
`app/[ville]/categorie/[slug]/page.tsx`, `app/layout.tsx`; `components/seo/json-ld.tsx`; `app/sitemap.ts`;
`public/robots.txt`; `lib/urls.ts`. Analytics: `lib/analytics.ts` + all `track()` call sites (cart/wishlist/
product/category/search), `posthog-*`, `clarity.tsx`, Sentry configs + `sentry-scrub.ts`. Image:
`next.config.ts` images + redirects; `product.image?.thumbnailUrl || .url` pattern; OG transform in product
page. Perf: `ProductGrid` skeletons; `<Suspense>` around PostHogPageview; SW registration + `public/sw.js`.
**Rule:** never convert a server component to client; never move a `track()` call site; restyle only the
presentational client layer.

## Proposed direction (PENDING VALIDATION)

- **New red:** modernize `--color-primary-*` to a cleaner, premium, AA-accessible red (canonical 600
  candidate ≈ `#C8102E` "ruby/cardinal" — passes white-text AA, brighter+less brown than #BF0000). Final
  palette chosen by the user (see STATUS Q&A).
- **Town accents (subtle, not themes):** Lubumbashi = copper (`~#B87333`), Kolwezi = cobalt blue
  (`~#1A56DB`). Applied to city badge/chips/banner/delivery only; global brand stays unified.
- **Screenshots:** the inspiration screenshots were NOT received in the prompt; proceeding on best-practice
  + written direction. Fold in later if provided.

## Phase plan (Phase 1 = buyer-web)

- [x] **P1.0 Foundation — palette + tokens.** `globals.css` Modern Ruby `--color-primary-*` + copper/cobalt
  accent tokens; `lib/city-accent.ts` helper. (commit 57eb15f)
- [x] **P1.1 Hero.** Light, conversion-focused fallback hero: town-accent location badge + value prop + CTA +
  trust strip (delivery / COD / verified sellers). Much less red. (57eb15f)
- [x] **P1.2 Categories section.** Larger rounded-2xl cards, emoji-in-circle, stronger hierarchy/hover,
  2/3/4/6 grid. (1cee3dc)
- [x] **P1.3 Product cards.** Bold dark CDF + secondary USD price (red reserved for CTA), declutter condition
  badge (USED only), polished quick-add. **All wiring preserved** (thumbnailUrl/href/add_to_cart track/
  wishlist). NB: no rating/discount in the browse API → not added (would need an API change). (1cee3dc)
- [x] **P1.4 Header / nav / search.** City selector restyled; PinIcon. (1cee3dc)
- [x] **P1.5 Town accents.** City selector (desktop+mobile) + CityPrompt chips wear copper/cobalt. (1cee3dc)
- [x] **P1.6 Typography + spacing pass.** SectionHeader accent bar + larger touch target on quick-add.
- [x] **P1.7 Mobile QA.** Responsive grids/header/menu retained; touch targets bumped. (live mobile review =
  user's browser; screenshot sandbox couldn't reach the local API).
- [x] **P1.8 Verify + document.** type-check + production build green; diff touches only presentational
  components + globals.css + dev-only image config (NO server pages / JSON-LD / sitemap / analytics /
  urls.ts); `add_to_cart` track site intact; tracker + STATUS + PROGRESS updated. PR → develop.

**Dev-env note:** local DB has legacy `picsum.photos` seed images; `next.config.ts` now allows that host in
**development only** (prod product images are all Cloudinary) so buyer-web dev doesn't crash on next/image.

### Phase 1 — SHIPPED to prod 2026-06-21 (releases #398; `develop == main`). teka.cd live, city hero images served.

### Phase 2 — buyer-mobile (Flutter) — DONE (branch `feat/buyer-mobile-redesign`)
- `teka_colors.dart` brand red → **Modern Ruby** scale (#C8102E) + copper/cobalt town-accent colors +
  `cityAccent(slug)` helper (mirrors web `lib/city-accent.ts`). Ripples through the whole app via
  `app_theme.dart` (seed/primary/appbar/buttons/chips all consume `TekaColors.tekaRed`).
- Town accents applied to the home app-bar city display + each city tile in the selection screen
  (copper Lubumbashi / cobalt Kolwezi). Category chips kept as the native horizontal-pill pattern (now
  Modern Ruby) — web grid NOT forced onto mobile. Green: analyze clean on changed files + 76 tests pass.

### Phase 3 — seller-web + admin-web + seller-mobile — DONE (branch `feat/phase3-brand-consistency`)
- Minimal brand-consistency pass: canonical brand red `#BF0000` → **Modern Ruby `#C8102E`** in each app's
  single primary token — `seller-web` + `admin-web` `globals.css` (`--color-primary` + `--color-ring`) and
  their `global-error.tsx` inline fallback; `seller-mobile` `teka_colors.dart` (`tekaRed`). Token-driven →
  ripples through each app. **No town accents** (a buyer-only concept), no workflow/layout redesign. Green:
  seller-web + admin-web type-check + build; seller-mobile analyze + tests. **Redesign initiative complete.**

## Verification checklist (per phase)
`pnpm --filter buyer-web type-check` + `build`; confirm server components unchanged (no new `'use client'`
in SEO pages); grep `track(` call sites intact; product images still use thumbnailUrl; manual desktop +
mobile viewport check; (final) Lighthouse/CWV sanity + FB OG debugger on a product URL.
