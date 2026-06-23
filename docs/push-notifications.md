# Push notifications runbook

Operational guide for the FCM-based push system that ships:

- buyer-mobile **and** seller-mobile FCM clients
- backend fan-out via `PushService` + `OrderNotificationService` + `SellerNotificationService`
- the standard 5 buyer order events + the seller "new order", "product approved/rejected", and "new review" events

This document is the source of truth for setup, secrets management, and day-2 ops. The push initiative spans many PRs — see `STATUS.md` for the current scoreboard.

## Architecture in one screenful

```
       ┌────────────────────────────┐
       │ Buyer / seller mobile app  │   (Flutter, com.tootiye.{teka,tekaseller})
       │ firebase_messaging         │
       │ ↓ POST /v1/users/device-   │
       │   tokens (on login)        │
       └────────────┬───────────────┘
                    │
                    ▼
       ┌────────────────────────────┐
       │ api: DeviceToken table      │   (role-agnostic; any user can register)
       └────────────┬───────────────┘
                    │ event happens (order placed, product approved…)
                    ▼
       ┌────────────────────────────┐
       │ OrderNotificationService    │
       │ SellerNotificationService   │
       │ → PushService.sendToUser    │
       │   → admin.messaging().send  │
       └────────────┬───────────────┘
                    │
                    ▼
              FCM (Google) → device
```

Same Firebase project (`teka-rdc`) for both Android apps. Different `package_name` → different `mobilesdk_app_id` inside one multi-app `google-services.json`. APNs auth key is project-wide (one `.p8` covers both buyer + seller iOS once those scaffolds land).

## Backend auth

`PushService` (`apps/api/src/push/push.service.ts`) accepts **either**:

1. **GOOGLE_APPLICATION_CREDENTIALS** — absolute path to a Firebase Admin SDK service-account JSON. Standard Google SDK pattern. Good for dev when the file lives on disk.
2. **Discrete env trio** — `FIREBASE_PROJECT_ID` + `FIREBASE_PRIVATE_KEY` + `FIREBASE_CLIENT_EMAIL`. GitHub-Secrets-friendly. **The discrete trio wins when both are set.**

When neither is configured, `PushService.sendToUser` is a no-op and every send-call returns `{ enabled: false, tokens: 0, ... }`. Safe to run without credentials — the app boots, the backend just doesn't fan out pushes.

`FIREBASE_PRIVATE_KEY` may carry literal `\n` sequences. Node 22's `--env-file` unescapes them, Docker Compose `env_file:` does not. `PushService` normalizes either form via `replace(/\\n/g, '\n')` before handing to firebase-admin.

### Production today

`/home/deploy/teka-rdc/.env.production` on the VPS carries all three discrete env vars (set by the operator 2026-05-22). `docker compose --env-file .env.production up -d api` picks them up; expected boot log:

```
[PushService] firebase-admin initialized — project teka-rdc
```

If you see `Push notifications disabled — neither GOOGLE_APPLICATION_CREDENTIALS nor the discrete FIREBASE_* env trio is set`, the env vars never reached the container.

## Mobile credentials

| File | Role | Where it lives |
|---|---|---|
| `apps/buyer-mobile/android/app/google-services.json` | Buyer Android Firebase client config | gitignored, decoded from `BUYER_GOOGLE_SERVICES_JSON_B64` secret |
| `apps/seller-mobile/android/app/google-services.json` | Seller Android Firebase client config | gitignored, decoded from `SELLER_GOOGLE_SERVICES_JSON_B64` secret |
| `apps/buyer-mobile/ios/Runner/GoogleService-Info.plist` | iOS Firebase client config (prod, `com.tootiye.teka`) | gitignored; landed 2026-06-23, restored from `BUYER_GOOGLE_SERVICE_INFO_PLIST_B64` |
| `apps/seller-mobile/ios/Runner/GoogleService-Info.plist` | iOS Firebase client config | gitignored (seller iOS scaffold still pending) |
| `AuthKey_XXXXXXXXXX.p8` | APNs auth key | gitignored. Uploaded once to Firebase Console → Cloud Messaging → Apple app config. Not consumed by app code. |
| Firebase Admin SDK JSON | Backend auth | NOT used directly anymore; discrete env trio replaces it in prod. The JSON file at `~/Desktop/teka-rdc/buyer/teka-rdc-firebase-adminsdk-*.json` is what you'd download from Firebase Console → Service accounts → Generate new private key if you need to rotate. |

### Encoding new secrets

When you receive a fresh credential file from the Firebase Console (key rotation, etc.):

```sh
# macOS — copies the base64 to clipboard, ready to paste into GitHub
base64 -i ~/Desktop/teka-rdc/buyer/android/google-services.json | pbcopy
```

Then GitHub repo → Settings → Secrets and variables → Actions → New repository secret. Use the names listed above.

### Decoding on a fresh machine

`scripts/sync-firebase-secrets.sh` decodes everything from env vars at the right paths. Run it once after a fresh checkout if you don't have local files yet:

```sh
export BUYER_GOOGLE_SERVICES_JSON_B64="…paste base64…"
export SELLER_GOOGLE_SERVICES_JSON_B64="…paste base64…"
bash scripts/sync-firebase-secrets.sh
# → wrote apps/buyer-mobile/android/app/google-services.json (688 bytes)
# → wrote apps/seller-mobile/android/app/google-services.json (1234 bytes)
```

The script silently skips any variable that isn't set, so partial setups are fine.

## CI workflows

### `Build mobile APK` — `.github/workflows/build-mobile-apk.yml`

`workflow_dispatch` action that produces an APK for either app or both, debug or release. Decodes the gitignored google-services.json from GitHub Secrets, runs `flutter build apk`, uploads as a workflow artifact.

Trigger: Actions tab → "Build mobile APK" → Run workflow → pick app + variant.

Requires these repo secrets:

- `BUYER_GOOGLE_SERVICES_JSON_B64`
- `SELLER_GOOGLE_SERVICES_JSON_B64`

The job fails with a clear error if a required secret is missing for the selected app.

### `Apply prod migration` — `.github/workflows/apply-migration.yml`

Already documented in `CLAUDE.md § Prisma workflow`. Used to apply the `device_tokens` table during PR A's deploy. Mentioned here only because the push schema migration went through it.

### `Deploy to production` — `.github/workflows/deploy.yml`

Pre-existing. Builds api + 3 web images, SSHes to the VPS, runs the docker rollout. Sets `SENTRY_RELEASE=${{ github.sha }}` so error events tag correctly per release.

## Smoke testing

### Buyer — Android

1. Build + install the buyer APK (`flutter build apk --debug` or the workflow above).
2. Log in via WhatsApp OTP (mock provider in dev — read the code from `docker logs teka_rdc-api-1 | grep -i otp`).
3. Confirm logcat shows `[PushController] token registered`.
4. Confirm `device_tokens` row exists:
   ```sh
   docker compose --env-file .env.development -f docker-compose.yml exec -T api sh -c '
     eval "$(node -e "const u=new URL(process.env.DATABASE_URL);[\"HOST\",\"PORT\",\"USER\",\"PASSWORD\",\"DATABASE\"].forEach(k=>console.log(`export PG${k}=`+JSON.stringify(decodeURIComponent(u[k.toLowerCase()]||u.pathname.slice(1)))))")"
     psql -At -c "SELECT u.email, u.role, dt.platform, dt.\"isActive\" FROM device_tokens dt JOIN users u ON u.id=dt.\"userId\" ORDER BY dt.\"createdAt\" DESC LIMIT 3;"
   '
   ```
5. Send a test push from inside the api container:
   ```sh
   TOKEN=… # full token from device_tokens
   docker compose --env-file .env.development -f docker-compose.yml exec -e PUSH_TOKEN="$TOKEN" -T api node -e '
   const admin = require("firebase-admin");
   admin.initializeApp({ credential: admin.credential.cert({
     projectId: process.env.FIREBASE_PROJECT_ID,
     privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
     clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
   })});
   admin.messaging().send({
     token: process.env.PUSH_TOKEN,
     notification: { title: "Test", body: "End-to-end works" },
   }).then(id => { console.log(id); process.exit(0); })
     .catch(e => { console.error(e.code, e.message); process.exit(1); });
   '
   ```
6. Watch `adb logcat | grep FLTFireMsgReceiver` for `broadcast received for message`.

### Seller — Android

Same steps, log in via email + password instead of WhatsApp OTP. The `role` column on the registered row should be `SELLER`.

### iOS

**buyer-mobile — config wired + build-verified 2026-06-23 (not yet shipping).** The iOS scaffold lives under
`apps/buyer-mobile/ios/` (untracked) with the **prod** `GoogleService-Info.plist` (Firebase iOS app
`com.tootiye.teka`, project `teka-rdc`) at `ios/Runner/GoogleService-Info.plist` (gitignored; restore in
CI/fresh checkouts from the `BUYER_GOOGLE_SERVICE_INFO_PLIST_B64` secret via `scripts/sync-firebase-secrets.sh`).
The Dart FCM stack (permission, token registration, foreground/background/tap, `NotificationRouter`) is shared
with Android — no native code changes needed.

Automated + verified (`flutter build ios --no-codesign` → `Runner.app` built, 1142 `FIRMessaging/FIRApp` symbols
linked):
- Bundle id aligned `com.tootiye.buyerMobile → com.tootiye.teka` (all configs).
- `Info.plist` → `UIBackgroundModes: [remote-notification]`.
- `Runner.entitlements` created (`aps-environment = development`) + `CODE_SIGN_ENTITLEMENTS` set on
  Debug/Release/Profile.
- `GoogleService-Info.plist` added to the Runner target's *Copy Bundle Resources* (confirmed in the built bundle).
- **iOS deployment target 13.0 → 15.0** (Firebase iOS SDK 12.x requires 15.0) in the pbxproj + Podfile;
  created the missing `Flutter/Profile.xcconfig`.
- Plugins are managed by **Swift Package Manager** (Flutter 3.44 default) — SPM↔Xcode integration is done;
  the hybrid CocoaPods/SPM setup builds (CocoaPods can be deintegrated later for speed, optional).

**APNs key (operator — upload to Firebase Console, no API):** project `teka-rdc` → Cloud Messaging → Apple app
config → APNs Authentication Key. **Buyer key:** `.p8` **Key ID `78KG84553N`**, **Team ID `YK6Z393A4D`** (the
`.p8` private key is held by the operator). One `.p8` is project-wide (covers seller iOS later). **This is the
delivery gate** — FCM cannot reach iOS without it.

**Remaining before iOS push ships (device / Apple — not automatable):**
1. Upload the APNs `.p8` (above) to Firebase.
2. **Signing** — in Xcode, select a team + provisioning profile for `com.tootiye.teka` with the **Push
   Notifications** capability (the `aps-environment` entitlement is already in the project; for TestFlight/App
   Store flip it `development → production`).
3. Install on a **real device / TestFlight** (the simulator can't receive remote push), grant the permission
   prompt → the app registers an APNs→FCM token to `/v1/users/device-tokens`.
4. Send a broadcast from admin and confirm delivery (foreground/background/tap deep-link).
5. The `ios/` tree is untracked — committing it (+ iOS flavors/CI) is the remaining "PR C" decision.
   (`CFBundleDisplayName` is still the scaffold default "Buyer Mobile" — rebrand separately if desired; not a
   push blocker.)

**seller-mobile — still pending its `ios/` scaffold** (no iOS directory yet; the same `.p8` will cover it).

## Wired events

The set of events that fire a push today:

| Event | Recipient | Source |
|---|---|---|
| Order placed (confirmation) | Buyer | `OrderNotificationService.notifyOrderPlaced` |
| Order confirmed by seller | Buyer | `OrderNotificationService.notifyOrderConfirmed` |
| Order shipped | Buyer | `OrderNotificationService.notifyOrderShipped` |
| Order delivered | Buyer | `OrderNotificationService.notifyOrderDelivered` |
| Order cancelled | Buyer | `OrderNotificationService.notifyOrderCancelled` |
| **Order placed** | **Seller** | `OrderNotificationService.notifyOrderPlaced` (PR S2) |
| **Product approved by admin** | **Seller** | `SellerNotificationService.notifyProductApproved` (PR E lite) |
| **Product rejected by admin** | **Seller** | `SellerNotificationService.notifyProductRejected` (PR E lite) |
| **New review from buyer** | **Seller** | `SellerNotificationService.notifyNewReview` (PR E lite) |

**Tap-navigation routing** (PR E, 2026-05-22): each `data` payload carries a `screen` field that the Flutter clients map to a go_router path. See `apps/{buyer,seller}-mobile/lib/core/push/notification_router.dart`.

| `screen` value | Required field | Buyer route | Seller route |
|---|---|---|---|
| `order-details` | `orderId` | `/orders/$orderId` | `/orders/$orderId` |
| `product-details` | `productId` | `/products/$productId` | `/products/$productId` |
| `product-reviews` | `productId` | `/products/$productId/reviews` | `/reviews` *(flat list — productId dropped; seller dashboard's reviews page filters)* |
| `notifications` | — | `/notifications` *(Notification Center; generic admin broadcast)* | *(n/a — seller broadcasts unchanged)* |

Tap sources handled:

1. **Foreground** — local notification posted by `flutter_local_notifications` from `PushService._handleForegroundMessage`. Tap fires `onDidReceiveNotificationResponse`; payload is the JSON-encoded FCM `data` block.
2. **Background** — OS-tray notification from FCM's auto-display. Tap fires `FirebaseMessaging.onMessageOpenedApp` stream.
3. **Killed app** — `FirebaseMessaging.getInitialMessage()` returns the message that launched the app. Checked post-first-frame to ensure the GoRouter is ready before we try to navigate.

Unknown `screen` values (or missing required IDs) are silently ignored — the notification still appears, it just doesn't navigate anywhere on tap.

## Opt-out

`User.notificationPrefs` (JSONB) carries `smsOrderUpdates` + `smsBroadcasts` toggles. Push currently piggy-backs on `smsOrderUpdates` (one user-facing toggle covers both channels). Approval/rejection notifications skip the pref check — they're operational, not promotional. Add dedicated `pushOrderUpdates` / `pushReviewUpdates` etc. only when user research demands.

## Future work

- **PR C** — iOS scaffold. **buyer-mobile: config landed 2026-06-23** (`ios/` scaffold + prod GoogleService-Info.plist for `com.tootiye.teka` + `UIBackgroundModes`; bundle id aligned). Remaining = upload APNs `.p8` to Firebase, enable Push Notifications + Background Modes in Xcode, `pod install`, sign, real-device test, and commit the `ios/` tree (see the **iOS** section above). **seller-mobile** still needs `flutter create --platforms=ios . --org com.tootiye` + its own GoogleService-Info.plist.
- **PR E full** — Tap-navigation: extend `PushController` to listen to `getInitialMessage` + `onMessageOpenedApp`, push the `data.screen` value into `go_router`. Plus stock-alert notifications once the schema gains a low-stock threshold.
- **Web push** — Documented as future work, not currently planned. Buyer + seller web Firebase configs (for `teka.cd` and `seller.teka.cd`) are noted in the operator's docs but unused. Adding requires Firebase Web SDK + service worker + browser permission UI; trade-off vs marketing value is unclear for a DRC-targeted marketplace where mobile is the primary surface.
