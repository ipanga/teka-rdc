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

### Web (buyer-web) — DONE
- [x] **W1 — Global modal mount.** `<CitySelectorModal />` moved into `app/layout.tsx` (inside `AuthProvider`,
  after `{children}`); removed the homepage mount + import. Renders `null` until opened → no SSR/SEO impact.
  First-visit (`maybePromptFirstVisit`) + `CityPrompt` stay homepage-specific.
- [x] **W2 — Centralized town switch.** `lib/town-switch.ts` `resolveTownSwitchUrl` (category-preserve, else
  `/{newSlug}`; 3 unit tests) + `lib/use-select-town.ts` `useSelectTown()` → `selectTown` = `setCity` (persist)
  + `closeSelector` + `router.push(target)` (skipped when target === current path). Modal + `CityPrompt` now
  call `selectTown`. City-landing keeps raw `setCity` (URL → active town, no nav).
- [x] **W3 — Modal redesign.** Compact searchable picker: clean header (pin + title + close X) + search field +
  province-grouped list + town-accent selected state + check icon; a11y (role=dialog/aria-modal, focus search
  on open, ESC, body-scroll lock, real `<button role=option>`); mobile bottom-sheet. New FR strings.
- [x] **W4 — Verify.** type-check + ESLint + **54 tests** (51 + 3 new) green. **SSR confirmed:** `/`,
  `/lubumbashi`, `/categories`, and a real PDP `/kolwezi/…` all 200 with **0** `role="dialog"` in raw HTML.

### Mobile (buyer-mobile) — DONE
- [x] **M1 — Searchable city screen.** `city_selection_screen.dart` → `ConsumerStatefulWidget` with a search
  `TextField` filtering the province-grouped list by name/province + a no-results state; ARB
  `citySearchPlaceholder` / `cityNoResults` (+ gen-l10n). Also fixed the screen's pre-existing `withOpacity`
  deprecation. `flutter analyze` clean + 84 tests.

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
