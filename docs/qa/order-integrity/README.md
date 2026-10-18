# Order integrity QA evidence — 2026-10-17

All names, phone numbers, addresses and orders shown here are synthetic.
The full acceptance report, implementation decisions, limitations and rollback
plan are in [the initiative tracker](../../order-integrity-printing-app-promotion.md).
These artifacts are test samples, not customer documents or fiscal invoices.

| Evidence | What was actually verified |
|---|---|
| [Short delivery note](bon-livraison-court-qa.pdf) | Chromium browser print, A4, 3 items, one page; every page visually reviewed |
| [Long delivery note](bon-livraison-long-qa.pdf) | 80 items over five A4 pages; every page inspected, repeated headers and intact final totals/signatures |
| `delivery-preview-{320,390,768,1440}.png` | Actual admin production-build preview at four CSS widths, fixture API responses |
| `delivery-collected-preview.png` | Collected COD clearly distinguished from cash still due |
| [Real API preview](delivery-real-api-preview.png) | Real local admin session/API/PostgreSQL, original item-price/address snapshots after live edits; print causes no order/payment/audit writes |
| `buyer-{confirmed,cancel-dialog,cancelled}-web.png` | Real buyer order cancellation through the UI, real API POST; follow-up GET deliberately fails with 503, authoritative cancelled state remains visible |
| [Seller stock conflict](seller-stock-conflict-web.png) | Real stale stock edit returns 409 after cancellation restores 8→10; refetched stock is 10, typed price retained, database price unchanged |
| `seller-cancelled-order-web{,-mobile}.png` | Real seller API shows cancelled order with no stale confirmation/rejection controls; existing item table scrolls horizontally on narrow screens |
| `promo-{chromium,webkit}-{iphone-320,iphone-390,android-360,android-430,ios-chrome}.png` | Actual compiled buyer component with real synthetic BUYER auth, phone/UA emulation; readable card and 44px controls, no sticky overlay |
| `buyer-{confirmed,paid,cancelled,processing}-native.png` | Actual iPhone 15 Pro / iOS17 rendering of the shipping order screen with controlled repository states, separate QA bundle; not a native API journey or manual taps |

The local `/seller` QA base path exposes an existing sidebar logo path issue;
production uses its configured subdomain base path. It is unrelated to the stock
change. WebKit preview tests adapted only localhost HTML transport to avoid
the existing production HTTPS-upgrade directive on an HTTP-only QA server.
Production CSP source was preserved. WebKit does not expose Apple-domain native
handoff even for a plain anchor; correct href and ordinary external navigation
were tested, actual App Store installation/opening was not.

## Automated checks

Use existing dependencies, build shared first, and run tests without loading
production environment files:

```sh
pnpm --filter @teka/shared build
pnpm type-check
pnpm --filter api test -- --runInBand
pnpm --filter buyer-web test
pnpm --filter seller-web test
pnpm --filter admin-web test
```

Endpoint tests use `test/jest-e2e.json` with synthetic `NODE_ENV=test` and a local
test `DATABASE_URL`; their database layer is mocked. The opt-in real PostgreSQL
suite is `pnpm --filter api test:pg`, with `TEKA_INVENTORY_PG_URL` pointing only to
a disposable localhost database whose name contains `test`, with the Prisma
schema already applied. Its guard rejects nonlocal URLs and the configured
application database. Never point it at development-cloud or production data.

Run `flutter test --no-pub` and `flutter analyze --no-fatal-infos lib test` in
each mobile application. Seller's bounded full rerun used `--concurrency=2`;
the tracker preserves the two original high-parallelism photo-test failures.

Final counts: API 1,335 unit / 290 endpoint, opt-in PostgreSQL 17 plus 15
independent actual-service checks, seven additional report fixtures; buyer web
278, seller web 53, admin web 105; buyer Flutter 527, seller Flutter 509 on its
bounded full run. Both mobile analyzers have only unchanged informational
findings. All four existing Dockerfiles built. Root autofix lint was not run;
the remaining existing API lint findings are non-blocking maintenance debt:
standard CI gates type checks, and pr-validation explicitly continues on lint failure.

Public homepage/contact/product SSR, index/follow and canonical/JSON-LD data
were inspected for guest and BUYER sessions. Six local mobile observations had
CLS 0, including 500ms delayed authentication. This is not field performance data.

Native buyer and seller launch and real client/server journeys now pass on both
iOS and Android; see the follow-up evidence below. Physical Android/iPhone store
workflows, native Safari print pagination, signed distribution and GitHub CI remain
unverified.

Follow-up native and isolated browser QA is recorded in
[native-followup/README.md](native-followup/README.md) and the existing initiative
tracker. The fresh real web flows and full promotion matrix passed again; the
new database-backed 80-line delivery note also passed exact COD and zero-write
checks. Accepted native driver results and inspected screenshots are recorded in the
follow-up evidence. Each application uses one continuous mounted journey; named
scenario counts are not independent testWidgets counts.


## Focused security verification — 2026-10-18

The accepted feature/native QA above is preserved. Current dependency versions,
all advisory paths, tests, six unresolved temporary risk acceptances through
**November 17, 2026**, and the completed Docker verification are recorded in
[security-remediation.json](native-followup/security-remediation.json) and the
[initiative tracker](../../order-integrity-printing-app-promotion.md#focused-security-remediation--2026-10-18-final-assessment).

Independent post-update checks: API **1,335 unit / 322 endpoint** (32 new proxy
regressions), PostgreSQL **17**, Buyer/Seller/Admin web **278/53/105**, relevant
Flutter **91/67**, both analyzers passing with unchanged info findings. Three host
Next production builds and the Node 20 API Docker build pass; all three Node 20 web images now pass after the owner's additional disk cleanup.
Their actual standalone root/robots and portal login routes pass HTTP smoke checks;
Sharp 0.35.5/libvips 8.18.7 processes PNG and SVG→WebP on Linux arm64. Affected driver
modules are absent. Existing caches were reused; no Docker pruning occurred.
GitHub candidate CI remains unrun until separate Git authorization.

The exact enforced high-severity production audit passes exit 0; JSON/full-tree
audit findings remain visible. Sentry memory-transport probes exercise real
shipping configuration without sending telemetry. No affected driver module or
active affected operation was found. Local-root tracing is sampled out, but
incoming sampled parents can be inherited; driver absence is the residual risk
justification. Physical store handoff/native Safari printing remain unverified.
No commits, deployments, production data writes or mobile publication occurred.


## Local Git review — 2026-10-18

The accepted 195-path scope is now included in six local commits on
`codex/order-integrity-release-review`, based on develop `9e6bd60`. The
[local handoff](../../order-integrity-printing-app-promotion.md#local-review-branch-and-structured-commits--2026-10-18)
records the history, final focused checks and unchanged security/physical limits.
No remote or production action occurred. Source bytes match accepted QA; prior
expensive build/native/PG results were retained. Commit 6 identifies itself by the
review-branch tip; resolve all six exact hashes with the recorded read-only Git
command. Push and PR creation still need explicit owner authorization.
