# Seller / Admin UX modernization

Started 2026-09-03. Scope order: **Seller Mobile → Seller Web → Admin**.
Baseline: `develop` at `6e6d151`. First branch: `codex/seller-mobile-ux-foundation`.
This is an incremental initiative, not a completed redesign. `STATUS.md` owns the live checkpoint;
this document owns the audit, decisions, phase deliverables and verification record.

## Phase 0 — source audit (before visual changes)

Read `STATUS.md`, `PROGRESS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, the mobile-navigation,
order-workflow, seller-product-loading/images/notifications and buyer-splash references.
Inventoried all seller routes, their screen composition and shared components; traced API
transitions and existing tests. Web/admin inspection is architectural and representative,
not a full browser audit. Visual defects below are source risks until reproduced in QA.

### What already works

- Material 3, French framework localization, Modern Ruby `#C8102E`, pale neutral page backgrounds,
  semantic text/icon status badges, consistent 8/12/16/24 spacing in much of the app.
- Persistent five-branch `StatefulShellRoute.indexedStack` keeps tab state; root detail routes use
  `AdaptiveLeading`. Keep their route structure and PostHog observers.
- Profile has useful section grouping, separated account-deletion controls and confirmations.
- Product image manager is shared between edit and dedicated images; compression, maximum-eight
  handling, permission/error messages and API ownership checks already exist.
- Auth-gated initial requests prevent the previous startup 401 race. Preserve Dio interception,
  offline mutation blocking, notification routing, secure storage and analytics identity scrubbing.
- Product statistics and order statistics are already computed across all seller-owned records by
  the API. Seller Web already consumes order statistics.

### Main findings and priorities

| Priority | Root issue / evidence | Proposed treatment |
|---|---|---|
| P1 | Home counts `sellerOrdersProvider.orders`, a filtered page of 20; filters/pagination change the apparent pending work | Use `/v1/sellers/orders/stats`, independent of lists; never display failed/loading reads as zero |
| P1 | Home product stats default to zero on failure/loading; product feed errors look empty | Explicit loading/error states, retain last successful data only with visible refresh failure |
| P1 | No dedicated action center; rejected-product count exists in API but is dropped by the Flutter model | Add small prioritized dashboard queue with filtered destinations and post-mutation refresh |
| P1 | Both list filters have fixed 52 px height including padding; card Rows pack unbounded dates, money and badges | Content-height filters, wrapping metadata, readable status pills, tests at 320 px / 2× text |
| P1 | Amber/green/red status text uses bright fill colors on tinted backgrounds, often 10 px | Separate accessible foreground/background tones, preserve label + icon meaning |
| P1 | Splash is 300 logical px wide; config still `fullscreen: true`, inconsistent with corrected native files | Separate native-assets lot; density-safe ~160 px mark, preserve status bar guard |
| P2 | Home gradient hero + decorative chips + four colored navigation cards bury useful work and product creation | Compact greeting, action queue first, restrained neutral sections and one main CTA |
| P2 | Empty filtered products say there are no products; errors discard available French provider message | Distinguish no results from empty catalog and provide recovery actions |
| P2 | Most loaders are isolated spinners; retry/empty widgets repeated; load-more errors are invisible | Small reusable state components, list-shaped static placeholders, visible retry footer |
| P2 | Theme lacks FilledButton/Card/dialog/bottom-sheet consistency; many screens override it | Adopt small primitives incrementally, avoid changing all forms through a global theme in one lot |
| P2 | Several auth forms use fixed-height Columns/buttons, tiny gesture links, unlabelled password icons | Dedicated form pass with keyboard, text scale and semantics verification |
| P2 | Seller help/support has no route or profile entry (messaging was retired) | Inspect existing support contract before adding a destination; do not revive messaging |

### Seller Mobile screen inventory

Paths below are relative to `apps/seller-mobile/lib/features/` unless a full location is given.
All are source-reviewed; runtime coverage is recorded separately, never implied by this table.

| Screen / entry point | Findings and intended treatment |
|---|---|
| Native launch | See splash investigation below; no Flutter splash/delay exists |
| `auth/.../login_screen.dart` | Scrollable SafeArea is good; 72 px top + 48 px gaps, one-line registration Row, 48 px fixed submit; inspect small screen/keyboard, label visibility toggle |
| Register | Scrollable but name fields share a Row, helper labels and submit height constrain scale; keep register→application flow |
| Forgot password | SafeArea + non-scrollable form/success Column risks keyboard overflow; preserve neutral anti-enumeration response |
| Reset password | Same fixed Column problem; retain invalid-token recovery and password rules |
| Wrong role | Centered Column + two fixed buttons; large-text risk, retain explicit logout/register escape |
| Seller application | PENDING review panel, REJECTED reason, KYC/city/commune form; long dropdown labels and pending panel need responsive QA; approval gate stays |
| `home/presentation/home_screen.dart` | Action hierarchy/count defects above, no recent-product error, 2-column fixed-ratio stats, narrow trailing badge |
| Orders list | Fixed-height filters; missing received/returned/legacy-shipped choices; empty state lacks refresh; add recovery and all existing statuses |
| Order detail | Existing confirmation/reason dialogs + SafeArea action strip are valuable; price/item/status Rows and duplicate status presentation need scale QA; generic errors; financial copy incorrectly implies immediate availability despite return hold |
| Order action buttons | Correct final seller transition is PROCESSING→READY; fix French accents in later detail pass, preserve disabled/busy gating |
| Products list | Search debounced, but clear control does not rebuild when typing; filtered-empty copy wrong; city + status/date Rows overflow; FAB lacks tooltip |
| Product detail | Good rejection banner + editable/archived/suspended action distinctions; unbounded category/specification/price/status Rows; generic retry; mutations inconsistently invalidate dashboard |
| Product create | Category first; images deliberately follow first save (no id yet); weak section grouping, two narrow price fields, fixed save button |
| Product edit | Shared images + active-content re-review notice good; same form risks; direct edit URL depends on `extra` and can build create mode — separate navigation/data fix |
| Category sheet | Recursive tree/search is useful; non-Flexible heading, no retry, missing accents, keyboard/SafeArea to verify; search permits branch selection unlike tree (API validates leaf) |
| Brand selection | Native dropdown preserves convention; missing `isExpanded`, errors silently hide field; changing categories can race old responses |
| Characteristics | Appropriate native fields, Wrap multiselect; long select options, required error text; attribute-load failure looks like no attributes |
| Image screen / camera / gallery | Shared manager, SafeArea source sheet and delete confirmation retained; icon-only add/delete semantics and fixed 3-column grid need attention |
| Quantity / pricing | Keep API centime conversion and new-only contract; USD uses `double.parse`, generic save error; group fields and clarify optional currency without domain rewrite |
| Notifications | Feed + entity links retained; `state.error` is not rendered, empty view appears after failure; long AppBar “Tout marquer…” competes with title; no pagination beyond 30 |
| Profile | Best section pattern; identity ellipsizes, gradient still dominant; support entry absent; preserve confirmed logout |
| Personal info | Good SafeArea save bar and avatar tooltip; assess large titles, saving/error and keyboard |
| Shop profile | Good server-controlled edit restrictions; safe bottom save; long city text partly handled, verify form validation |
| Notification settings | Distinguishes backend prefs from OS permission; preserve OS explanation; improve shared state layout only |
| Security / sessions | Separate sensitive zone good; header/session trailing buttons can crowd; retain revocation/password behavior |
| Account deletion | Required password + typed confirmation + dialog + server blockers; keep behavior and separation; verify long final button |
| Earnings / wallet | Preserve API balances and 2-day hold; fixed header above TabBar may crowd short screens, long money rows need QA |
| Request payout | Scrollable, existing minimum/pending rules; keep operator/contact domain and submission gating; improve errors/labels |
| Promotions list / create | Keep approve/cancel flow; long segmented-control text, fixed empty spacing and incomplete date error messages need later pass |
| Reviews | Existing product filter/stars; rating histogram horizontal density and pagination/empty copy to review |
| Push/deep links | Order, product, reviews and notification routes mapped and tested; keep mapping. Detail freshness must integrate action-count invalidation later |

### Seller Web / Admin reconnaissance (no redesign in this lot)

Both are Next App Router with Tailwind v4, local page state, auth providers and responsive sidebars.
Their token blocks match the seller palette; `:focus-visible` exists. Seller sidebar changes at `md`,
Admin at `lg`; desktop conventions/table scrolling must be retained. Both use mixed Unicode/emoji
navigation icons, repeated in-page button/card/table styling and large hero sections. Admin's long
sidebar has scrolling and useful seller/product moderation counters, but needs grouped navigation
and denser, clearer hierarchy. Inspect focus trap/Escape/return focus for mobile drawer and dialogs
in the later browser audit. Tables, filters and pagination must stay keyboard reachable.

Seller order summary already calls `/v1/sellers/orders/stats`; verify filtered links when adding the
shared action terminology. Seller product counts still issue separate filtered-list reads, whereas
mobile has a stats endpoint. Admin has authoritative `orderOps` counters and own post-pickup duties.
Do not mix its work queue with the seller's. Reports/CSV/search analytics were just released: keep
queries, report windows, CSV hardening and accounting logic untouched.

Confirmed `robots.index=false`, `follow=false`, and `robots.ts` `disallow: '/'` on both private sites.
Buyer metadata, sitemap, canonical and structured data are outside scope.

### Authoritative action lifecycle (code + existing test evidence)

`SellerOrdersService` validates ownership and explicit current states, writes transition logs and
retains notifications/analytics. `order-workflow.constants.spec.ts` tests legal/illegal edges,
legacy completion, buyer cancellation cutoff and return-window behavior. There is no dedicated
seller-orders service stats spec yet; add it when integrating the action center.

| State | Responsible party / next step | Action-center treatment |
|---|---|---|
| PENDING | Seller confirms or rejects with reason (stock restored on rejection) | « Commandes à confirmer » first |
| CONFIRMED | Seller starts preparation | « Commandes à préparer » |
| PROCESSING | Seller finishes packaging and marks ready | « Préparation à terminer », explanation points to ready-for-collection action |
| READY_FOR_TEKA_PICKUP | Teka collection, seller transition is finished | Optional informational follow-up, excluded from required-action total |
| RECEIVED_AT_TEKA / OUT_FOR_DELIVERY / legacy SHIPPED | Teka delivery / cash collection | Tracking only |
| DELIVERED / CANCELLED / RETURNED | Completed, cancelled or returned; admin handles return decisions | No seller action inferred |
| Product REJECTED | Seller corrects; update→DRAFT; explicit submit→PENDING_REVIEW | « Produits à corriger » links to rejection detail/list |
| Product DRAFT | Optional work in progress, not rejection or urgent obligation | Separate drafts shortcut; do not imply it is ready to submit |
| Product PENDING_REVIEW | Admin reviewing | Informational only |
| Product SUSPENDED | Seller cannot edit directly; admin decision | Explanation/support, not “corriger” task |
| Product ACTIVE quantity=0 | Stock issue; API validates and owns stock | Future count/filter support required; no invented low-stock threshold |
| Seller PENDING / REJECTED application | Onboarding gate already handles review/resubmission | Keep outside approved-seller dashboard |

**API decision:** no new endpoint or schema required for the initial action center. Reuse
`GET /v1/sellers/orders/stats` (`byStatus` + authoritative summary) and
`GET /v1/sellers/products/stats` (already includes `rejected`). Extend only the Flutter model to read
that existing field. Distinct current-status order buckets permit exact single-status list links;
no client-side counting of paginated records. No SLA/age urgency exists: label order priority without
inventing deadlines. A later stock task needs an explicit API count and matching filter, plus tests.

Refresh design for next lot: one auth-scoped shared provider per stats endpoint; refresh after
successful order/product mutations, on relevant existing push events and foreground resume; no
periodic polling. Await dashboard pull-to-refresh. Cover same-user filter independence, session
changes, request races, failures and successful task completion. Do not use unread-notification
counts as task counts. Add query-driven list entry points without replacing tab navigators.

### Splash investigation (source evidence, not cold-launch verification)

- `flutter_native_splash` 2.4.x config points at `logo_teka_cd.png` (1200×240).
- iOS native outputs are 300×60 / 600×120 / 900×180: a **300 pt wide** logo at every density;
  Android mdpi–xxxhdpi follows the same logical size. Large perceived size is supported by assets;
  upscaling/source blur is not yet proven. iOS storyboard centers the asset; no stretch transform found.
- Unused `splash_wordmark.png` is 1300×320; its presence is not proof it is a suitable crisp source.
- Android 12 uses a white glyph on white, with no icon-background color; invisible brand likely.
- `fullscreen: true` in the generator config conflicts with native files that intentionally removed
  fullscreen/status-bar flags. Regeneration would reintroduce the old hidden-status-bar regression.
- Buyer Mobile already solved this with a padded 1200-square source (visible wordmark ~160 pt),
  `fullscreen: false`, contrasting Android 12 icon background, API 33 light/dark sidecars and tests.
  Reuse the method while preserving Seller's charcoal identity. Do not generate/edit a logo with AI.
- Cold-launch screenshots/video on iOS and Android remain for the separate native-assets lot.

### Visual direction and review boundaries

Keep Modern Ruby for primary actions/selection; use neutral cards with clear borders, minimal
shadows, native typography, 16 px content gutters, 12–16 px card padding and 24 px section gaps.
Reserve semantic colors for status, with readable dark text on pale backgrounds. Labels and icons
carry meaning independently of color. Do not add fonts, animation packages or frameworks.
Use natural-height layouts, ≥48 px interactive controls and scrollable recovery states.

1. **Mobile foundation / operational lists (current lot):** reusable filter/state/status presentation;
   orders/products list readability, French labels, recovery, text scale and no-results distinctions.
   No API, auth, global theme or native splash changes; status-pill improvement also reaches existing
   mobile detail/home consumers and requires targeted smoke checks.
2. **Mobile action center:** API stats binding/tests, home hierarchy, filtered routes, invalidation and
   push/resume freshness; deferred draft transition semantics above remain explicit.
3. **Mobile forms/details + secondary routes:** category/brand/attribute loading and navigation issues,
   keyboard/dialog/confirmation QA, notifications, account, earnings, promotions, reviews, support.
   Split by feature if broad. Keep backend/domain parity checks for every behavior change.
4. **Native splash:** source/config/generated assets and status-bar regression checks; cold launches.
5. **Mobile stabilization gate:** remaining screen/edge-case runtime matrix and full regression.
6. **Seller Web**, then **Admin**, then cross-platform release-readiness; each needs its own source +
   browser audit, tests, limitations and small PR into `develop`. Never auto-deploy/merge to main.

## Verification record / current checkpoint

- Baseline analyzer: exit 0, 17 existing info-level notices, no warnings/errors.
- Baseline full Flutter suite: **42 passed**.
- Available runtime: iPhone 17 Pro iOS 26.5 booted; Android `emulator-5554` available.
  Sandbox cannot reach CoreSimulator directly; approved command escalation restores access.
- No production data, API, auth, database or frontend files changed during audit.
- The scoped foundation lot is implemented and locally verified; see the checkpoint below.
  The overall initiative and the remaining mobile work are **not complete**.


## First foundation lot — implementation and phase deliverable (2026-09-03)

| Deliverable | Result |
|---|---|
| 1. Audit findings | Phase 0 report above: full seller route inventory, representative web/admin review, lifecycle and splash investigation |
| 2. Root issues | Fixed-height filters, cramped card Rows, low-contrast status text, indistinguishable empty/error states, stale search-clear debounce |
| 3. Design decisions | Natural-height single-selection filters; neutral outlined cards; title/status/contact/metadata/amount hierarchy; dark status foregrounds; static list skeletons |
| 4. Changed files | Mobile files listed below, this report, STATUS/PROGRESS and three fixture screenshots |
| 5. API changes | None. No schema, DTO, endpoint, domain transition or provider/repository change |
| 6. Seller Mobile | Orders/products lists improved; recovery works on empty/failed/filtered lists; existing product/order badges share accessible presentation |
| 7. Seller Web | Source-audited only; no changes |
| 8. Admin | Source-audited only; no changes |
| 9. Tests | **69 passing** (42 existing + 27 focused); analyzer exit 0 with **17 pre-existing infos**, zero warnings/errors; scoped formatter and diff checks pass |
| 10. Runtime verification | Real list widgets + theme + five-tab shell rendered on iPhone 17 Pro (iOS 26.5) and Android emulator (API 34); see matrix below |
| 11. Unverified screens | Auth, real home, details, create/edit forms, profile, secondary routes and native splash not runtime-certified by this lot. No signed-in API integration, real camera/gallery, push, or physical-device QA. Browser QA intentionally deferred |
| 12. Accessibility | Status text contrast ≥4.5:1; icon + label retained; 48 px filter/recovery targets; Flutter target/label guidelines pass; 320/390/834 px at 1×/2× tested. Native screen-reader interaction not tested |
| 13. Performance | No new dependencies, fonts, polling or stat calls. Lists remain builder-based; skeletons static. Search keeps 350 ms debounce and cancels it on clear/submit. No production performance claim from debug emulators |
| 14. Security | Existing API/auth/approval/ownership/offline/analytics code untouched; preview refuses non-development/non-debug execution and uses local fixtures only |
| 15. Risks | Existing home counts remain unreliable until next lot; bottom navigation still truncates Commandes at 2×. Badge consumers outside lists pass existing tests but need later full visual review. Low host disk space interrupted native builds |
| 16. Follow-ups | Action center + stats refresh, then mobile forms/detail/notifications/splash; full screen matrix before web/admin |
| 17. PR/commit | Draft [#634](https://github.com/ipanga/teka-rdc/pull/634) → develop; implementation `90a3938`, branch `codex/seller-mobile-ux-foundation`. Remote CI pending at checkpoint. No merge or deployment |
| 18. Exact next step | Add auth-scoped order stats provider and parse existing product `rejected` count, with repository/provider tests; implement dashboard action queue + exact filtered routing and post-task/push/resume refresh |

### Source files in this lot

Under `apps/seller-mobile/`:

- `lib/core/theme/teka_colors.dart`: additive dark status text tones; existing palette unchanged.
- `lib/core/widgets/seller_status_badge.dart`: shared presentation, domain mapping stays in callers.
- `lib/core/widgets/seller_filter_bar.dart`: content-height single-selection horizontal filters.
- `lib/core/widgets/seller_list_state.dart`: scrollable recovery content and static loading placeholders.
- `lib/features/orders/presentation/screens/orders_list_screen.dart`: filter/list/state integration,
  existing received/returned/legacy-shipped filters now reachable, retry footer, empty refresh.
- `lib/features/orders/presentation/widgets/order_card.dart`: wrapping hierarchy and full order number/name.
- `lib/features/orders/presentation/widgets/order_status_badge.dart`: dark tone mapping and French accents.
- `lib/features/products/presentation/screens/products_list_screen.dart`: same foundation, search
  semantics/debounce reset, filtered-empty distinction, full-width metadata, clear/new-product tooltips.
- `lib/features/products/presentation/widgets/status_badge.dart`: shared badge presentation.
- `test/features/lists/seller_lists_test.dart`: 27 focused layout/interaction/accessibility tests.
- `test/support/seller_list_fixtures.dart`: in-memory repositories used by tests and preview.
- `tool/seller_ux_preview.dart`: reproducible development/debug-only preview. Not imported by `main.dart`.

### Runtime evidence and exact limits

All screenshots use **synthetic local fixtures**, not production records. The preview renders the
actual two screen classes and `SellerMainShell`; its home/earnings/profile tabs are QA controls,
and its detail/create destinations are explicit placeholders. Therefore navigation tests prove the
chosen destination, **not the real detail/create flow**. No credentials, API calls, production
mutations, authentication bypass in application code or analytics initialization were used.

| Runtime | Verified |
|---|---|
| iPhone 17 Pro, iOS 26.5 | Actual product and order lists, normal text, status bar, bottom bar/safe area, long names/money, missing images; screenshots visually inspected |
| Android emulator API 34 | Same lists and tab switching; error state, retry→data; 2× product cards; keyboard + no-results search; empty orders and loading products; screenshots visually inspected |
| Widget harness | 320/390/834 px × 1×/2×, scroll; 320×568 + 240 px keyboard inset; filtered recovery; received-by-Teka filter; clear search cancels debounce; create/detail route targets; pagination error recovery; loading semantics; tap/label guidelines; contrast |

Persisted representative screenshots:
[Products / iOS](qa/seller-mobile-ux/products-ios.png),
[Orders / iOS](qa/seller-mobile-ux/orders-ios.png),
[Search + keyboard / Android 2×](qa/seller-mobile-ux/search-android-2x.png).
Additional local screenshots are `/tmp/teka-seller-ux-{error,error-large-text,products-large-text,empty-large-text,loading-large-text}-android.png`.

No Flutter overflow/error was observed in those list checks. Android debug startup did report
skipped frames and existing native-plugin warnings (including the deliberately absent PostHog
key), so this is **not** a frame-time/performance certification. Native build warnings concern
existing Swift Package Manager/Kotlin migration debt; no dependency upgrade was attempted.

Disk exhaustion interrupted the first builds on both platforms and a later iOS hot restart.
Removed only ignored Seller Mobile compilation intermediates and old compiler caches; source,
packaged outputs, user files and installed production apps were preserved. Both native preview
builds subsequently succeeded. Additional iOS 2×/small-phone and cold-launch QA remain pending.

### Reproduce and resume

From `apps/seller-mobile`:

```sh
flutter test --no-pub
flutter analyze --no-pub --no-fatal-infos lib test tool
flutter run --no-pub --flavor development \
  --dart-define-from-file=flavors/development.json \
  -t tool/seller_ux_preview.dart -d <simulator-or-emulator-id>
```

Use Accueil in the preview to choose Données/Vide/Erreur/Chargement or switch 1×/2× text, then
open Commandes/Produits. Filtering and retry use only in-memory repositories. For real app QA,
use `lib/main.dart` and the documented development environment; this preview does not certify auth.

**Phase boundary:** local foundation work is ready for review. Do not label Mobile stable or begin
Seller Web/Admin implementation. The next branch should build the action center on authoritative
stats and fix its refresh/navigation tests; then handle the remaining mobile screen risks above.


## Seller Mobile action center — second lot (2026-09-03)

Branch `codex/seller-mobile-action-center`, based on foundation `f9a5da1`. Foundation PR #634 is
still open; all its remote CI/CodeQL checks passed. This lot is draft PR [#635](https://github.com/ipanga/teka-rdc/pull/635) into `develop`, implementation
commit `c3c5805`, and includes the foundation until that prerequisite merges. Review the action-center commit
separately, then re-check the diff after #634 lands. Nothing merged or deployed here.

### Delivered behavior and authority

| Action | Authoritative source | Destination and completion |
|---|---|---|
| Commandes à confirmer | order stats `byStatus.PENDING` | `/orders?status=PENDING`; confirm or reject via existing detail actions |
| Commandes à préparer | order stats `byStatus.CONFIRMED` | `/orders?status=CONFIRMED`; begin preparation |
| Préparations à terminer | order stats `byStatus.PROCESSING` | `/orders?status=PROCESSING`; mark ready for Teka pickup |
| Produits à corriger | product stats `rejected` | `/products?status=REJECTED`; read rejection reason, edit, then existing explicit submit |

Counts use the existing seller-owned, non-deleted, global aggregation endpoints. No new business
state machine, SLA, schema or endpoint was added. READY_FOR_TEKA_PICKUP and later fulfillment are
Teka's responsibility; DRAFT and PENDING_REVIEW are catalogue information, not urgent tasks.
No unsupported "overdue" or stock urgency is invented. Seller Web already consumes these APIs;
its action-center presentation remains the next platform phase, without a contract mismatch.

Requests are keyed by authenticated account ID, not only auth status; outer providers expose
loading while identity is unavailable. Old account responses cannot populate the new account's
counts. Lists recreate on identity change and ignore superseded/disposed request completions.
A task opens a freshly loaded exact-status queue, clears any product search (including its pending
debounce), and avoids a redundant initial unfiltered fetch. Status query values are allowlisted;
unknown values resolve to all items. Chip/reset actions keep query and provider state consistent.
Successful repository mutations invalidate only the relevant stats. List refreshes retain the
current filter instead of recreating the notifier. Detail caches refresh when revisited and follow
repository identity changes. Pull-to-refresh awaits both independent stats requests; errors stay
visible in their affected sections and are never presented as a successful empty queue.

Foreground FCM receipt, background/local notification taps and true background→foreground resume
signal refresh through a small seller-only invalidation notifier. A fixed 300 ms window coalesces
push/resume bursts; successful mutations invalidate immediately. No timer polls in the background.
Native push delivery is still a real-device validation item; tests exercise payload/lifecycle
invalidation without Firebase, credentials or tokens. Existing notification routing/registration,
Dio interception/offline blocking, API transition guards and PostHog event ownership are unchanged.

### Phase deliverable

| Required item | Result |
|---|---|
| 1. Scope | Seller Mobile home/action queues and their list/refresh integration; backend stats regression tests only |
| 2. Audit | Prior Phase 0 findings reproduced: paginated counts, lost filters after actions, pending search hiding rejected products, enlarged bottom labels, detail price/images overflows |
| 3. Implementation | Compact greeting, actions first, neutral catalogue/shop sections, explicit states, Material 3 navigation, authoritative session-scoped counts, correct routes and refresh |
| 4. Files | `home_screen.dart` + `seller_dashboard_provider.dart`; `seller_refresh_provider.dart`; auth identity selector, order stats model/repositories, list providers/screens/models/router/shell; push controller and app lifecycle hook; mutation refresh call sites; focused tests + local preview |
| 5. Database | No schema, migration, `db:push`, seed or data mutation |
| 6. API | Existing endpoints consumed unchanged; `seller-orders.stats.spec.ts` verifies owner/deleted scope, global aggregation, empty and failed reads |
| 7. SEO | Buyer routes/metadata and seller/admin noindex untouched |
| 8. Tests | 93 Seller Mobile tests (24 added over foundation); 3 targeted API stats tests; Flutter analyze exits 0 with the same 17 infos, no warnings/errors |
| 9. Builds | Development Android APK and iOS simulator preview builds succeeded; updated UI hot reloaded on both |
| 10. Visual QA | iOS normal-text home/safe areas; Android home→pending list→real detail→confirm→home, 25→24 pending and 1→2 confirmed; 2× actions/catalogue scrolling and error screen |
| 11. Edge cases | >20 global counts independent of lists; same-status revisit; query reset; search debounce cancellation; failed mutation; failed stats/retry; empty queue; direct account switch/logout; late success/error/pagination; no polling; partial refresh waits for both endpoints |
| 12. Accessibility | Natural-height cards, full labels/counts, non-color task meaning, separate notification semantics, 320/390/834 × 1×/2× tests. Standard NavigationBar uses Flutter's bounded label scaling and scalable long-press tooltips; body respects system scaling |
| 13. Performance | Two small stats GETs for home, shared product request for actions/catalogue; no recent-product page fetched just to paint home; query entry avoids extra unfiltered request; no polling/dependency/font added |
| 14. Security | No auth/approval/role bypass in production; stats scoped by account; old list responses discarded; existing ownership, mutation and offline rules retained; fixtures development/debug only |
| 15. Risks/limits | Full auth/backend/FCM/camera/release performance not certified by isolated fixtures. Remaining detail/forms/accessibility and native splash audit items are still open. Existing native Kotlin/SPM debt and 17 analyzer infos remain |
| 16. Follow-ups | Remaining mobile forms/details + keyboard/error recovery, then native splash lot and full real-account runtime matrix before web/admin |
| 17. PR/commit | Draft [#635](https://github.com/ipanga/teka-rdc/pull/635) → develop, implementation `c3c5805`, dependent on #634; remote checks pending at documentation checkpoint |
| 18. Exact next step | Read STATUS and PR/check state, review foundation then action center; continue the scoped forms/detail lot from the Phase 0 route inventory. No main merge/deploy |

### Reproduction and evidence

`tool/seller_actions_preview.dart` renders the **real home, list and order/product detail widgets**
with real repository/provider logic against a Dio interceptor that simulates the existing API in
memory. `lib/main.dart` never imports the tool. Auth/storage, FCM and analytics are not initialized;
notifications are seeded separately. The order confirm flow mutates only this in-memory fixture.
Edit/images/new-product and peripheral destinations are explicitly labelled placeholders in this
preview; their full business flows remain pending. The earlier `seller_ux_preview.dart` is retained
for reproducing the foundation's long-content/list scenarios.

```sh
# From apps/seller-mobile
flutter test --no-pub
flutter analyze --no-pub --no-fatal-infos lib test tool
flutter run --no-pub --flavor development \
  --dart-define-from-file=flavors/development.json \
  -t tool/seller_actions_preview.dart -d <simulator-or-emulator-id>
# From apps/api
pnpm test -- --runInBand src/orders/seller-orders.stats.spec.ts
```

Open Profil in the preview for Données/Vide/Erreur/Chargement, 1×/2× and recovery controls; Accueil
returns to the real dashboard. Android API 34 and iPhone 17 Pro iOS 26.5 were used. The native debug
runners reported existing Kotlin/SPM warnings and Android emulator startup frame skips; no claim
about production frame times is made. No cleanup of user/source files was needed for this lot.

Representative persisted screenshots, all **synthetic data**:
[Action center / iOS](qa/seller-mobile-ux/actions-ios.png),
[Catalogue + navigation / Android 2×](qa/seller-mobile-ux/actions-catalogue-android-2x.png),
[Stats failure / Android 2×](qa/seller-mobile-ux/actions-error-android-2x.png).

The first-lot "home counters / truncated navigation" limitations above are historical and resolved
by this lot. Mobile is not yet declared fully stable; Seller Web/Admin implementation remains gated
on finishing the remaining mobile audit/QA items, including splash.

Both development preview runners were stopped after QA. No live automation or background task was created.
