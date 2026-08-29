# Mobile release — Android / Play Store

How to produce a **signed production App Bundle (`.aab`)** and ship the Teka RDC
apps to Google Play. Complements `docs/mobile-flavors.md` (flavors) and
`docs/push-notifications.md` (FCM).

| App | Package (production) | Keystore alias (suggested) |
|---|---|---|
| **buyer-mobile** | `com.tootiye.teka` | `teka-buyer` |
| **seller-mobile** | `com.tootiye.tekaseller` | `teka-seller` |

> Only the **production** flavor in **release** mode goes to Play. `development`/
> `staging` are side-by-side dev installs (`.dev` / `.staging` suffixes) and never
> get uploaded. The two apps have **separate** upload keystores.

## How signing works here

`apps/*/android/app/build.gradle.kts` loads `android/key.properties` when present
and signs the release build with that upload key; when absent it **falls back to
debug signing** (so `flutter run --release` and the internal-testing APK builds
keep working without the keystore). `key.properties` + `*.jks` are gitignored —
**never commit them.** In CI they're materialised from GitHub Secrets by
`scripts/sync-android-signing.sh`.

**Play App Signing:** Google holds the real *app signing key*; you upload with an
*upload key* (the keystore below). If the upload key is ever lost you can request
an upload-key reset — but **keep the keystore + passwords backed up safely**
(a password manager / secrets vault). Losing both the keystore *and* Play App
Signing access means you can't update the app.

## 1. Generate the upload keystores (one-time — you run this)

```bash
# Buyer
keytool -genkeypair -v \
  -keystore teka-buyer-upload.jks \
  -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 \
  -alias teka-buyer
# (prompts for a store password, then key password — you can use the same —
#  and a distinguished name: CN=Teka RDC, O=Tootiye, C=CD, etc.)

# Seller
keytool -genkeypair -v \
  -keystore teka-seller-upload.jks \
  -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 \
  -alias teka-seller
```

Store both `.jks` files + their passwords somewhere safe and offline-backed.

## 2. Set the GitHub Secrets (one-time — you run this)

Base64-encode each keystore, then add the secrets in **GitHub → Settings →
Secrets and variables → Actions**:

```bash
# macOS
base64 -i teka-buyer-upload.jks | pbcopy
# Linux (single line, no wrapping)
base64 -w0 teka-buyer-upload.jks
```

| Secret | Value |
|---|---|
| `BUYER_UPLOAD_KEYSTORE_B64` | base64 of `teka-buyer-upload.jks` |
| `BUYER_KEYSTORE_PASSWORD` | the store password you chose |
| `BUYER_KEY_PASSWORD` | the key password you chose |
| `BUYER_KEY_ALIAS` | `teka-buyer` |
| `SELLER_UPLOAD_KEYSTORE_B64` | base64 of `teka-seller-upload.jks` |
| `SELLER_KEYSTORE_PASSWORD` | seller store password |
| `SELLER_KEY_PASSWORD` | seller key password |
| `SELLER_KEY_ALIAS` | `teka-seller` |

Already present (FCM): `BUYER_GOOGLE_SERVICES_JSON_B64`,
`SELLER_GOOGLE_SERVICES_JSON_B64`. The **production** `google-services.json`
must contain a client entry for the production package (`com.tootiye.teka` /
`com.tootiye.tekaseller`) — see `docs/mobile-flavors.md § Firebase setup`.

## 3. Bump the version before each release

Play rejects an upload whose `versionCode` isn't higher than the last. Bump
`version:` in each app's `pubspec.yaml` (`x.y.z+N` — `N` is the versionCode):

```yaml
# apps/buyer-mobile/pubspec.yaml
version: 1.0.1+2   # was 1.0.0+1
```

### App identity — version, build number, display name, category

**`pubspec.yaml` `version:` is the single source of truth. Never edit the version
or build number in Xcode.** How each field is wired on iOS:

| Field (Xcode General tab) | Comes from |
|---|---|
| **Version** (`CFBundleShortVersionString`) | `$(FLUTTER_BUILD_NAME)` ← pubspec `x.y.z`; also bound to `MARKETING_VERSION` so the field isn't blank |
| **Build** (`CFBundleVersion`) | `$(FLUTTER_BUILD_NUMBER)` ← pubspec `+N`; also bound to `CURRENT_PROJECT_VERSION`. CI overrides with an epoch `--build-number` (TestFlight needs each upload higher) |
| **Display Name** (`CFBundleDisplayName`) | `$(PRODUCT_DISPLAY_NAME)`, set **per flavor** in the pbxproj — buyer: `Teka` / `Teka Stg` / `Teka Dev`; seller: `Teka Vendeur` / `Teka Vendeur Stg` / `Teka Vendeur Dev` |
| **App Category** (`LSApplicationCategoryType`) | `INFOPLIST_KEY_LSApplicationCategoryType` — buyer `public.app-category.shopping`, seller `public.app-category.business`. Populates the Xcode General tab only (see note below); the store-facing category is set in **App Store Connect** |

> **Why Xcode's General tab can show a stale Build (e.g. `2`) or a blank Display Name.**
> `FLUTTER_BUILD_NAME`/`NUMBER` live in `ios/Flutter/Generated.xcconfig` (gitignored),
> which Flutter rewrites from pubspec **on build**, not when you merely open Xcode. If you
> opened Xcode after a `pubspec` bump without building, it shows the previous values. Refresh
> them without a full build:
> ```bash
> cd apps/<buyer|seller>-mobile
> flutter build ios --config-only --no-codesign \
>   --flavor production --dart-define-from-file=flavors/production.json
> ```
> The **Display Name** field looks blank because `CFBundleDisplayName` is a `$(…)` variable
> (Xcode's editor only renders literals) — this is expected and correct; the built app is
> named `Teka` / `Teka Vendeur`. Verify the resolved values any time with:
> ```bash
> cd apps/<buyer|seller>-mobile/ios && xcodebuild -project Runner.xcodeproj -target Runner \
>   -configuration Release-production -showBuildSettings \
>   | grep -E 'MARKETING_VERSION|CURRENT_PROJECT_VERSION|PRODUCT_DISPLAY_NAME|LSApplicationCategoryType'
> ```
> Or check the **built** binary directly (the source of truth):
> ```bash
> /usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' \
>   apps/<app>-mobile/build/ios/iphoneos/Runner.app/Info.plist   # → Teka / Teka Vendeur
> ```

> **`INFOPLIST_KEY_*` build settings do NOT reach the built app here.** This project uses an
> explicit `INFOPLIST_FILE = Runner/Info.plist` (`GENERATE_INFOPLIST_FILE` is **not** `YES`), so
> Xcode's `INFOPLIST_KEY_*` settings only populate the **General-tab GUI**, never the built
> `Info.plist`. That's why the App Category above is wired as `INFOPLIST_KEY_LSApplicationCategoryType`
> (fine — the iOS store category is authoritative in **App Store Connect**, not the binary), but
> anything that must land in the shipped bundle (like the display name) has to be an explicit
> key in `Runner/Info.plist` with a `$(VAR)` — which is exactly why the Display Name field is blank.
> Do **not** try to "fix" the blank field by switching `CFBundleDisplayName` to an `INFOPLIST_KEY_`:
> that empties the name in the built app.

### Opening the project in Xcode — use `Runner.xcworkspace`, never `Runner.xcodeproj`

Both apps integrate plugins through **CocoaPods**, so you must open the **workspace**:

```bash
open apps/seller-mobile/ios/Runner.xcworkspace     # ✅  (NOT Runner.xcodeproj)
```

Opening the bare `Runner.xcodeproj` skips the CocoaPods integration and the **seller** build
fails with `Module 'flutter_image_compress_common' not found` — that pod (from
`flutter_image_compress`, seller-only) ships **CocoaPods-only** (no Swift Package Manager
support), so it exists in the Pods project the workspace loads but not in the standalone
`.xcodeproj`. (buyer-mobile has no CocoaPods-only plugin, so its bare project happens to build —
don't rely on that; always open the workspace for both.) If pods look stale, regenerate first:

```bash
cd apps/seller-mobile && flutter pub get && (cd ios && pod install)
```

CI is unaffected — `flutter build ipa` / `xcodebuild` in the release workflows already target the
workspace. The trap only bites when opening the project by hand in Xcode.

## 4. Build the AAB

**CI (recommended):** Actions → **"Release mobile AAB"** → Run workflow → pick
`buyer` / `seller` / `both`. It signs with the upload key, builds the production
release bundle, verifies it's **not** debug-signed, and uploads
`<app>-mobile-production-release-aab` as an artifact. The workflow **fails fast**
if the signing secrets are missing (so a debug-signed bundle can't slip through).

**Locally** (to test signing before wiring CI): drop the keystore at
`apps/<app>-mobile/android/app/upload-keystore.jks`, create
`apps/<app>-mobile/android/key.properties`:

```properties
storeFile=upload-keystore.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=teka-buyer
keyPassword=YOUR_KEY_PASSWORD
```

then:

```bash
cd apps/buyer-mobile
flutter build appbundle --release --flavor production \
  --dart-define-from-file=flavors/production.json
# → build/app/outputs/bundle/productionRelease/app-production-release.aab
```

## 5. Play Store submission checklist

**Account / app (one-time):**
- [ ] Google Play **Developer account** ($25 one-time) created + identity verified.
- [ ] Create the app in Play Console (one per app: Teka / Teka Vendeur), default
      language **French (fr)**, app/game = App, free.
- [ ] Confirm the package names match (`com.tootiye.teka`, `com.tootiye.tekaseller`).
- [ ] **Play App Signing** enrolled (default for new apps) — upload key = the
      keystore above.

**Store listing:**
- [ ] App name, short description (≤80), full description (≤4000) — **French**.
- [ ] App icon 512×512 PNG; feature graphic 1024×500.
- [ ] Phone screenshots (≥2, up to 8) — ideally Lubumbashi/Kolwezi context.
- [ ] Category (Shopping), contact email, **privacy policy URL** (hosted page —
      e.g. `https://teka.cd/confidentialite`).

**Policy / compliance:**
- [ ] **Data safety** form (what data is collected: name, phone, location for
      delivery, device IDs for FCM/analytics; encrypted in transit; deletion path).
- [ ] **Content rating** questionnaire (IARC).
- [ ] **Target audience & content** (not directed at children).
- [ ] Ads declaration, government-app declaration (No), financial-features (COD —
      no payments SDK).
- [ ] App access: provide test credentials if any flow is gated (buyer = WhatsApp
      OTP; note the test number / how reviewers can sign in).

**Release:**
- [ ] Upload the `.aab` to **Internal testing** first → add testers → smoke test
      install + login + browse + checkout + (seller) payout request.
- [ ] Promote to **Closed/Open testing** as desired, then **Production**.
- [ ] Staged rollout (e.g. 20%) for the first production release.
- [ ] Repeat per app (buyer + seller).

**Post-launch:**
- [ ] Confirm Sentry receives events from the production build (symbol upload runs
      when `SENTRY_AUTH_TOKEN` is set).
- [ ] Confirm FCM push delivery on a real installed build.

## iOS — TestFlight / App Store (automated CI)

iOS is **flavor-wired** (schemes `development`/`staging`/`production` → the 9 build
configs, bundle-id suffixes matching Android). Full model: `docs/mobile-flavors.md` →
"iOS flavors". **CI is wired** — two macOS workflows mirror the Android split:

| Workflow | Purpose | Signing | TestFlight |
|---|---|---|---|
| `.github/workflows/build-mobile-ipa.yml` | validate any flavor compiles + push dSYMs to Sentry | none (`--no-codesign`) | no |
| `.github/workflows/release-mobile-ipa.yml` | signed production IPA → TestFlight | Fastlane `match` (read-only) | yes, behind an approval gate |

Both run on `macos-latest` (the only macOS jobs in the repo). Signing lives in Fastlane
(`fastlane/Fastfile` — lanes `setup_signing` + `upload_testflight`, driven by `TEKA_APP`);
the committed pbxproj stays `CODE_SIGN_STYLE=Automatic` and is flipped to Manual **only in
the CI checkout** by `update_code_signing_settings` (never committed), so local dev is
unaffected. `flutter build ipa` (not `gym`) does the archive/export so the flavor
`--dart-define`s + Sentry DSN/release survive.

### Release flow (`Release mobile IPA`, `app = buyer|seller|both`)
1. `build` job (auto): match installs the dist cert + App Store profile → `flutter build
   ipa --flavor production --export-options-plist fastlane/ExportOptions-<app>.plist` →
   `sentry_dart_plugin` uploads the iOS dSYMs → `.ipa` artifact.
2. **Approval gate:** the `testflight` job is bound to the protected `ios-testflight`
   GitHub Environment — a reviewer must approve before it runs.
3. `testflight` job: downloads the `.ipa` → `fastlane ios upload_testflight` (App Store
   Connect API key) → **waits for Apple to finish processing** → **distributes to the app's
   internal tester group** → reads the assignment back and fails if it did not take.
   `app=both` fans out to two matrix legs. Expect this step to run **5–15 min longer** than
   the upload alone; that wait is what makes distribution possible at all (below).

### TestFlight tester groups — the mapping

| App | Bundle id | Internal group | Repo variable |
|---|---|---|---|
| buyer | `com.tootiye.teka` | **Teka Buyer test team** | `TESTFLIGHT_BUYER_GROUP` |
| seller | `com.tootiye.tekaseller` | **Testers Teka RDC** | `TESTFLIGHT_SELLER_GROUP` |

Both groups are **internal**. `distribute_external: false`, and nothing is ever submitted for
Apple's external beta review.

**Where the config lives.** GitHub → *Settings → Secrets and variables → Actions → Variables*
(repository scope). They are **variables, not secrets**, deliberately: a tester-group name is
not a credential, and GitHub masks secret values — which would redact the group name from the
job summary that exists to show you where the build went. Leaving them unset is safe: the
Fastfile falls back to the exact names above, so a release still distributes correctly. Set a
variable only when a group is renamed in App Store Connect.

**Why a build can't get the wrong group.** The workflow passes *both* variables on every run
and never chooses between them; the app → variable-name mapping lives in the `APPS` table in
`fastlane/Fastfile`, so the buyer lane can only read `TESTFLIGHT_BUYER_GROUP`. A second guard
in `testflight_group` aborts if the resolved name matches the other app's group. Both are
pinned by `fastlane/testflight_groups_test.rb`, run in CI by the **Release Config** job.

> ### ⚠️ Internal groups: Apple has no "assign build to group" API
>
> Learned the hard way on **2026-08-09** (run `31318050415`, both apps failed):
>
> - `groups:` makes fastlane `POST /v1/builds/{id}/relationships/betaGroups`, which Apple
>   rejects outright for internal groups — *"Builds cannot be assigned to this internal group.
>   Cannot add internal group to a build."*
> - `submit_beta_review` **defaults to `true`** in pilot, and pilot submits whenever
>   `submit_beta_review && (groups || distribute_external)`. Passing `groups:` therefore
>   triggered a real **external Beta App Review** submission, which failed on the seller with
>   *"Beta App Description is required to submit a build for external testing."*
>
> So the lane passes **no `groups:`** and pins **`submit_beta_review: false`**.
>
> An internal group receives builds through **its own setting**: *Automatically distribute
> builds to this group* (`hasAccessToAllBuilds`) in App Store Connect. That is a **one-time
> per-group checkbox** the operator must enable — it cannot be set from the release workflow
> without mutating your App Store Connect configuration. The lane verifies it and **fails with
> that instruction** if it is off, so a release can never silently reach nobody.

### The flags that decide whether a tester ever sees a build

Uploading is not distributing. Until **2026-08-09** this lane ran with
`skip_waiting_for_build_processing: true` and `skip_submission: true` and no `groups:`, so
five consecutive releases uploaded cleanly and reached **nobody** — every build landed in App
Store Connect with an empty *Groups* column, no invite email, and never appeared in the
TestFlight app. All three settings are load-bearing:

| Setting | Value | Why |
|---|---|---|
| `skip_waiting_for_build_processing` | `false` | Fastlane does not distribute at all when this is `true`, and export compliance is settled during the wait |
| `skip_submission` | `false` | `true` skips the whole distribute step, including compliance handling |
| `distribute_external` | `false` | internal testers only |
| `submit_beta_review` | `false` | **defaults to `true`** — must be pinned, or a build gets submitted for external Beta App Review |
| `groups:` | **not passed** | Apple rejects build → internal-group assignment; see the box above |

After distributing, the lane queries the group back from App Store Connect and **fails the
job** if the build is not in it, so a green run means "testers can see it" rather than "the
upload returned 200". If the read-back itself cannot run it warns instead of failing — by then
the upload and distribution have already succeeded, and failing a good release over a broken
verification helper would be worse.

The job summary prints app, version, build number, processing status, group and distribution
status — no credentials.

Only `Release-production` carries the **production** aps-environment entitlement (correct
for TestFlight). `ExportOptions-*.plist` set `uploadSymbols=false` on purpose — dSYMs go to
**Sentry** via the plugin, not to Apple (Apple's own upload chokes on the precompiled
`Sentry.framework` dSYM; harmless because crashes symbolicate in Sentry).

### Operator one-time setup (cannot be automated)
> **Status: DONE + verified end-to-end 2026-07-04.** The match store is bootstrapped for both
> apps (one Distribution cert + a profile per bundle id in `teka-ios-certs`), all secrets/env
> are set, and a full `app=both` release run uploaded both apps to TestFlight. The steps below
> are the reproduction/reference (e.g. rotating the PAT, re-running match, or a fresh machine).
>
> **Automatic distribution added 2026-08-09** (PR [#594](https://github.com/ipanga/teka-rdc/pull/594),
> merged to `develop` as **`d9cf9fe`**). Until then the lane uploaded without distributing, so
> five consecutive releases reached no tester — see *TestFlight tester groups* above for the
> mapping and the three flags. **The first release after this change is the one that proves it
> end-to-end**; builds `1785961399` (buyer) and `1785961365` (seller) predate it and were
> assigned to their groups by hand in App Store Connect.

1. **Apple Program License Agreement** — accept at developer.apple.com as Account Holder
   (the "Unable to process request - PLA Update available" block). Enable capabilities on
   each App ID: buyer `com.tootiye.teka` → **Push Notifications** + **Associated Domains**;
   seller `com.tootiye.tekaseller` → **Push Notifications**. Upload the APNs `.p8` to the
   Firebase console (see `docs/push-notifications.md`).
2. **match store** — create a private repo `teka-ios-certs`. Run **once per app, locally**
   (needs Apple login for the team):
   **Both apps live on the same Apple team `YK6Z393A4D` (TOOTIYE ENTERPRISES LTD)**, so one
   ASC API key + one Distribution certificate serve both; match keeps one cert and a profile
   per bundle id in the repo. **Prerequisite:** each bundle id must already exist as an App ID
   on the team — building/associating the app once in Xcode (or `fastlane produce -a
   com.tootiye.tekaseller`) registers it. Then, per app:
   ```bash
   bundle install
   MATCH_PASSWORD=<pick-one> bundle exec fastlane match appstore \
     --git_url https://github.com/<org>/teka-ios-certs.git \
     --api_key_path <asc-key.json> \
     --app_identifier com.tootiye.teka       --team_id YK6Z393A4D   # buyer
   MATCH_PASSWORD=<same>    bundle exec fastlane match appstore \
     --git_url https://github.com/<org>/teka-ios-certs.git \
     --api_key_path <asc-key.json> \
     --app_identifier com.tootiye.tekaseller --team_id YK6Z393A4D   # seller
   ```
   `<asc-key.json>` is a `{key_id, issuer_id, key (the .p8 body), in_house:false}` file — this
   authenticates match to Apple non-interactively (no Apple ID / 2FA). Both apps' assets
   coexist in the one repo (bundle ids differ → no collision).
3. **App Store Connect API key** — create one (Users and Access → Integrations → App Store
   Connect API, role App Manager); download the `.p8`; base64 it. One key covers both apps
   (same team). Ensure both prod App IDs have an app record in App Store Connect.
4. **GitHub Environment** — create `ios-testflight` and add required reviewer(s).
5. **GitHub Secrets:**

   | Secret | Scope | Value |
   |---|---|---|
   | `MATCH_PASSWORD` | shared | the match encryption passphrase from step 2 |
   | `MATCH_GIT_BASIC_AUTH` | shared | `base64("<gh-user>:<PAT>")` — read access to `teka-ios-certs` |
   | `BUYER_ASC_API_KEY_ID` / `BUYER_ASC_API_ISSUER_ID` / `BUYER_ASC_API_KEY_P8_B64` | buyer | ASC API key (team `YK6Z393A4D`) |
   | `SELLER_ASC_API_KEY_ID` / `SELLER_ASC_API_ISSUER_ID` / `SELLER_ASC_API_KEY_P8_B64` | seller | same ASC key as buyer (both apps share team `YK6Z393A4D`) |

   Reused as-is: `SENTRY_AUTH_TOKEN`, `SENTRY_DSN_{BUYER,SELLER}_MOBILE`,
   `{BUYER,SELLER}_GOOGLE_SERVICE_INFO_PLIST_B64`. Team ids are non-secret (in `Fastfile`).

**Firebase per-flavor** (dev/staging) is optional — they fall back to the prod plist until
you register their iOS apps + set the `*_GOOGLE_SERVICE_INFO_PLIST_{DEVELOPMENT,STAGING}_B64`
secrets. See `docs/mobile-flavors.md`.

### Local build (no CI, from `apps/{buyer,seller}-mobile`)
```bash
flutter build ipa --flavor production --dart-define-from-file=flavors/production.json \
  --dart-define=SENTRY_DSN=<app dsn> --dart-define=SENTRY_RELEASE=$(git rev-parse --short HEAD)
# → build/ios/ipa/*.ipa — upload via Xcode Organizer or Transporter (or let CI do it).
```

### CI internals & gotchas (why the release workflow is shaped the way it is)
These were all found by running the pipeline for real; don't "simplify" them away.

- **`persist-credentials: false` on the build job's `actions/checkout`.** Checkout otherwise
  persists the `GITHUB_TOKEN` as a `github.com` auth header (scoped to *this* repo only).
  `match` cloning the private `teka-ios-certs` then sends **two** `Authorization` headers
  (that token + our PAT) → GitHub 403. Dropping it is safe (the job does no authenticated
  git ops against `teka-rdc`).
- **Explicit git auth for the certs clone.** The workflow sets
  `git config --global http.https://github.com/.extraheader "AUTHORIZATION: basic <b64>"`
  from `MATCH_GIT_BASIC_AUTH`, **whitespace-stripped** (a line-wrapped base64 secret silently
  breaks the header), and verifies read access with `git ls-remote` from a neutral dir
  *before* the slow build — so a bad PAT fails in seconds with a clear message instead of a
  cryptic match error. `MATCH_GIT_BASIC_AUTH` must be single-line `base64("<user>:<PAT>")`
  and the PAT must read `teka-ios-certs`.
- **Absolute IPA path to `upload_testflight`.** fastlane runs the lane from its own resolved
  project dir, so a relative `ipa/*.ipa` won't resolve inside the Fastfile — the workflow
  passes `${GITHUB_WORKSPACE}/ipa/*.ipa`.
- **Unique, ever-increasing `CFBundleVersion`.** TestFlight rejects a build whose build number
  was already uploaded (`-19232`). The build step stamps `--build-number=$(date -u +%s)`
  (epoch — monotonic, always higher than small manual builds); the marketing version
  (`CFBundleShortVersionString`) stays from `pubspec.yaml`. Both `Info.plist`s use
  `$(FLUTTER_BUILD_NUMBER)`, so `--build-number` drives it.
- **Signing style stays `Automatic` in git.** `setup_signing` flips only `Release-production`
  to Manual (with the match profile) **in the CI checkout**, never committed — local Xcode dev
  keeps automatic signing. `ExportOptions-*.plist` set `uploadSymbols=false` so Apple doesn't
  choke on the precompiled `Sentry.framework` dSYM (symbols go to Sentry, not Apple).

## App privacy — labels, tracking, and the privacy manifest

**Neither app tracks users**, in Apple's sense of the word (linking user data with *third-party* data for
advertising, or sharing it with a data broker). Concretely: no `AdSupport`, no IDFA, no
`ATTrackingManager`, no ad network, no attribution SDK, no data broker. The three SDKs that collect anything
are all first-party sinks — **Sentry** (crash/errors only, `tracesSampleRate = 0`, phones scrubbed in
`core/config/sentry_scrub.dart`), **PostHog** (`distinctId` = our own `user.id`; person properties carry
`role` only), and **Firebase Cloud Messaging** (order push; not Analytics, not AdMob).

Therefore the app must **not** ship an App Tracking Transparency prompt. Apple rejects apps that ask for
tracking permission they don't need, and an ATT prompt would cost analytics opt-ins for nothing.

**`ios/Runner/PrivacyInfo.xcprivacy`** (both apps) is the binary-side declaration of that posture —
`NSPrivacyTracking = false`, empty `NSPrivacyTrackingDomains`, and every `NSPrivacyCollectedDataTypeTracking`
set to `false`. It is wired into the Runner target's *Resources* build phase; a manifest that is only on disk
is silently ignored. Re-wire with `ruby scripts/ios-add-privacy-manifest.rb apps/<app>-mobile` (idempotent) if
the Xcode project is ever regenerated. Guarded by `test/core/privacy_manifest_test.dart` in both apps.

**App Store Connect labels must agree with the manifest.** For every data type, *Used to Track You* = **No**:

| Data type | Collected | Linked to user | Used to track | Why |
|---|---|---|---|---|
| Phone number | buyer | Yes | **No** | WhatsApp-OTP auth id + delivery contact |
| Email address | both | Yes | **No** | seller login; buyer legacy account-claim |
| Name | both | Yes | **No** | order / shop display |
| Physical address | buyer | Yes | **No** | typed delivery address (**not** device location — no CoreLocation) |
| Purchase history | buyer | Yes | **No** | the buyer's own orders |
| Photos or videos | seller | Yes | **No** | product images |
| User ID | both | Yes | **No** | our account id; PostHog `distinctId` |
| Device ID | both | Yes | **No** | FCM push token + PostHog anonymous id |
| Product interaction | both | Yes | **No** | PostHog screen views / storefront events |
| Crash data | both | Yes | **No** | Sentry |
| Other diagnostic data | both | Yes | **No** | Sentry breadcrumbs |

> **Rejection history — guideline 5.1.2(i), 2026-08-18 (buyer-mobile 0.1.4).** The labels declared Crash Data,
> Other Diagnostic Data, and Device ID as *used to track you* while the binary shipped no ATT prompt. Nothing in
> the app was wrong — **the labels were**. Resolution: set *Used to Track You* = No per the table above (App
> Store Connect → *App Privacy*; needs Account Holder or Admin), reply to App Review stating the app does not
> track on any platform, and resubmit. If you ever add an ad/attribution SDK, this whole section changes and ATT
> becomes mandatory.

## Not covered (deferred)

- **staging/dev → TestFlight** — the release workflow ships production only. To add
  staging, register its App Store Connect record + bundle ids and add a matrix leg.
- **Tag-triggered release** — kept manual `workflow_dispatch` (same as the Android AAB job).
