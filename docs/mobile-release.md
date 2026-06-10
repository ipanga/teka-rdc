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

## Not covered (deferred)

iOS / App Store — blocked on the iOS scaffold (the long-deferred "PR C"); when it
lands, mirror this with Xcode archives, `GoogleService-Info.plist`, APNs, and App
Store Connect. See `docs/mobile-flavors.md` + the STATUS "Open follow-ups".
