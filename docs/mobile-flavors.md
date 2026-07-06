# Mobile Flavors

Both Flutter apps (`apps/buyer-mobile`, `apps/seller-mobile`) ship as three Android product flavors so dev/staging/prod builds can install side-by-side with independent IDs, names, and backend URLs.

**iOS is now flavor-wired too** (both apps), mirroring Android — see [iOS flavors](#ios-flavors) below.

## At a glance

| | Buyer | Seller |
|---|---|---|
| **Dev** app ID | `com.tootiye.teka.dev` | `com.tootiye.tekaseller.dev` |
| **Dev** display name | `Teka Dev` | `Teka Vendeur Dev` |
| **Staging** app ID | `com.tootiye.teka.staging` | `com.tootiye.tekaseller.staging` |
| **Staging** display name | `Teka Staging` | `Teka Vendeur Staging` |
| **Production** app ID | `com.tootiye.teka` | `com.tootiye.tekaseller` |
| **Production** display name | `Teka` | `Teka Vendeur` |

Production keeps its existing applicationId so the Play Store listing is unaffected. Dev/staging use `applicationIdSuffix` so all three variants co-install.

| Flavor | API base URL | Backend status |
|---|---|---|
| development | `http://10.0.2.2:5050/api` | Local docker-compose `api` container (emulator loopback) |
| staging | `https://staging.api.teka.cd/api` | **Not provisioned yet** — placeholder URL. Flip in `flavors/staging.json` once staging infra lands. |
| production | `https://api.teka.cd/api` | Live |

## Architecture

The flavor system is intentionally minimal:

1. **Gradle** (`android/app/build.gradle.kts`) declares the three product flavors via `flavorDimensions += "env"` and a `productFlavors { development/staging/production }` block. Each sets `applicationIdSuffix` and a `resValue("string", "app_name", "…")`.
2. **AndroidManifest.xml** reads the launcher label from `@string/app_name`, which Gradle generates per flavor from `resValue` above.
3. **`lib/core/config/flavor.dart`** exposes a typed `AppFlavor` enum + `FlavorConfig.instance` singleton. `FlavorConfig.initialize()` is called from `main()` before anything else; it reads compile-time `--dart-define` values.
4. **`flavors/{development,staging,production}.json`** carry the per-flavor `--dart-define` values (`FLAVOR`, `API_BASE_URL`, `SENTRY_DSN`) so build commands stay short via `--dart-define-from-file`.
5. **`lib/core/constants/api_constants.dart`** delegates `baseUrl` to `FlavorConfig.instance.apiBaseUrl`. No remaining hardcoded URLs.

No `flutter_dotenv`, no runtime env-switching, no per-flavor `main_*.dart` entry points. The single `lib/main.dart` works for all flavors because the flavor is baked in at compile time.

## Build commands

### Local

From each app's directory (`apps/buyer-mobile` or `apps/seller-mobile`):

```bash
# Development (against local API)
flutter run --flavor development \
  --dart-define-from-file=flavors/development.json

# Production (against live API)
flutter run --flavor production \
  --dart-define-from-file=flavors/production.json

# Release APK
flutter build apk --release \
  --flavor production \
  --dart-define-from-file=flavors/production.json
```

Output paths:

- `build/app/outputs/flutter-apk/app-development-release.apk`
- `build/app/outputs/flutter-apk/app-staging-release.apk`
- `build/app/outputs/flutter-apk/app-production-release.apk`

If you forget `--flavor`, the build fails fast with `no matching variant` — that's intentional once `productFlavors` exists.

### CI

Trigger from the Actions tab → **Build mobile APK** → Run workflow.

Inputs:
- **app:** `buyer` | `seller` | `both`
- **flavor:** `development` | `staging` | `production` | `all`
- **variant:** `debug` | `release`

Picking `both` and `all` fans out to 6 parallel jobs. Artifacts upload as `<app>-mobile-<flavor>-<variant>-apk` (14-day retention).

The workflow reads two repo secrets (one per app) for `google-services.json`; see [Firebase setup](#firebase-setup) below.

## Firebase setup

The two `google-services.json` files are gitignored (per the no-secrets-in-git policy). On a fresh checkout you have two options:

1. **Copy from your local credential vault** — place them at `apps/{buyer,seller}-mobile/android/app/google-services.json` directly.
2. **Decode from CI secrets** — `bash scripts/sync-firebase-secrets.sh` with `{BUYER,SELLER}_GOOGLE_SERVICES_JSON_B64` set in env.

### Adding `.dev` and `.staging` clients to your Firebase project

Without this step, only the production flavor builds. Dev + staging fail at `:processGoogleServices*` with:

```
No matching client found for package name 'com.tootiye.teka.dev'
in /…/buyer-mobile/android/app/google-services.json
```

To fix once per app:

1. Open the Firebase Console for the project (the existing one — no need to create new projects yet).
2. **Project settings** → **General** → **Your apps** → **Add app** → Android.
3. Enter the suffixed package name (e.g. `com.tootiye.teka.dev`). Skip the SHA-1 step for now.
4. Click **Download `google-services.json`**. The new file contains client entries for **all** registered package names — including the existing `com.tootiye.teka`.
5. Replace the local file at `apps/buyer-mobile/android/app/google-services.json` with the new merged version.
6. Repeat for `com.tootiye.teka.staging`.
7. Repeat the whole sequence for the seller project with `com.tootiye.tekaseller.dev` and `.staging`.
8. Re-encode each updated file and update the corresponding GitHub secret:
   ```bash
   base64 -i apps/buyer-mobile/android/app/google-services.json | pbcopy
   # paste into BUYER_GOOGLE_SERVICES_JSON_B64
   ```

The merged file is what unblocks CI builds for dev + staging.

## Secret management

| What | Where | Required for |
|---|---|---|
| `BUYER_GOOGLE_SERVICES_JSON_B64` | GitHub repo secret | CI builds of any buyer flavor |
| `SELLER_GOOGLE_SERVICES_JSON_B64` | GitHub repo secret | CI builds of any seller flavor |
| Sentry DSNs | `flavors/*.json` (committed) | Optional. DSNs are public write-only keys — safe to commit. Currently empty. |
| Android signing keystore | Not yet configured | Play Store submission (today release builds use the debug keystore — see `android/app/build.gradle.kts` TODO) |
| `{BUYER,SELLER}_GOOGLE_SERVICE_INFO_PLIST_B64` | GitHub repo secret | iOS builds (prod plist; the fallback for all flavors — see [iOS flavors](#ios-flavors)) |
| `{BUYER,SELLER}_GOOGLE_SERVICE_INFO_PLIST_{DEVELOPMENT,STAGING}_B64` | GitHub repo secret | Optional — real per-flavor iOS Firebase (else dev/staging fall back to prod) |
| iOS APNs `.p8` | Uploaded to Firebase console | iOS push delivery (FCM→APNs) |

Backend FCM auth (server-side push send) is handled separately via the discrete `FIREBASE_PROJECT_ID` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` env trio that `PushService` reads at boot — no file decoding needed there. See `docs/push-notifications.md`.

## Adding a new environment

When staging (or any future environment) gets real backing infra:

1. **Backend.** Stand up the API/DB/Redis equivalents. Document the URL in this file's [At a glance](#at-a-glance) table.
2. **Firebase.** If the new env needs its own Firebase project (recommended for analytics/crashlytics isolation), create it, register the Android apps with their suffixed package names, download `google-services.json`. Otherwise keep using the existing project with multiple clients (current pattern).
3. **Flavor config.** Update `apps/{buyer,seller}-mobile/flavors/<env>.json` with the real API URL and (eventually) Sentry DSN.
4. **No code changes needed** if you're populating an existing flavor's JSON. If you're adding a *fourth* flavor (e.g. `qa`), also:
   - Add a `create("qa")` block to both apps' `build.gradle.kts`.
   - Add `qa` to the `AppFlavor` enum in `flavor.dart`.
   - Add `qa` to the CI workflow's flavor choice list + matrix expansion.
   - Update this doc.

When separate Firebase projects per environment exist (vs. one project with multiple clients), split the GitHub secrets per flavor — e.g. `BUYER_GOOGLE_SERVICES_JSON_DEV_B64` / `_STAGING_B64` / `_PROD_B64` — and select per `matrix.flavor` in the workflow. The workflow's existing comment block marks this future split.

## Common errors

**`No matching client found for package name 'com.tootiye.teka.dev'`**
You haven't added the `.dev` app to Firebase Console yet. See [Firebase setup](#firebase-setup).

**`Lookup of 'app_name' failed`** (build-time resource error)
Means `android:label="@string/app_name"` in `AndroidManifest.xml` couldn't resolve. Check that the corresponding `resValue("string", "app_name", "…")` exists in `build.gradle.kts` for the flavor being built.

**`StateError: FlavorConfig.initialize() must be called from main()`**
Something is reading `FlavorConfig.instance` (or `ApiConstants.baseUrl`) before `FlavorConfig.initialize()` runs in `main()`. The init call must precede `PushService.init()` and `runApp()`.

**`no matching variant` from Flutter**
You ran `flutter build apk` or `flutter run` without `--flavor`. Pass one of `development | staging | production`.

## iOS flavors

iOS mirrors Android: three **schemes** (`development` / `staging` / `production`) driving
nine **build configurations** (`{Debug,Release,Profile}-{development,staging,production}`),
with matching bundle ids. Wired via `scripts/ios-flavorize.rb` (uses the `xcodeproj` gem
that ships with CocoaPods) — re-run it if you ever need to regenerate.

| Flavor | Buyer bundle id | Seller bundle id | Display name (buyer / seller) |
|---|---|---|---|
| development | `com.tootiye.teka.dev` | `com.tootiye.tekaseller.dev` | Teka Dev / Teka Vendeur Dev |
| staging | `com.tootiye.teka.staging` | `com.tootiye.tekaseller.staging` | Teka Stg / Teka Vendeur Stg |
| production | `com.tootiye.teka` | `com.tootiye.tekaseller` | Teka / Teka Vendeur |

Bundle ids/names match the Android `applicationId`s exactly. Only `Release-production`
uses `Runner-Release.entitlements` (aps-environment **production**, for TestFlight/App
Store); every other config uses `Runner.entitlements` (aps-environment development).

**Build / run (note: no `--flavor` fails, same as Android):**
```bash
# From apps/buyer-mobile or apps/seller-mobile
flutter run   --flavor development --dart-define-from-file=flavors/development.json
flutter build ipa --flavor production --dart-define-from-file=flavors/production.json   # → TestFlight/App Store
```

**iOS simulator dev caveat:** `flavors/development.json` uses `http://10.0.2.2:5050`
(the Android-emulator loopback). The iOS simulator can't reach that — override on the
command line (don't edit the shared JSON): append
`--dart-define=API_BASE_URL=http://127.0.0.1:5050/api`.

**Firebase (graceful fallback).** iOS needs a `GoogleService-Info.plist` whose bundle id
matches each flavor. A build phase (`scripts/ios-select-firebase-plist.sh`) picks
`ios/Runner/config/<flavor>/GoogleService-Info.plist` if present, else falls back to the
committed-via-secret prod plist at `ios/Runner/GoogleService-Info.plist`. So dev/staging
build today (using prod's Firebase). To give them real isolation, register
`com.tootiye.teka.dev` / `.staging` (+ seller equivalents) as iOS apps in the Firebase
console, drop their plists at the `config/<flavor>/` paths (gitignored), and set the
`{BUYER,SELLER}_GOOGLE_SERVICE_INFO_PLIST_{DEVELOPMENT,STAGING}_B64` secrets
(`scripts/sync-firebase-secrets.sh`) — no code change needed.

**Signing / TestFlight (operator).** Accept the Apple Program License Agreement, and on
each App ID enable the **Push Notifications** + **Associated Domains** capabilities (buyer)
/ **Push** (seller). Automatic signing then regenerates the profiles. iOS CI is **not**
wired yet (archive/upload from Xcode or `flutter build ipa`). See `docs/mobile-release.md`.
