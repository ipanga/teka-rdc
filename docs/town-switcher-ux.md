# Town Switcher Fix + Town-Selection UX — tracker

> **Resume anchor.** Single source of truth for this initiative. On any resume: read this first, then
> `git log --oneline -15`, then continue from the first unchecked `[ ]`. Each sub-task is its own commit;
> the whole thing is one PR off `develop`. STATUS.md points here.

**Branch:** `feat/town-switcher-ux`.

## Root cause
`<CitySelectorModal />` is mounted in **`home-page.tsx` only**. The header's "Livrer à {city}" button (on every
page) calls `openSelector()` → sets `showSelector: true` in the global Zustand `useCityStore`. On non-home
pages no modal is mounted to render that state → nothing happens; navigating to `/` mounts the modal, which
then sees `showSelector === true` and opens. → **Per-page mount bug. Fix = mount the modal once, globally.**

## Locked decisions (user, 2026-06-22)
- **Routing on town switch — SMART, centralized** (one `resolveTownSwitchUrl(pathname, newSlug)` helper):
  category page `/{ville}/categorie/{rest}` → `/{newSlug}/categorie/{rest}` (taxonomy is town-agnostic, always
  valid); everything else (product, `/`, `/recherche`, town landing) → `/{newSlug}`. Always lands on a real SSR
  page (SEO-clean). No per-page logic.
- **Scope — web fix + mobile scalability polish:** the bug is web-only (mobile opens city selection as a pushed
  screen, already works from anywhere). Add a search field to the mobile city screen for 50+-town scalability.

## Plan

### Web (buyer-web)
- [ ] **W1 — Global modal mount.** Move `<CitySelectorModal />` from `home-page.tsx` into the root layout's
  client tree (`app/layout.tsx`, inside `AuthProvider`, after `{children}`). Renders `null` until opened → no
  SSR/SEO impact. Remove the homepage mount + import. Keep `CityPrompt` + `maybePromptFirstVisit` on the
  homepage (first-visit is homepage-specific; the modal *component* is now global).
- [ ] **W2 — Centralized town switch.** `lib/town-switch.ts` `resolveTownSwitchUrl(pathname, newSlug)`
  (category-preserve, else `/{newSlug}`). `hooks/use-select-town.ts` `useSelectTown()` → `selectTown(city)` =
  `setCity(city)` (persist cookie+localStorage+profile) + `closeSelector()` + `router.push(target)` (skip if
  target === current pathname). Wire the modal + `CityPrompt` to `selectTown` (NOT raw `setCity`). The
  city-landing/product/category pages keep calling `setCity` directly (URL → active city; must not navigate).
- [ ] **W3 — Modal redesign.** Compact premium picker: clean header (pin + title + close X, no giant red
  block) + **search field** (scales to 50+ towns) + province-grouped list + strong town-accent selected state
  (check icon) + a11y (role=dialog/aria-modal, focus search on open, ESC, body-scroll lock, real buttons) +
  mobile **bottom-sheet** (items-end on mobile, centered dialog on desktop). FR strings.
- [ ] **W4 — Verify.** type-check + ESLint + 51 tests; modal renders nothing in SSR (curl a PDP/category →
  no dialog markup); manual: open the selector from `/`, a PDP, a category, `/recherche` → opens everywhere;
  switching town from a category preserves the category, from a PDP lands on the town home.

### Mobile (buyer-mobile)
- [ ] **M1 — Searchable city screen.** Add a search `TextField` to `city_selection_screen.dart` filtering the
  province-grouped list by name; FR ARB string. `flutter analyze` + tests.

### Release
- [ ] Real merge `develop → main` (NEVER squash); back-merge `main → develop`; verify prod (modal opens from a
  PDP on teka.cd; no SSR regression); tick here + PROGRESS.md. No API/DB/migration.

## SEO guardrails
Modal is a client overlay rendering `null` until opened → not in SSR. Town switch navigates to real
`/{newSlug}` (or `/{newSlug}/categorie/...`) SSR pages — canonical/metadata/structured-data unchanged. No
server component touched; no `track()` site moved.

## Verification checklist
`pnpm --filter buyer-web type-check` + ESLint (changed files) + `pnpm --filter buyer-web test`. SSR: curl a PDP
+ category, confirm no `role="dialog"` in raw HTML. Mobile: `flutter analyze` + `flutter test`. Manual: selector
opens from every page type; switch routing matches the smart rule.
