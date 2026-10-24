# Native client/server QA — buyer + seller (opt-in)

Real screens, repositories and Dio chain of both Flutter apps against a **local, disposable**
API + PostgreSQL. Screenshots from these runs land in this folder as
`<app>-<platform>-<step>.png` (written by each app's `test_driver/integration_test.dart`).

Not part of the regular suites: `flutter test` runs `test/` only; these live in
`apps/{buyer,seller}-mobile/integration_test/` and run only through `flutter drive`.

## Safety (fail-closed, checked before any request)

`integration_test/support/qa_config.dart` refuses to start unless **all** hold:

- `TEKA_QA_ENABLED=true` and `FLAVOR=development` (explicit);
- `API_BASE_URL` is `http(s)://{127.0.0.1 | localhost | 10.0.2.2}[:port]/api` — no other host,
  no credentials, query or fragment in the URL;
- every fixture variable the scenario needs is present and well-formed (UUIDs, `+243…`
  phones, 6-digit OTP, e-mails).

Errors name the variable, never its value. No token, OTP, password or phone is printed; the
QA HTTP client has no logging interceptor; screenshots are never taken while a password or
OTP is typed.

Storage is **in-memory for the whole test process**: `FlutterSecureStorage` and
`SharedPreferences` are switched to their plugins' own test backends before the app reads
them. The installed `.dev` app's session, town and preferences on the device are neither
read nor written (if `flutter drive` replaces the `.dev` binary, its data directory is left
as is — nothing here clears data). Flutter's default driver teardown can uninstall
the app: always pass `--keep-app-running`. On Android its installer also has an
uninstall fallback after a failed update; for an existing owner app, build first,
install explicitly with `adb install -t -r` (stop on failure), launch it, and attach
with `flutter drive --use-existing-app=<forwarded VM service URI> --keep-app-running`.
Do not let the driver install or uninstall an existing owner app.

## What runs for real, and what does not

| Real | Not a native tap / not exercised |
|---|---|
| Buyer: town gate, OTP request + verify (dev mock WhatsApp code), PDP with FC price, add to cart, cart, 3-step COD checkout, order detail, cancel dialog + POST, error state + « Réessayer » | Some navigation uses the app's own GoRouter (`router.go/push(<known path>)`) instead of tapping tabs — marked `// router nav` in the tests |
| Seller: email/password login, order detail, « Refuser » with reason, « Confirmer » on a stale order, list row tap, product edit form + save (409), list error + « Réessayer » | Fixture orders for the seller run are placed by a helper buyer session through the real cart + checkout endpoints (not UI); buyer/admin cancellations "elsewhere" are real API calls |
| Every read, stock (always read back from `GET /v1/sellers/products/:id`), audit log, payment status | Retries the UI no longer offers (second cancel / second reject) are real **repository** calls, not taps |

Disabled in the test target (overridden with **unbound** instances; nothing else replaced):
the FCM push controller (no Dart-side Firebase init, no token registration) and, buyer only,
the App Links / Universal Links deep-link controller. `main()`'s Sentry / PostHog /
PushService init is not run (the development flavor ships without keys).

**Native Firebase auto-init is a separate matter — the Dart bypass alone does not isolate
it.** Android: the SDK's `FirebaseInitProvider` initialises from packaged `google_app_id`
resources (handled by the Android QA package build, below). iOS: the locked `firebase_core`
plugin configures `FIRApp` from a bundled `GoogleService-Info.plist` when the plugin
registers, before any Dart runs (handled by staging, below). Runs made before these
measures are **not** claimed free of native Firebase activity; their app-domain API writes
went to the local API only.

Test-only fault injection (`QaReadFault`, inserted first in the app's real Dio at runtime;
nothing in `lib/`): `failGets(path)` makes matching **GETs** fail like a dropped connection
(rejected in the request phase, so the app's retry backoff does not run for it);
`delayGets(path, d)` holds a GET to capture the loading state, then sends it for real.
Mutations are never faulted.

Taps on both platforms (Android and iOS) wait (real frames, bounded by `pumpUntil`) until
the target itself is hit-testable before the real `tester.tap` — e.g. the floating SnackBar
of the previous action (« Produit ajouté au panier ») covered the cart's bottom button on
both devices until it expired. No overlay is dismissed or bypassed; a blocker that never
goes away fails with « cible du tap dégagée ».

## Structure: one continuous journey per app

Each file is **one** `testWidgets` — a single app journey, not independent tests. The app is
mounted **once** and the named scenarios run in sequence on the same widget tree,
`ProviderContainer` and `GoRouter`, like one user session; `[QA] ▶ / ✔ <scenario>` markers
(fixed labels, no data) delimit them in the log. There is no test-framework teardown or
remount between scenarios. (An earlier layout used one `testWidgets` per scenario sharing a
container; there, provider-driven screens stayed stale until the next remount. The subsequent continuous journeys passed on both platforms; that earlier
observation was a harness lifetime artefact, not a confirmed shipping regression.)

| App | Scenarios, in order | Mounted |
|---|---|---|
| buyer | 1 town gate + OTP login + PDP + cart + COD checkout · 2 cancel from detail (+ refused repository retry) · 3 read failure + « Réessayer » + cancel refused after seller hand-over (+ admin cleanup) | once, after the real auth/towns startup |
| seller | 1 login · 2 reject (+ refused retry) · 3 buyer cancel detected on a stale « Confirmer » + admin cancel seen after a real pull-to-refresh · 4 stale stock 409 · 5 list read failure (real pull-to-refresh) + « Réessayer » · 6 loading (real « Retournées » chip tap, list GET held ~5 s then sent for real) + real empty « Retournées » state (read-only; fails if the API has any RETURNED order) | once, at the login screen |

The first failure ends the journey; scenarios 2+ also check the session before any fixture
write, so a failed login never creates test orders. Report results per scenario marker, not
as N independent tests.

**Cold-start coverage (buyer).** Before the single mount the harness starts the real auth
and town providers and waits until auth leaves `unknown` (empty in-memory token store →
guest) and the real `GET /v1/cities` completes. The router's town gate is then decided by
its *initial* redirect evaluation — same redirect code and states as shipping. Not covered:
the shipping cold-start ordering where those providers resolve *after* the first frame and
the gate is applied by a later `refreshListenable` re-evaluation (timing on slow devices).

**Screenshots** are taken after ~350 ms of real frames, so a SnackBar / dialog that an
assertion already matched has finished its entrance animation in the PNG (bounded, never
`pumpAndSettle`; never while an OTP or password is typed).

## Configuration (dart defines — temporary file, never committed)

| Name | Format | Buyer | Seller | Use |
|---|---|---|---|---|
| `TEKA_QA_ENABLED` | `true` | ✓ | ✓ | explicit opt-in |
| `FLAVOR` | `development` | ✓ | ✓ | from `flavors/development.json` |
| `API_BASE_URL` | `http://127.0.0.1:5050/api` (iOS sim) · `http://10.0.2.2:5050/api` (Android emu) | ✓ | ✓ | local API only |
| `TEKA_QA_BUYER_PHONE` | `+243XXXXXXXXX` | ✓ | ✓¹ | synthetic BUYER (UI login / fixture orders) |
| `TEKA_QA_OTP` | 6 digits | ✓ | ✓ | the development mock WhatsApp code |
| `TEKA_QA_SELLER_EMAIL` / `TEKA_QA_SELLER_PASSWORD` | e-mail / text | ✓ | ✓ | APPROVED seller owning the product |
| `TEKA_QA_ADMIN_EMAIL` / `TEKA_QA_ADMIN_PASSWORD` | e-mail / text | ✓ | ✓ | cleanup + "admin elsewhere" |
| `TEKA_QA_PRODUCT_ID` | UUID | ✓ | ✓ | ACTIVE product, in the city, delivery zone covered |
| `TEKA_QA_CITY_ID` | UUID | ✓ | — | town tapped on the town gate |
| `TEKA_QA_ADDRESS_ID` | UUID | ✓ | ✓¹ | the buyer's single address |
| `TEKA_QA_SELLER_FLOW_BUYER_PHONE` + `TEKA_QA_SELLER_FLOW_ADDRESS_ID` | optional pair | — | ✓ | second buyer for seller fixtures |

¹ Unless the optional pair is set. The API allows **3 OTP requests per phone per 10 min**:
a buyer run uses 1, a seller run uses 1. Running both apps on both devices within 10 minutes
with one phone exceeds it (429) — use the optional pair, or wait.

**Fixture effect:** each run resets the fixture product's stock to **10** through the real
seller endpoint (absolute reset guarded by `expectedQuantity`) and creates fresh orders it
then cancels/refuses. Nothing is mass-deleted; no order number/ID from a previous run is
reused. The product price is never changed (the 409 scenario rolls back).

Example temporary file (`/private/tmp/teka-qa/ios.json`; Android: same with
`"API_BASE_URL": "http://10.0.2.2:5050/api"`):

```json
{
  "TEKA_QA_ENABLED": "true",
  "API_BASE_URL": "http://127.0.0.1:5050/api",
  "TEKA_QA_BUYER_PHONE": "+2439…",
  "TEKA_QA_OTP": "……",
  "TEKA_QA_SELLER_EMAIL": "…",
  "TEKA_QA_SELLER_PASSWORD": "…",
  "TEKA_QA_ADMIN_EMAIL": "…",
  "TEKA_QA_ADMIN_PASSWORD": "…",
  "TEKA_QA_PRODUCT_ID": "…",
  "TEKA_QA_CITY_ID": "…",
  "TEKA_QA_ADDRESS_ID": "…"
}
```

## Run (one device at a time; from the app directory)

Later `--dart-define-from-file` files override earlier ones, so the QA file's
`API_BASE_URL` wins over the flavor file's.

```bash
# Buyer — iOS simulator (seller: same from apps/seller-mobile with its target).
# XCODE_XCCONFIG_FILE applies the simulator-only Pods deployment-target override
# (see "iOS: Xcode 27 Target Integrity" below) to THIS command only.
cd apps/buyer-mobile
XCODE_XCCONFIG_FILE="$(cd ../.. && pwd)/scripts/mobile-qa/ios-simulator-qa.xcconfig" \
flutter drive --flavor development -d 40754F6B-BC08-4713-80F8-6A18121A47E1 \
  --keep-app-running \
  --dart-define-from-file=flavors/development.json \
  --dart-define-from-file=/private/tmp/teka-qa/ios.json \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/buyer_order_flow_test.dart

# Buyer — Android emulator: build the ISOLATED QA package (see below), from the REPO ROOT
cd ../..
dart run scripts/mobile-qa/build_android_qa_apk.dart --app buyer \
  --defines /private/tmp/teka-qa/android.json \
  --target integration_test/buyer_order_flow_test.dart \
  --target-platform android-arm64
# → apps/buyer-mobile/build/codexqa/buyer-codexqa-dev-debug.apk
aapt2 dump badging apps/buyer-mobile/build/codexqa/buyer-codexqa-dev-debug.apk \
  | grep -E "^package:|application-label:"     # must say com.tootiye.teka.codexqa.dev / Teka QA

adb -s emulator-5554 install -t -r apps/buyer-mobile/build/codexqa/buyer-codexqa-dev-debug.apk
# Stop if installation fails; do not uninstall. Launch com.tootiye.teka.codexqa.dev and
# forward its Dart VM service port, then attach (does not install an app):
cd apps/buyer-mobile
flutter drive -d emulator-5554 --keep-app-running \
  --use-existing-app=<forwarded-VM-service-URI> \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/buyer_order_flow_test.dart

# Seller — same with --app seller, target integration_test/seller_order_flow_test.dart,
# apps/seller-mobile/build/codexqa/seller-codexqa-dev-debug.apk, package
# com.tootiye.tekaseller.codexqa.dev, label « Teka Vendeur QA ».
```

### iOS: Xcode 27 Target Integrity (simulator QA builds)

Xcode 27 rejects a deployment target below 15.0 as an error. The generated
`ios/Pods/Pods.xcodeproj` targets of the **locked** pods keep their podspecs' 9.0 / 13.0
(Flutter's `podhelper.rb` only removes the setting for pods that depend on Flutter;
libwebp / Mantle / SDWebImage / SDWebImageWebPCoder do not), so the simulator build fails
with « Target Integrity … set to 9.0, but the range … is 15.0 to 27.0.x » even though the app
itself targets 15.0.

`scripts/mobile-qa/ios-simulator-qa.xcconfig` sets
`IPHONEOS_DEPLOYMENT_TARGET[sdk=iphonesimulator*] = 15.0`. Xcode applies the file named by
`XCODE_XCCONFIG_FILE` to every target of that one build, above project / target settings.
Prefix only the explicit simulator QA command with it (absolute path) — never export it in
a shell profile. The Runner project, Podfile, Podfile.lock, pod versions, minimum OS
(already 15.0) and signing are unchanged; the `[sdk=iphonesimulator*]` condition makes a
device / archive build ignore it. No architecture override: `-d <booted simulator>` already
builds the active architecture only.

A permanent fix for normal builds on Xcode 27 (a Podfile `post_install` raising those pod
targets to 15.0) would change `Podfile.lock`'s `PODFILE CHECKSUM` and every shipping build —
a separate, reviewed change, not part of QA.

### iOS: Firebase-free staged bundle (before driving)

The generated simulator `Runner.app` contains a copy of `GoogleService-Info.plist` from the
normal project setup, which the native plugin uses before Dart starts. Stage a copy without
it (from the repo root, after the QA build):

```bash
dart run scripts/mobile-qa/stage_ios_qa_app.dart --app buyer   # or seller
# → /private/tmp/teka-ios-qa-<app>-XXXX/Runner.app (new 0700 directory)
cd apps/buyer-mobile
flutter drive -d 40754F6B-BC08-4713-80F8-6A18121A47E1 --keep-app-running \
  --use-application-binary=<staged Runner.app> \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/buyer_order_flow_test.dart
```

The tool refuses unless the source is exactly
`apps/<app>-mobile/build/ios/Debug-development-iphonesimulator/Runner.app`, its Info.plist
says `iPhoneSimulator` and the exact development bundle id (`com.tootiye.teka.dev` /
`com.tootiye.tekaseller.dev`), and the generated `ios/Flutter/Generated.xcconfig` (refused if
newer than the bundle) names the app's integration target with `FLAVOR=development`,
`TEKA_QA_ENABLED=true` and a loopback `API_BASE_URL` (defines decoded in memory, never
printed). It copies with `rsync -a --exclude=GoogleService-Info.plist` into a fresh directory —
no `--delete`; the original bundle, the project plist and every existing directory are left
untouched — then refuses if any `GoogleService-Info.plist` exists in the copy. It reads no
credential file (existence checks only) and prints presence booleans and the staged path.

Signing: these simulator artifacts are built with `CODE_SIGNING_ALLOWED=NO`; the tool signs
nothing. If a staged bundle carries `_CodeSignature` (the tool reports it), its resource seal
no longer matches after the exclusion; should the simulator then refuse it, the local fix is
an **ad-hoc** re-sign of the staged copy only (`codesign --force --sign - <staged app>`) —
never project certificates or profiles. Bundle identity and plist absence are re-verified by
Codex before driving; installs go only to task-created `.dev` simulator apps.

ATS: neither `Info.plist` declares `NSAppTransportSecurity`. Use the IP literal
`http://127.0.0.1:5050/api` in the iOS defines (not `localhost`); if requests are still
blocked as insecure, that is an ATS limitation to report, not to weaken in the shipping plist.

### Android: isolated QA packages (co-installable, existing apps untouched)

The installed `com.tootiye.teka.dev` / `com.tootiye.tekaseller.dev` are signed with a
different key than this machine's debug key, so a locally built `.dev` APK cannot replace
them (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) — and must not. The QA build therefore uses its
own package names, chosen by an **opt-in Gradle init script** and nothing else:

| App | Normal development | QA package (this mechanism only) | Label |
|---|---|---|---|
| buyer | `com.tootiye.teka.dev` | `com.tootiye.teka.codexqa.dev` | Teka QA |
| seller | `com.tootiye.tekaseller.dev` | `com.tootiye.tekaseller.codexqa.dev` | Teka Vendeur QA |

- **How the id is chosen:** `scripts/mobile-qa/codexqa-android.init.gradle` registers an
  AGP `androidComponents.onVariants` callback that, for the `development` + `debug`
  variant only, sets `applicationId` from a fixed namespace → id table and overrides the
  `app_name` resValue. Tracked `build.gradle.kts`, manifests, flavors, production ids and
  signing are unchanged; without `-I <init script>` every build is exactly as before.
- **Fail-closed:** the init script throws before configuration unless
  `-PtekaQaPackage=codexqa`, the only task is `assembleDevelopmentDebug` (release / bundle /
  production / staging refused — so `key.properties` is never used; the APK is signed with
  this machine's debug key), and the dart-defines carry `FLAVOR=development`,
  `TEKA_QA_ENABLED=true` and a local `API_BASE_URL`. The wrapper checks the same before
  starting Gradle.
- **Firebase:** the QA package is not meant to be a Firebase client.
  `process*GoogleServices` tasks are disabled **and** the QA variant's task output is
  re-pointed to a fresh empty directory (`build/app/generated/codexqa/empty-google-services-res/`),
  because a disabled task still left the *stale* output of an earlier normal `.dev` build
  wired into the merge — an earlier QA APK was observed packaging it, and the native
  `FirebaseInitProvider` then initialised a default Firebase app in the QA process (no Dart
  Firebase / push init ever ran). `google-services.json` and the old generated output are
  neither read, modified nor deleted. Without `google_app_id` the native provider cannot
  initialise a default app. **Rebuilt buyer and seller APKs passed resource inspection and runtime verification:
  native Firebase initialization false, missing configuration true.**
  The buyer's App Links host placeholder becomes `codexqa.invalid`, so the QA app never claims
  `dev.teka.cd` links (the `teka://` fallback scheme stays declared in the shared manifest).
- **Pre-install check (fail-closed):** after Gradle, the wrapper runs `aapt2 dump resources`
  on the APK, inspects resource **names only** and prints one presence boolean per Firebase
  configuration key (`google_app_id`, `gcm_defaultSenderId`, `google_api_key`,
  `google_crash_reporting_api_key`, `google_storage_bucket`, `project_id`,
  `default_web_client_id`, `firebase_database_url`). If any is `true` it deletes that freshly
  built QA APK and refuses — nothing to install. Independent re-check (counts only, no values):

  ```bash
  APK=apps/buyer-mobile/build/codexqa/buyer-codexqa-dev-debug.apk
  for r in google_app_id gcm_defaultSenderId google_api_key project_id; do
    printf '%s=%s\n' "$r" "$(aapt2 dump resources "$APK" | grep -c "^ *resource .* string/$r\$")"
  done   # every count must be 0
  ```
- **Version metadata is stale by design:** the direct Gradle build takes `versionName` /
  `versionCode` from the generated `android/local.properties` of the last normal Flutter build
  (observed: buyer 0.1.8+11, seller 0.1.10+12 while the seller pubspec says 0.1.11+13). QA APKs
  are never release candidates; no production version or key is touched.
- **Secrets:** `build_android_qa_apk.dart` merges `flavors/development.json` with the private
  defines file (later wins), encodes them exactly like `flutter_tools` and hands them to Gradle
  through `ORG_GRADLE_PROJECT_dart-defines` — never on the command line; it prints only key
  counts. Flutter metadata comes from the existing generated `android/local.properties`.
- **Output:** the APK is moved to `build/codexqa/<app>-codexqa-dev-debug.apk`; the Flutter
  plugin's same-build copy under the normal `.dev` file name is removed so it cannot be
  installed by mistake. A later normal `flutter build/run --flavor development` rebuilds with
  the regular `.dev` id (applicationId is a Gradle task input).
- **Remove a QA app** (only if asked): `adb uninstall com.tootiye.teka.codexqa.dev` — never
  the `.dev` / production packages.

Each file is one continuous journey (see « Structure » above); always run the whole file.

## Diagnosing a failure

- Fails in `setUpAll` → configuration refused (message lists variables) or the local API /
  credentials (`API locale <méthode> <chemin> → <statut> : <message serveur>`).
- `Délai de Ns dépassé en attendant : <état>` → the UI never reached that state; the message
  lists the visible texts (phone-like numbers masked).
- An `expect` on stock / status / audit log after a UI step → backend truth differs from what
  the screen claimed.


## Independent acceptance — 2026-10-18

Codex independently reviewed Opus 5.5's opt-in harness and QA build/staging changes,
ran the real clients and inspected the captured native UI. Official Claude CLI
2.1.302 authenticated through `claude.ai` / `max` before every delegation, with
`ANTHROPIC_API_KEY` excluded. Final implementation report is_error=false; model
usage contains only `claude-opus-5-5`. No API billing fallback was used.

| Journey | Device/runtime | Accepted scenarios | Durable transcript |
|---|---|---|---|
| Buyer | iPhone18Pro / iOS27.0 | 3/3; 19s | [iOS buyer](buyer-ios-result.txt) |
| Buyer | sdk_gphone64_arm64 / Android14 API34 | 3/3; 93s, normal renderer | [Android buyer](buyer-android-result.txt) |
| Seller | iPhone18Pro / iOS27.0 | 6/6; 26s | [iOS seller](seller-ios-result.txt) |
| Seller | sdk_gphone64_arm64 / Android14 API34 | 6/6; 103s, normal renderer | [Android seller](seller-android-result.txt) |

Each row is one continuous `testWidgets` journey with named scenarios, not N
independent cases. Buyer verifies mock-OTP authentication, FC stock/PDP, cart,
COD checkout, actual UI cancellation, one audit/once-only restoration, repository
retry400 and refused cancellation after seller hand-over. Seller verifies real
login/rejection/retry, buyer/admin changes seen through stale-action recovery and
pull-to-refresh, stock409 refetch10 with edited price151000 retained and no server
price overwrite, read failure/retry; the sixth scenario taps the actual Retournées
filter and checks delayed loading then the real zero-row response/French empty UI.
All stock assertions read the authoritative local API. No client stock arithmetic.

Screenshots use `buyer-{ios,android}-01..11` and `seller-{ios,android}-01..11`.
All four final runs captured01..11. The earlier five-scenario Android core
pass transcript is retained separately as historical evidence.
Visual review includes FC/En stock, checkout, Annulée/Échoué, loading/error,
refused cancellation, seller rejection/admin cancellation, stock conflict and
empty state. The long French409 snackbar truncates after the visible reason and
new quantity; recorded as a non-blocking UX limitation. Synthetic product media
is a generic QA image, not product-photography acceptance; some first captures
show its loading placeholder. Some app-surface captures include route-animation
edges; full-simulator captures provide independent layout context.

Native browser evidence:

- [Safari promotion](safari-ios-promotion-fresh-qa.png): actual eligible BUYER
  card, phone layout and unobstructed CTA/close control inspected.
- [Safari delivery document](safari-ios-delivery-document-qa.png): actual
  DB-backed80-line document, operational/non-fiscal copy, responsive snapshots
  and print control inspected. Native AirPrint/Safari A4 pagination **not tested**.
- `chrome-android-product-qa.png`: native Chrome real product-page rendering.
  `chrome-android-promotion-fresh-qa.png` records a system ANR, **not** a promotion
  pass. Final browser retry again showed the system ANR:
  `chrome-android-promotion-recovered-qa.png`; uiautomator timed out. It is not
  a native Chrome promotion pass; isolated Android-UA Chromium checks passed.
- [Sanitized web follow-up results](web-followup-result.txt) preserve the fresh
  isolated Chromium/WebKit promotion targeting,
  route exclusion, dismissal/persistence/expiry/blocked-storage and accessibility
  matrix passes. Exact official Apple/Google hrefs verified; public pages returned
  HTTP200 with the matching app identity. No store account or installation used.
  URL success does not establish physical install/open-app handoff.

The real 80-line fixture was seeded directly, then opened from the real admin order
workflow: COD **10.005.000 FC**,80 snapshot rows, repeated print table header,
zero inventory/order/item/transaction/audit writes. It is not an 80-item UI checkout
or a newly printed80-line PDF. Previously inspected short1-page and long5-page A4
PDFs remain the pagination evidence.

Final scoped analyzers include `lib test integration_test test_driver`: buyer7,
seller6 existing infos only; no warnings/errors. `dart analyze scripts/mobile-qa`
is clean. All existing pubspec package blocks are byte-identical to HEAD; only
five SDK test-transitive packages were added. Seller Podfile.lock is unchanged and
matches Pods/Manifest.lock. Both seller SwiftPM files record only the first
TOCropViewController 3.2.0 pin from the existing cropper declaration; no existing
pin changed. Shipping native projects, signing and environment files are unchanged.

Remaining limits: physical iPhone/Android install/open-app and signed distribution;
actual native Safari printing; late asynchronous buyer cold-start redirect timing;
GitHub CI when a commit/PR is authorized. Native coverage is portrait; no landscape
acceptance is claimed. API lint remains non-blocking baseline debt, and the two
existing high-parallelism seller photo-I/O flakes passed isolated and bounded full
runs. No new product regression was confirmed by this follow-up.


## Release-preparation evidence — 2026-10-18

- [Complete Git path inventory](git-change-inventory.txt) includes untracked
  source/tests and the intentional synthetic artifacts.
- [Sanitized preflight result](release-preflight-result.json) records current
  dependency-audit failure, release-config passes, compatibility and ANR findings.
- Full commit plan, effective GitHub rules, staged release/rollback and required
  approvals remain in the [existing initiative tracker](../../../order-integrity-printing-app-promotion.md#final-release-preparation-and-git-review--2026-10-18).

The dependency audit failure supersedes earlier release-readiness assumptions;
accepted functional tests remain valid. Raw device diagnostics stay private.
