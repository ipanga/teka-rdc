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
| **Display Name** (`CFBundleDisplayName`) | `$(PRODUCT_DISPLAY_NAME)`, set **per flavor** in the pbxproj — buyer: `Teka` / `Teka Stg` / `Teka Dev`; seller: `Teka Seller` / `Teka Seller Stg` / `Teka Seller Dev` |
| **App Category** (`LSApplicationCategoryType`) | `INFOPLIST_KEY_LSApplicationCategoryType` — buyer `public.app-category.shopping`, seller `public.app-category.business` |

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
> named `Teka` / `Teka Seller`. Verify the resolved values any time with:
> ```bash
> cd apps/<buyer|seller>-mobile/ios && xcodebuild -project Runner.xcodeproj -target Runner \
>   -configuration Release-production -showBuildSettings \
>   | grep -E 'MARKETING_VERSION|CURRENT_PROJECT_VERSION|PRODUCT_DISPLAY_NAME|LSApplicationCategoryType'
> ```

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
- [ ] Create the app in Play Console (one per app: Teka / Teka Seller), default
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
   Connect API key). `app=both` fans out to two matrix legs.

Only `Release-production` carries the **production** aps-environment entitlement (correct
for TestFlight). `ExportOptions-*.plist` set `uploadSymbols=false` on purpose — dSYMs go to
**Sentry** via the plugin, not to Apple (Apple's own upload chokes on the precompiled
`Sentry.framework` dSYM; harmless because crashes symbolicate in Sentry).

### Operator one-time setup (cannot be automated)
> **Status: DONE + verified end-to-end 2026-07-04.** The match store is bootstrapped for both
> apps (one Distribution cert + a profile per bundle id in `teka-ios-certs`), all secrets/env
> are set, and a full `app=both` release run uploaded both apps to TestFlight. The steps below
> are the reproduction/reference (e.g. rotating the PAT, re-running match, or a fresh machine).

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

## Not covered (deferred)

- **staging/dev → TestFlight** — the release workflow ships production only. To add
  staging, register its App Store Connect record + bundle ids and add a matrix leg.
- **Tag-triggered release** — kept manual `workflow_dispatch` (same as the Android AAB job).
