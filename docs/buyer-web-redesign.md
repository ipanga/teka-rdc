# Buyer-web visual redesign — tracker

> **Resume anchor.** This file is the single source of truth for the buyer-web (teka.cd) redesign
> initiative. On any resume: read this first, then `git log --oneline -20`, then continue from the first
> unchecked `[ ]` box. Each sub-task is its own commit; each phase is its own PR. STATUS.md points here.

**Status:** Phase 0 (audit + plan) complete. **Awaiting palette/direction validation before any design code.**
**Branch:** `feat/buyer-web-redesign` (Phase 1 lands here as stacked sub-commits / per-phase PRs).
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

- [ ] **P1.0 Foundation — palette + tokens.** Swap `--color-primary-*` scale; add `--color-accent-copper`/
  `--color-accent-cobalt` + a small `cityAccent()` helper. Refine shadow/radius if needed. (globals.css +
  one helper.) Verify build + a visual smoke pass.
- [ ] **P1.1 Hero.** Replace the all-red fallback hero with a modern, lighter, conversion-focused hero
  (value prop + search/CTA + delivery/trust signals + location-aware line). Less red.
- [ ] **P1.2 Categories section.** Larger cards, stronger hierarchy, better spacing/interaction, mobile-first.
- [ ] **P1.3 Product cards.** Price hierarchy, badges, discount, stock, rating, add-to-cart CTA — preserve
  image/href/track/wishlist wiring.
- [ ] **P1.4 Header / nav / search.** Modern header + search prominence + mobile nav polish.
- [ ] **P1.5 Town accents.** City badge/chips/banner/delivery using copper/cobalt.
- [ ] **P1.6 Typography + spacing pass.** Type scale, readability, consistency (keep Inter for perf/SEO).
- [ ] **P1.7 Mobile QA pass.** Touch targets, responsive layouts, browse/search/product on small screens.
- [ ] **P1.8 Verify + document.** type-check + build; SEO intact (metadata/JSON-LD/sitemap/OG); analytics
  call sites intact; CWV not regressed; update this tracker + STATUS/PROGRESS. PR(s) → develop.

### Deferred (after buyer-web validated)
- **Phase 2 — buyer-mobile (Flutter):** align colors/identity/category presentation where appropriate
  (`teka_colors.dart` + `app_theme.dart`), respecting native UX.
- **Phase 3 — seller-web + admin-web:** minimal brand-consistency pass (token alignment), no workflow redesign.

## Verification checklist (per phase)
`pnpm --filter buyer-web type-check` + `build`; confirm server components unchanged (no new `'use client'`
in SEO pages); grep `track(` call sites intact; product images still use thumbnailUrl; manual desktop +
mobile viewport check; (final) Lighthouse/CWV sanity + FB OG debugger on a product URL.
