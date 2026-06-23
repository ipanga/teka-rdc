# Universal Deep Linking & App Links

How a `https://teka.cd/...` link opens the **buyer-mobile** app on the right screen when installed, and the
website otherwise. Shipped 2026-06-23 (buyer-mobile only; seller-mobile deferred). **Additive — no web URL,
SEO, routing, or API change.**

## Principle

The website is the source of truth for URLs. The app **mirrors** that structure and **never** claims a URL it
can't render: anything the in-app parser doesn't recognise (foreign host, private/account path, unknown route)
opens in the system browser. So SEO, social previews, canonical URLs, and web-only pages are never affected.

## Supported URL formats

| Web URL | Opens (app route) | Notes |
|---|---|---|
| `https://teka.cd/` | Home `/` | |
| `https://teka.cd/{ville}/{slug}-{shortCode}` | Product `/products/{shortCode}` | trailing 6-char `shortCode` is the resolver; town preserved |
| `https://teka.cd/{ville}/categorie/{slug}` | Category `/categories/{slug}` | town preserved |
| `https://teka.cd/categorie/{slug}` · `/categories/{id}` | Category `/categories/{…}` | legacy global forms |
| `https://teka.cd/recherche?q=samsung` | Search `/search?q=samsung` | query pre-filled |
| `https://teka.cd/promotions` | Promotions `/promotions` | |
| `teka://...` (custom scheme) | same as above | fallback for non-App-Link contexts |
| auth / account / checkout / `/api/*` / foreign host / unknown | **system browser** | never deep-linked (see Security) |

The API resolver `GET /v1/browse/{products,categories}/:identifier` accepts a **shortCode, slug, or UUID**, so
the app passes the URL token verbatim — no new endpoints, no client-side id lookup.

## Single source of truth — `DeepLinkParser`

`apps/buyer-mobile/lib/core/deep_link/deep_link_parser.dart` (pure, unit-tested) converts an incoming `Uri`
(App Link / Universal Link / `teka://` / notification `url`) into an internal `DeepLinkTarget {route, citySlug}`
or `null` (→ browser). It **mirrors buyer-web `apps/buyer-web/src/lib/urls.ts`** (`productIdentifierFromParam`
shortCode extraction). **Keep the two in sync** when the web URL structure changes.

`DeepLinkController` (`…/deep_link/deep_link_controller.dart`) wires it up via `app_links`:
- **app closed** → `getInitialLink()` (deferred to post-first-frame so the router is mounted)
- **app background/foreground** → `uriLinkStream`
- preserves town context (selects the matching active city), then `router.push(route)`; on parse-null or a
  navigation error it `launchUrl`s the original URL in the browser.

Reading `deepLinkControllerProvider` in `app.dart` starts it (same read-once pattern as `pushController`).

## Android App Links

- **Manifest** (`android/app/src/main/AndroidManifest.xml`): a `VIEW`/`BROWSABLE` intent-filter with
  `android:autoVerify="true"` for `https`/`http` `${appLinkHost}`, plus a `teka://` custom-scheme filter.
- **Per-flavor host** (`android/app/build.gradle.kts` → `manifestPlaceholders["appLinkHost"]`): prod `teka.cd`,
  staging `staging.teka.cd`, dev `dev.teka.cd` — so non-prod builds never claim `teka.cd` on a device that also
  has prod.
- **`assetlinks.json`** at `apps/buyer-web/public/.well-known/assetlinks.json` → served at
  `https://teka.cd/.well-known/assetlinks.json` (`application/json`). **Operator:** replace
  `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT` with the **Play App Signing** cert SHA-256 (Play Console →
  *App integrity → App signing key certificate*). Optionally add the upload-cert SHA-256 too (sideloaded APKs).
- Verify: `adb shell pm get-app-links com.tootiye.teka` (after install) or the Play Console *Deep links* report.

## iOS Universal Links

- **`apple-app-site-association`** at `apps/buyer-web/public/.well-known/apple-app-site-association` (served as
  `application/json` via `next.config.ts headers()`). `appIDs: ["YK6Z393A4D.com.tootiye.teka"]`; `components`
  claim storefront paths and **exclude** auth/account/checkout/`api`.
- **Entitlement** (`ios/Runner/Runner.entitlements`): `com.apple.developer.associated-domains` =
  `applinks:teka.cd`, `applinks:www.teka.cd`. App-side handling is shared (`app_links`, no extra code).
- **Operator** (Xcode, sign time): enable the **Associated Domains** capability on the `com.tootiye.teka` App ID
  + provisioning profile. iOS deployment target is 15 (Firebase requirement).

## Notification routing

`NotificationRouter.routeForData(data)` (`…/core/push/notification_router.dart`):
- `{screen: 'product-details', productId}` / `order-details` / `product-reviews` / `notifications` → mapped
  paths (unchanged).
- `{url: 'https://teka.cd/...'}` (or `link`) → resolved through `DeepLinkParser` (**takes precedence**;
  non-teka/unmappable falls through to `screen`). So a broadcast can carry a canonical URL and tap-routing is
  identical to App/Universal Links. Tap sources (foreground / `onMessageOpenedApp` / `getInitialMessage`) are
  handled in `push_controller.dart`.

## Share

Product-detail AppBar **Share** button (`share_plus`) shares `productWebUrl(product)` =
`${webBaseUrl}/{citySlug}/{slug}-{shortCode}` (`…/core/deep_link/web_links.dart`, mirrors web `productHref`).
`WEB_BASE_URL` is per-flavor (`flavors/*.json` → `FlavorConfig.webBaseUrl`). The shared link opens the app via
App/Universal Links when installed, else the website — works from WhatsApp, SMS, email, browser.

## Analytics (PostHog, no PII)

- `deep_link_opened` `{matched: bool, route_type, scheme}` — `route_type` is a coarse category
  (`product|category|search|promotions|home|other`), never the id/slug/url.
- `deep_link_failed` `{reason: 'navigation'}` — a parsed route that failed to navigate.
- `product_shared` `{productId}` — Share tapped.
- Sentry breadcrumb (`category: deeplink`) carries only scheme + route type.
Reuses the existing `notification_opened` for the in-app feed.

## Security

- **Host allow-list** (`teka.cd`, `www.teka.cd`); foreign hosts → browser.
- **Charset-validated** path tokens (shortCode `^[a-z0-9]{6}$`, slug `^[A-Za-z0-9_-]{1,128}$`); nothing is
  interpolated unchecked → no route injection.
- **Private/auth/account/checkout/`api` paths are never deep-linked** → no protected-screen access or
  open-redirect via a crafted link; they open in the browser.
- Protected app routes additionally pass through the router's auth/city `redirect()` guard (a deep link to
  `/orders/:id` while logged-out → login).
- Malformed URLs are caught (`Uri.tryParse`, stream `onError`) → no crash.
Covered by `test/core/deep_link/deep_link_parser_test.dart` + `test/core/push/notification_router_test.dart`.

## Test matrix

Automated (CI-able): `flutter test` (parser + router unit tests), `flutter build apk` / `build ios`, buyer-web
`next build` + live `.well-known` serving (200 + `application/json`).

Device/manual (operator — needs a signed build + real device; the simulator can't verify App Links):

| Platform | App installed | App not installed |
|---|---|---|
| Android closed / background / foreground | link → app on the right screen | link → website |
| iOS closed / background / foreground | link → app on the right screen | link → website |

Per surface: product / category / search / promotions / home link; product & generic **notification** tap;
**shared** link from WhatsApp / SMS / email / browser. Android verification requires the real Play-signing
SHA-256 in `assetlinks.json`; iOS requires the Associated Domains capability on the signed build.

## Adding a new deep-linkable route

1. Add the web route + its `lib/urls.ts` builder (buyer-web).
2. Add the mapping in `DeepLinkParser.parse` + a unit test.
3. Ensure the target go_router route exists (id/slug-friendly).
4. If it should open the app from a notification, it already works (the parser backs `NotificationRouter`'s
   `url`). No manifest/AASA change unless you narrow the claimed paths.
