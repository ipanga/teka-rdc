# Seller Commune · Business-document verification · Verified badge

Initiative tracker. Started 2026-09-05 on `develop` `6e573a9` (`main == develop`, payouts release
in production). Trust/PII-sensitive: official documents (RCCM, Identification Nationale, pièce
d'identité) and a buyer-visible trust mark. Every claim below was re-read at the cited line before
being recorded. `docs/product-spec.md` §Seller Registration and the Phase 2 KYC record in
`PROGRESS.md` (2026-06-07) describe the shipped baseline accurately; this file supersedes them for
the verification workflow once decisions D1–D8 are taken.

## Phase 0 — audit (read-only, complete 2026-09-05)

Sources: four parallel code audits (geography · verification/KYC/approval · media security ·
notifications/admin/buyer surfaces) plus a read-only production census (counts only, no PII).

### 1. Business/policy questions — what the code answers, what it cannot

| # | Question | Code answer |
|---|---|---|
| 1 | Does Commune exist? | **Yes.** `model Commune { id, cityId, name, sortOrder }` (`schema.prisma:205-221`), `SellerProfile.communeId String?` + relation + index (`:318-369`, migration `2026-06-07_seller_commune.sql`, applied in prod). No `isActive`, no `deletedAt`, no unique `(cityId, name)`; retiring a commune is a hard `DELETE … ON DELETE SET NULL`. |
| 2 | Which cities have communes? | Seed + prod: **Lubumbashi 6** (Lubumbashi, Kampemba, Kenya, Katuba, Ruashi, Annexe), **Kolwezi 2** (Dilala, Manika). Kinshasa, **Likasi**, Goma, Bukavu, Kisangani, Mbuji-Mayi: **0**. Likasi is a launch market with no communes → a seller there cannot apply today (commune required). |
| 3 | Commune required for new sellers? | **Yes at the DTO layer**: `ApplySellerDto.communeId` `@IsNotEmpty` (« La commune est requise »), `cityId` derived server-side from the commune (`sellers.service.ts:52-65`). DB column nullable by design. |
| 4 | Can existing sellers stay without Commune? | Yes — nothing reads it after application. **Prod: 4 approved sellers, 2 without commune** (legacy, both with `cityId`). |
| 5 | Does verification exist? | Partly. One state machine `SellerApplicationStatus { PENDING, APPROVED, REJECTED }` on `applicationStatus`; one private KYC photo (`idDocumentCloudinaryId`, folder `teka-rdc/seller-documents`, `type: 'authenticated'`, admin-only 600 s signed URL). No `isVerified`, no document type/status/history, no revoke. |
| 6 | Account approval ≠ verification? | Today they are the **same thing**: approval = « we looked at one ID photo ». APPROVED is terminal (`admin-users.service.ts:264` refuses any non-PENDING review). Product creation, profile edit and both client routers gate on `APPROVED`. |
| 7–10 | Evidence required, document set, business vs individual, ID-only | **Not answerable from code.** Applicant declares `businessType` (`individual`/`company`) and `idType` (`national_id`/`passport`/`rccm`, prod also has `company_registration`) and uploads one photo. No rule links `businessType` to a required document set. → **D3/D4**. |
| 11 | What does the badge mean? | **Nothing today.** buyer-web PDP (`product-detail-page.tsx:436-449`) and buyer-mobile PDP (`product_detail_screen.dart:640-661`) render « Vérifié » for **every** seller whose name is not `'Teka RDC Officiel'`; the trust strip copy « Vendeur vérifié » / « Vendeurs vérifiés » is static. The browse API exposes only `{ id, businessName }`. → **D5**. |
| 12 | Where is it buyer-visible? | Only the PDP seller block on web + mobile. Product cards show « Officiel » only. **There is no seller/store page** in buyer-web or buyer-mobile, no seller URLs in the sitemap, and JSON-LD `offers.seller` carries only the name. |
| 13 | How are docs stored/accessed? | See §3 — the private primitive is correct; the surroundings are not. |
| 14 | Replaced/rejected docs retention | **None.** Re-application overwrites `idDocumentCloudinaryId` and orphans the old asset; `anonymize()` (`account-deletion.service.ts:326-360`) leaves the ID scan in Cloudinary; abandoned uploads are unattributable (endpoint takes no `userId`, writes no row). → **D7**. |
| 15 | Which admin roles may verify? | Seller review controllers are `@Roles('ADMIN')` (`admin-sellers.controller.ts:16`); `SUPPORT` is excluded from the document URL. `FINANCE` unused (payouts follow-up). → **D8**. |

### 2. Geography — what exists vs what is missing

| Surface | Ville | Commune |
|---|---|---|
| `POST /v1/sellers/apply` (`ApplySellerDto`) | derived from commune | **required** |
| seller-mobile `/devenir-vendeur` (`seller_application_screen.dart:509-562`) | dropdown | **cascade dropdown**, reset on city change, error/retry row |
| seller-web `/devenir-vendeur` (`page.tsx:394-441`) | select | **cascade select**, « Sélectionnez d'abord une ville » |
| admin-web seller detail (`sellers/[id]/page.tsx:154-155`) | shown | **shown** (read-only) |
| `PATCH /v1/sellers/profile` + `UpdateSellerProfileDto` | `cityId` (validated active) | **missing** — changing `cityId` alone leaves `communeId` pointing at another city's commune (`sellers.service.ts:126-158`) |
| `GET /v1/sellers/profile` | no include | no include (`/v1/auth/me` returns raw ids only) |
| seller-mobile « Profil de la boutique » (`shop_profile_screen.dart:209-240`) | dropdown | **missing**; `SellerProfileInfo` does not parse `communeId`; `getCommunes` exists only in the application repository (duplicated `CityOption`) |
| seller-web `/dashboard/profile` (`page.tsx:461-478`) | select | **missing** |
| admin-web sellers list + `findSellerApplications` include | absent | absent |
| Buyer `POST /v1/addresses` (`addresses.service.ts:56-57`) | written verbatim | written verbatim — **no existence or city check at all** |

The only commune→city coupling in the API is the inline derivation in `apply()`; it is not a reusable helper and never checks the resolved city is active. Buyer-side clients already implement the same cascade (`address-form.tsx:82-119`, `address_form_sheet.dart:115-133`) against `GET /v1/cities` + `GET /v1/cities/:id/communes` (both `@Public()`).

**Verdict:** Workstream A is mostly wiring + one small API extension, no migration: add `communeId` to the update DTO, extract `resolveCommune(communeId) → { communeId, cityId }` (active city check) and reuse it in `apply`, `updateProfile` and buyer addresses, include commune in `getProfile`, add the cascade to both profile screens, add the column/filter to the admin list. Optional hardening (decision **D2**): `Commune.isActive` (additive migration) so retiring a commune stops being a hard delete.

### 3. Verification / KYC — what exists

Shipped 2026-06-07 (#314–#317), prod-verified:
- `POST /v1/sellers/documents` (`@Roles('BUYER','SELLER')`, `FileInterceptor('document')` with **no multer limits**) → `SellersService.uploadDocument` (≤ 5 MB checked after buffering, MIME allowlist jpeg/png/webp from the **client-asserted** `mimetype`, no magic bytes, no PDF) → `CloudinaryService.uploadPrivateImage` (`type: 'authenticated'`, `resource_type: 'image'`, original preserved, returns `public_id` only).
- `ApplySellerDto.idDocumentCloudinaryId` pinned to the private folder by regex; `apply()` stamps `idDocumentUploadedAt`.
- Admin: `GET /v1/admin/sellers/applications/:id/document` → `getSignedImageUrl` (sign_url + `expires_at` 600 s, generated per request, never persisted). No access audit.
- Approve/reject: `reviewSellerApplication` — APPROVE transactional (`applicationStatus`, `approvedAt`, `approvedById`, user role/status), REJECT non-transactional with `rejectionReason` (no server-side length rule). PostHog events; push + email (`notifyApplicationApproved/Rejected` are **push-only, no feed row**). **No `AdminAuditService` call** (the service already allows `entityType: 'seller_profile'`; `AdminAuditAction` has only payout/commission literals, `admin-audit.service.ts:6-14`).
- Admin UI: all review actions live on the **list** (`dashboard/sellers/page.tsx`: « Voir la pièce » modal, Approuver/Rejeter with a ≥ 5-char reason dialog); the **detail** page is read-only and shows no document, `idNumber`, `idType`, dates or reason even though `/v1/admin/users/:id` returns them.
- Queues: `ADMIN_QUEUES.sellerApplicationsPending` is already an Action Center tile (`admin-queues.ts:16-21`, `QUEUE_HREFS.sellerApplicationsPending`).

### 4. Security assessment of the document pipeline

Reuse unchanged: authenticated Cloudinary type (bare URL 401s), per-request expiring signed URL, ADMIN-only route, folder-pinning regex, random public_ids, multipart-through-API (no unsigned preset, no client credentials).

Gaps to close before accepting RCCM / Identification Nationale (severity order):
1. **No retention/deletion** — `anonymize()` keeps the ID scan; rejected applications keep theirs; re-application orphans the previous asset.
2. **Unattributable orphans** — upload has no `userId` and no DB row; any BUYER can accumulate private assets (global throttle 100/min/IP only).
3. **No access audit** — no record of which admin viewed which document.
4. **No `limits` on `FileInterceptor`** — whole body buffered before the 5 MB check (memory DoS).
5. **MIME client-asserted** — no magic-byte check (`file-type`), no extension check; becomes critical with `resource_type: 'raw'` for PDF because Cloudinary no longer decodes the file.
6. **No PDF path** — `resource_type`/signed-URL helper hardcode `image`; RCCM certificates are commonly PDFs.
7. Signed URL is an unbound 10-minute bearer link (acceptable; shorten to 120 s or proxy bytes through an authenticated API route so views are logged).
8. No EXIF stripping on preserved originals (GPS from phone photos).
9. Cloudinary env vars default to `''` → boot succeeds with no credentials, fails at first upload.

### 5. Notifications / audit / admin plumbing to reuse

- `SellerNotificationService` payout trio is the template: `UserNotificationService.createIfAbsent` feed row → `pushOrEmailToSeller` → email template. `UserNotificationType` needs a new value (`SELLER_VERIFICATION`, additive `ADD VALUE IF NOT EXISTS` migration like `2026-09-04_user_notification_payout_type.sql`). Push routing: `notification_router.dart` `screen` + `entityType` branches, `payout-notifications.ts` `hrefForNotification`.
- `AdminAuditService.record(tx, …)` is transaction-scoped and already accepts `entityType: 'seller_profile'`; extend `AdminAuditAction` with `SELLER_APPLICATION_APPROVED/REJECTED`, `SELLER_VERIFICATION_APPROVED/REJECTED/REVOKED`, `SELLER_DOCUMENT_VIEWED`, `SELLER_DOCUMENT_SUBMITTED/REPLACED`. No second audit architecture.
- Admin dialog/state-machine pattern: `dashboard/payouts/page.tsx` + `lib/payout-workflow.ts` (+ vitest) — copy for `verification-workflow.ts`.
- Action Center: add `verificationsPending` to `ADMIN_QUEUES`, `admin-stats.service.ts`, `action-center.ts` (`tone: 'moderation'`), `QUEUE_HREFS`, `admin-queues.spec.ts`.
- Tests: `test-utils.ts` mocks include `commune`, `sellerProfile`, `adminAuditLog` (not `userNotification` — unit-spec with hand-rolled deps); e2e convention is the auth-protection contract (401 per route); admin-web/seller-web vitest are node-only pure-logic suites; seller-mobile fixtures under `test/support/`.

### 6. Buyer surfaces

No seller page anywhere; the PDP seller block is the only identity surface on web and mobile, and both key « Officiel »/« Vérifié » off the literal `'Teka RDC Officiel'`. The public shape is `sellerFlat = { id, businessName }` (`browse.service.ts:1138-1144`, lists at `:608`/`:1012`). SEO: no seller URLs in the sitemap, JSON-LD `offers.seller` name only, no document data anywhere near metadata. Adding `verified: boolean` (and `official: boolean`) to `sellerFlat` is the single API change; the two PDP badge sites then switch from string comparison to the field.

### 7. Production census (2026-09-05, read-only, counts only)

4 approved sellers: 2 individual/`national_id` **with** commune + document; 2 company (`passport`, `company_registration`) **without** commune, without document, with city. 8 communes total (Lubumbashi 6, Kolwezi 2). No pending or rejected applications.

## Proposed architecture

### Data model (additive, one manual migration per PR that needs it)

```
enum SellerVerificationStatus { NOT_SUBMITTED PENDING_REVIEW VERIFIED REJECTED }   // seller-level
enum SellerDocumentType       { RCCM IDENTIFICATION_NATIONALE IDENTITY_DOCUMENT OTHER }
enum SellerDocumentStatus     { PENDING ACCEPTED REJECTED SUPERSEDED }             // document-level

SellerProfile
  + verificationStatus   SellerVerificationStatus @default(NOT_SUBMITTED)
  + verifiedAt / verifiedById / verificationRevokedAt / verificationNote?
  (applicationStatus stays: account approval and verification become two axes — D1)

model SellerDocument            // seller_documents — history-preserving, never hard-deleted while the seller exists
  id, sellerProfileId, type, otherLabel?, cloudinaryId (private folder), resourceType ('image'|'raw'),
  mimeType, sizeBytes, originalName?(no PII beyond what the seller typed), status, rejectionReason?,
  submittedAt, reviewedAt?, reviewedById?, supersededById?, deletedAt?
  @@index([sellerProfileId, type, status])

Commune + isActive Boolean @default(true)   // D2, optional
UserNotificationType + SELLER_VERIFICATION
AdminAuditAction + the seller literals above (code only)
```

Existing `idDocumentCloudinaryId` / `idType` / `idNumber` stay as the *application* evidence (backfilled into a `SellerDocument` row of type `IDENTITY_DOCUMENT` **only by an explicit, approved remediation**, never automatically).

### API (owner of every rule)

- `GET /v1/cities/:id/communes` unchanged; `resolveCommune()` helper shared by seller apply/update and buyer addresses.
- `PATCH /v1/sellers/profile` accepts `communeId` (derives `cityId`, rejects inactive/foreign).
- `POST /v1/sellers/verification/documents` (multipart, `@Roles('SELLER')`, owner-scoped, `limits: { fileSize: 5 MB, files: 1 }`, magic-byte check, jpeg/png/webp/pdf, PDF → `resource_type: 'raw'`) creates the `SellerDocument` row **in the same request** (no orphan window), supersedes a previous PENDING/REJECTED document of the same type, moves seller-level status to `PENDING_REVIEW` when at least the required set is present (D3), never to `VERIFIED`.
- `GET /v1/sellers/verification` (own status + documents without any URL).
- Admin: `GET /v1/admin/sellers/:id/verification`, `GET …/documents/:docId/url` (signed, ≤ 120 s, audited `SELLER_DOCUMENT_VIEWED`), `POST …/verification/{approve|reject|revoke}` (conditional `updateMany` on the current status, audit row in the same transaction, 409 on stale, reason required for reject/revoke — the payout pattern).
- Browse: `sellerFlat.verified = verificationStatus === 'VERIFIED' && user.status === 'ACTIVE'`.
- Retention: account anonymisation and admin hard-delete destroy the private assets; rejected/superseded documents are purged by a daily sweep after N days (D7).

### Clients

- seller-mobile / seller-web: commune cascade on both profile screens; a « Vérification » section (status chip « Non vérifié / Documents en cours de vérification / Vérifié / Vérification rejetée » + reason, document list per type, upload with progress, camera + gallery + file picker for PDF — `file_picker` must be added to seller-mobile).
- admin-web: « Vérification » card on the seller detail page (documents, type, dates, status, reason, history via `listForEntity('seller_profile', id)`), approve/reject/revoke dialogs, verification column/filter on the list, Action Center tile.
- buyer-web / buyer-mobile: PDP badge from `seller.verified`; « Officiel » from `seller.official`; the static « Vendeur vérifié » trust copy replaced by the real state or removed.

### PR breakdown (each → `develop`, merge commits, CI + CodeQL)

| PR | Scope | Migration |
|---|---|---|
| 1 | Commune foundation: `resolveCommune`, update DTO, profile include, both profile screens, admin list column, buyer-address validation, tests | none (D2 adds `Commune.isActive`: one additive file) |
| 2 | Verification domain + secure upload: enums, `SellerDocument`, hardened upload (limits, magic bytes, PDF/raw), signed-URL audit, retention hooks, audit actions, API + e2e | `seller_verification.sql` (+ notification enum value) |
| 3 | Seller UX: seller-mobile + seller-web verification section, onboarding hand-off, notifications (feed + push + email), runtime QA | none |
| 4 | Admin review: detail card, approve/reject/revoke, history, list filter, Action Center tile, runtime QA | none |
| 5 | Buyer badge: `sellerFlat.verified/official`, buyer-web + buyer-mobile PDP, trust copy, tests | none |

Why not fold 5 into 2: the badge is the only buyer-visible change and must land after admins can actually verify someone (4), otherwise every seller loses « Vérifié » with nothing to replace it — that is itself a policy choice (D5).

## Decisions — approved 2026-09-05 (source of truth)

- **D1 — Two axes.** `applicationStatus` stays the permission to operate/sell; a separate verification lifecycle is introduced. An approved seller may stay non-verified; revoking verification never suspends or rejects the account.
- **D2 — Commune.** `Commune.isActive` added (PR 1). Only authoritative commune data — **no invented names for Likasi or any city**; the architecture accepts a city without communes and requires the commune the day a library is added, with no client change. Existing sellers without a commune remain usable.
- **D3 — Evidence.** Registered business: RCCM + Identification Nationale + official identity document of the responsible person. Individual seller: an individual route based primarily on an official identity document plus the required profile information. RCCM is never required of every seller. Requirements are modelled as data (document types per seller type), not schema.
- **D4 — Commune requirement.** Required for new sellers when the selected city has an active commune library; `communeId = NULL` legacy rows stay valid. The API always enforces `commune.cityId === seller.cityId` and rejects inactive/deleted/wrong-city communes; a city change clears or re-selects the commune, never keeps an inconsistent pair.
- **D5 — State + badge.** `NOT_SUBMITTED → PENDING_REVIEW → VERIFIED | REJECTED` with timestamps/actor/revocation. Buyer label « Vérifié » meaning only « Teka a examiné les documents justificatifs fournis par ce vendeur » — no government endorsement, authenticity or financial guarantee. Legacy sellers are never auto-verified; an admin must review them under the new workflow. Replacing material evidence after verification moves the seller back to `PENDING_REVIEW`.
- **D6 — Placement.** Product-detail seller identity section (web + mobile), and a seller/store page if one exists; not product cards in this phase. Both buyer clients read the same authoritative state.
- **D7 — Retention.** Configurable: current evidence kept while the verification relationship needs it; rejected/superseded binaries ≈ 90 days then securely removed; non-sensitive audit metadata kept longer; account anonymisation/deletion removes the sensitive documents. No orphan Cloudinary assets.
- **D8 — Authorization.** ADMIN only: view documents, signed URLs, approve, reject, revoke, re-verify. SUPPORT: status only. Seller: own evidence upload/status only. Buyer/public endpoints never expose URLs, public ids, filenames, ids or evidence metadata.

## PR 1 — `feat/seller-commune-foundation` (2026-09-05) — merged as #659 `3d4addf`, CI + CodeQL green on `develop`

**Root cause of the profile inconsistency.** `UpdateSellerProfileDto` had no `communeId` and `SellersService.updateProfile` validated `cityId` alone, so an approved seller could move their town while `communeId` kept pointing at a commune of the previous town; the only coupling lived inline in `apply()`. Both profile screens simply had no commune field.

**Reused, not rebuilt.** `Commune` model + `SellerProfile.communeId` relation (June migration, in prod), `GET /v1/cities` + `GET /v1/cities/:id/communes` (public), the existing onboarding cascades on both clients, the admin cities CRUD, the admin detail rows.

**Schema / migration.** One additive, idempotent file `2026-09-05_commune_is_active.sql` (`communes.isActive BOOLEAN NOT NULL DEFAULT TRUE` + `(cityId, isActive)` index), appended to `auto-apply.list`. Every existing commune stays active, old code never reads the column. Justification: without it, retiring a commune is a hard `DELETE … ON DELETE SET NULL` that silently erases seller and address locations; the flag lets admins retire (hidden from pickers, refused for new selections) while existing rows keep their reference.

**API.** `CitiesService.resolveCommune(communeId, expectedCityId?)` is the single source of truth (exists, active, active city, belongs to the sent city → returns the commune's own `cityId`); `assertActiveCity`, `cityHasActiveCommunes`. `apply` and `updateProfile` both go through it: a commune derives the city; a city alone is accepted only when it has no active library (D2) and, on a town change, clears the old commune; `communeId: null` clears only where no library exists; legacy `NULL` stays untouched. `ApplySellerDto.communeId` is optional at the DTO layer (the service requires it per city); `UpdateSellerProfileDto.communeId` added. Public commune listing returns active communes only; the admin listing includes retired ones; admin `PATCH` toggles `isActive`; admin `DELETE` is refused (409) while sellers/addresses reference the commune. `/me`, `GET /v1/sellers/profile`, the admin sellers list and the admin users list now carry `city { id, name }` + `commune { id, name }`.

**Clients.** seller-mobile: `core/utils/commune_rules.dart` (required / retained / hint, unit-tested) shared by the shop profile (new Ville → Commune → Adresse cascade, `showAppSnackbar`, API error passthrough) and the application (commune required only when the library is non-empty). seller-web: `lib/commune-rules.ts` (vitest) shared by `/dashboard/profile` (new cascade with retry) and `/devenir-vendeur` (conditional requirement). admin-web: « Ville / Commune » column on the sellers list; retire/restore toggle + 409-aware delete on the cities page. Buyer surfaces untouched.

**Legacy compatibility.** Production has two approved sellers with `communeId = NULL`: they load, edit and save without a commune as long as the town is unchanged; picking a commune or changing town applies the rule. No backfill.

**Tests (automated, fresh on the branch).** API 629 unit (+22: `cities.service.spec` resolver/visibility/retire matrix, `sellers.service.spec` apply + update matrix incl. wrong pair, inactive, city-without-library, legacy NULL) / 142 e2e; root type-check; seller-web vitest 4 files (+`commune-rules.test.ts`) + lint; admin-web vitest 3 + lint; seller-mobile analyze 0 warnings + 135 tests (+`commune_rules_test.dart`).

**Runtime (2026-09-05, isolated dev stack: API `:5051` from the rebuilt dist with the dev DB migrated by the same idempotent SQL, seller-web `:5100`, admin-web `:5200`, Android emulator dev-flavor build pointed at `:5051`; disposable fixtures « Boutique QA Commune » (Lubumbashi · Kampemba), « Boutique QA Legacy » (Lubumbashi, no commune), an applicant without profile, and Likasi temporarily activated with 0 communes — all deleted/restored afterwards, 0 `@example.test` users left):**

| Check | API (curl) | Seller Web | Seller Mobile (emulator) | Admin Web |
|---|---|---|---|---|
| Public library: Lubumbashi 6, Kolwezi 2, Likasi 0 | ✓ | ✓ (selects) | ✓ (dropdowns) | ✓ (cities page) |
| City change clears/re-selects commune | ✓ (Kolwezi alone → 400 « commune requise ») | ✓ (list swapped, value cleared) | ✓ (value cleared, « Commune * ») | — |
| Save without commune where required | ✓ 400 | ✓ blocked « Veuillez sélectionner votre commune. » | ✓ snackbar « Veuillez sélectionner votre commune » | — |
| Valid pair saved (Kolwezi · Dilala / Lubumbashi · Kampemba) | ✓ | ✓ persisted (verified via API) | ✓ persisted (verified via API) | list shows « Lubumbashi · Kampemba » |
| Wrong pair (city A + commune B) | ✓ 400 « ne correspond pas » | n/a (UI cannot build it) | n/a | — |
| Commune alone derives city | ✓ | — | — | — |
| City without library (Likasi) | ✓ 200, commune cleared | ✓ helper « Aucune commune enregistrée… », field disabled | ✓ same, saved, commune cleared | — |
| Legacy seller (NULL) rename / same city | ✓ | ✓ rename saved, commune stays NULL | — | list shows « Lubumbashi » only |
| Onboarding: Likasi optional vs Lubumbashi « Commune * » | apply rule unit-tested | ✓ loading → required (6) / optional | ✓ both states | — |
| Retire commune (isActive=false) | ✓ public 5 / admin 6, seller pick → 400 « Commune inactive » | — | — | ✓ « Inactive » chip + Réactiver |
| Delete referenced commune | ✓ 409 « désactivez-la plutôt » | — | — | (409 message surfaced by the handler; not clicked) |

Not exercised at runtime: submitting a full application (needs the KYC photo upload — the apply location rule is covered by unit tests); the mobile onboarding submit; iOS (not driven). Buyer surfaces untouched by this PR.

## PR 2 — `feat/seller-verification-domain` (2026-09-05): verification domain + secure document upload

### Security/design pass — what the live Cloudinary probe changed (dev cloud, assets destroyed afterwards)

| Probe | Result | Consequence |
|---|---|---|
| Signed DELIVERY URL (`sign_url` + `expires_at`) on an authenticated image, fetched **after** expiry | **200** | The legacy 600 s admin link was effectively permanent. Nothing in PR 2 uses signed delivery URLs; the legacy application-photo link now uses the download endpoint below and is audited. |
| `utils.private_download_url` (api.cloudinary.com/…/download) for raw PDF and image, before / after expiry | 200 / **401** | Adopted for every admin document link (`SELLER_DOCUMENT_URL_TTL_SECONDS`, default 120 s). |
| Bare authenticated URL, image and raw; public-type guess | 401 / 401 / 404 | Private storage holds. |
| Incoming transformation on upload (`quality: auto:best`) | EXIF **kept** on the stored original | Metadata is stripped **server-side before upload** (`document-validation.ts`: JPEG APP1/COM, PNG eXIf/tEXt/zTXt/iTXt, WebP EXIF/XMP) — verified live: the stored JPEG no longer carries the marker. |
| `uploader.destroy(id)` without `type`/`resource_type` on an authenticated raw asset | `not found` (asset left in place) | `deletePrivateAsset(id, resourceType)` always passes `type: authenticated` + the resource type. |

### Verification state model (D1/D5)

`SellerProfile.verificationStatus` `NOT_SUBMITTED → PENDING_REVIEW → VERIFIED | REJECTED`, `REJECTED → PENDING_REVIEW` (seller re-submits) `| VERIFIED` (admin re-review), `VERIFIED → REJECTED` (revoke, `verificationRevokedAt`), `VERIFIED → PENDING_REVIEW` (seller replaces a material document). Fields: `verificationSubmittedAt`, `verifiedAt/ById`, `verificationRejectedAt`, `verificationRevokedAt`, `verificationNote`. `applicationStatus` is never touched; legacy sellers default to `NOT_SUBMITTED`.

### Document model

`seller_documents` (row per upload, never hard-deleted): `type` (RCCM · IDENTIFICATION_NATIONALE · IDENTITY_DOCUMENT · OTHER + `label`), `cloudinaryId` (API-generated `teka-rdc/seller-documents/<profileId>/<docId>[.pdf]`, unique), `resourceType` image|raw, `mimeType`, `sizeBytes`, sanitised `originalName`, `status` PENDING · ACCEPTED · REJECTED · SUPERSEDED, `rejectionReason`, `submittedAt`, `uploadedAt` (NULL = orphan candidate), `reviewedAt/ById`, `supersededAt/ById`, `purgeAfter`, `purgedAt`. Requirements per seller type live in `requirements.ts` (company: RCCM + Identification Nationale + identity document; individual: identity document), so the rule evolves without schema change.

### Upload transaction / orphan strategy

Row first (with the future public_id), upload second, `uploadedAt` stamped in the domain transaction together with supersede + status changes. Upload fails → row deleted. Domain write fails → `discard()` destroys the asset and deletes the row. Crash in between → daily sweep reconciles rows with `uploadedAt IS NULL` older than 1 h (destroy asset, delete row). Retry with the same id cannot overwrite (`overwrite: false`).

### File validation

Multer `limits.fileSize` (rejects while streaming, 413 « Le fichier dépasse la taille maximale autorisée »), then magic bytes (PDF `%PDF-`, JPEG `FFD8FF`, PNG signature; WebP recognised only for the legacy application photo), declared MIME must agree with the bytes, executables/archives/SVG/HTML refused, filename sanitised, image metadata stripped, PDF stored as `raw` (Cloudinary never decodes it — hence the mandatory magic-byte gate).

### Authorization

Seller (`@Roles('SELLER')`, profile resolved from the JWT): `GET /v1/sellers/verification`, `POST /v1/sellers/verification/documents` (multipart `document` + `type` + `label`). Admin (`/v1/admin/sellers/:id/verification`): `GET` ADMIN + SUPPORT (metadata only, no storage id, no URL), `GET documents/:docId/url` ADMIN (audited `SELLER_DOCUMENT_VIEWED`), `POST approve|reject|revoke` ADMIN (reason required for reject/revoke). Buyer/browse payloads unchanged (`{ id, businessName }`, pinned by `browse.service.spec`).

### Retention (D7, configurable)

`SELLER_DOCUMENT_RETENTION_DAYS` (90): rejected/superseded binaries get `purgeAfter`; the daily sweep destroys the asset and stamps `purgedAt`, the row stays. Accepted evidence is kept. Account anonymisation calls `purgeAllForSeller` (all binaries, rows kept) and destroys + clears the legacy application photo; failures are re-queued for the sweep.

### Audit

`AdminAuditService` (same table, `entityType: seller_profile`): `SELLER_DOCUMENT_SUBMITTED | REPLACED | VIEWED`, `SELLER_VERIFICATION_SUBMITTED | APPROVED | REJECTED | REVOKED`, actor = seller user id or admin id, before/after status, reason. Transitions are conditional `updateMany` + audit row in one transaction (409 on stale). Notifications (`SELLER_VERIFICATION` feed row + push, email fallback, `seller-verification.template.ts`) run after commit and never affect the outcome.

### Migration

`2026-09-05_seller_verification.sql` (auto-apply, after the commune file): three enums, seven nullable/defaulted columns on `seller_profiles` + index, `seller_documents` table + 4 indexes, `UserNotificationType.SELLER_VERIFICATION`. Every existing seller becomes `NOT_SUBMITTED`; no evidence migrated, nothing dropped. Applied to the dev DB with the same SQL; **not** to production. Config: `SELLER_DOCUMENT_MAX_MB` (5), `SELLER_DOCUMENT_RETENTION_DAYS` (90), `SELLER_DOCUMENT_URL_TTL_SECONDS` (120) — all with Joi defaults, no deploy env change required.

### Verification

**Automated:** `document-validation.spec` (sniff, forged MIME, exe/zip/svg/html, EXIF/PNG/WebP stripping, filename), `seller-document-storage.service.spec` (row-first order, failed upload → row deleted, discard, TTL link, retention deadline, purge, sweep), `seller-verification.service.spec` (own profile only, requirement sets, supersede + retention, D5 material replacement, self-verify impossible, failure isolation, notification failure, approve/reject/revoke + 409, SUPPORT-safe views, no storage id in any payload), `seller-verification.authz.spec` (decorator roles), `seller-verification.e2e-spec` (401 on every route incl. the legacy link), `browse.service.spec` (public seller shape), updated `sellers.service.spec` (legacy photo hardening) and admin/deletion specs.

**Live smoke on the isolated dev stack (2026-09-05, disposable company seller + SUPPORT user, all rows/users/assets deleted afterwards — 0 raw assets left in the folder):** NOT_SUBMITTED with three missing types → PDF/PNG/JPEG accepted → PENDING_REVIEW once complete; PNG-declared-as-PDF 400, `.exe` as JPEG 400, 6 MB PDF 413 (French), OTHER without label 400; re-upload supersedes; seller → admin URL route 403; unauthenticated upload 401; admin GET shows every document + SELLER_* history, no `cloudinary` string in the payload; admin URL host `api.cloudinary.com`, PDF fetched 200, stored JPEG has no EXIF marker; SUPPORT: GET 200, URL 403, approve 403; reject without reason 400; approve → VERIFIED + ACCEPTED docs; stale approve 409; VERIFIED seller replaces RCCM → PENDING_REVIEW; reject with reason → seller sees the reason; re-approve; revoke without reason 400; revoke → REJECTED with `verificationRevokedAt`, `applicationStatus` still APPROVED; four feed rows (reçus / vérifiée / refusée / retiré); rejected + superseded rows carry `purgeAfter`; 0 API errors.

## PR 3 — `feat/seller-verification-ux` (2026-09-05): Seller Mobile + Seller Web verification UX

### Placement and copy

Both surfaces put « Vérification de la boutique » in the existing account structure rather than a new top-level area. Seller-mobile: a Paramètres tile on the Compte tab (subtitle = current status) opening `/profile/verification`. Seller-web: a sidebar item « Vérification » in the Compte group plus a card on Profil et réglages (status + « Gérer mes documents »), page `/dashboard/verification`. Status labels are the same four strings everywhere: « Non vérifié », « En attente de vérification », « Vérifié », « Vérification refusée ». The explanatory copy states only that Teka RDC examined the documents (« il signifie uniquement que Teka a examiné ces documents ») — no certification or guarantee wording. The rejected state says explicitly that the shop stays active. A footer sentence states that documents are private, consulted only for this verification and never published.

### Server-driven rules (no client rule copy)

Both clients render from `GET /v1/sellers/verification`: `requiredTypes` decides which tiles are « Requis » (company: RCCM + Identification Nationale + Pièce d'identité; individual: Pièce d'identité), `missingTypes` drives « Il manque N document(s) pour lancer la vérification. », and the only optional tile is OTHER (« Autre document officiel », label asked before upload). The one API change in this PR is additive: the status payload now carries `limits { maxSizeBytes, acceptedMimeTypes }` (from `SELLER_DOCUMENT_MAX_MB`), which both clients use for the « 5 Mo maximum » caption and the local pre-check. The local pre-check (empty / oversize / magic bytes not PDF-JPEG-PNG) only saves a round-trip; the server remains the authority and its French 4xx message is shown verbatim on refusal.

### Upload behaviour

Mobile: bottom sheet « Prendre une photo / Choisir une photo / Choisir un fichier PDF » (image_picker, JPEG quality 85; `file_picker` 12 restricted to `.pdf`, bytes read in memory). Web: hidden `<input type=file>` per tile with `accept` on the three formats. Both: one in-flight upload at a time (busy guard prevents duplicate taps, every other button disabled), progress bar (« Envoi… » then « Vérification du fichier… » once bytes are sent), success snackbar/banner, error message with « Réessayer », and the status is re-fetched after every upload so the card and tiles always reflect the server state. State-specific behaviour: NOT_SUBMITTED lists missing documents; PENDING_REVIEW says no action is required, replacement still allowed; VERIFIED shows « Accepté » per document and a confirm dialog « Remplacer ce document ? » before any material replacement (D5: the shop goes back to « En attente de vérification »); REJECTED shows the admin reason on the card and on each refused tile with a primary « Remplacer » action for resubmission. No Cloudinary id, storage path or admin URL exists in the seller payload, so nothing had to be hidden client-side; the client never logs document bytes, filenames or API bodies.

### Notifications / deep links

Existing infra only. Mobile: `NotificationRouter` maps push `data.screen = 'verification'` and feed rows with `entityType = 'seller_verification'` / `type = 'SELLER_VERIFICATION'` to `/profile/verification`; the Centre de notifications renders the type with the verified icon. Web: `hrefForNotification` maps the same rows to `/dashboard/verification`; the bell dropdown rows link there.

### Fix found by the emulator pass — auth interceptor vs multipart replay (both Flutter apps)

Uploading with an expired access token produced « Votre session a expiré » and a wiped session, although the refresh itself succeeded: after refreshing, `AuthInterceptor` re-sent the original request, and replaying a consumed multipart `FormData` throws; that throw fell into the generic catch that clears tokens. The replay is now wrapped in its own try/catch — a failed replay after a successful refresh is passed through as the original error with tokens kept — and `VerificationRepository.uploadDocument` rebuilds the form and retries exactly once on 401. Mirrored byte-for-byte into buyer-mobile (`diff` clean), regression test in both apps (`test/core/network/auth_interceptor_test.dart`).

### Verification

**Automated:** seller-mobile 156 tests (15 widget tests on the screen: individual/company requirements, pending-picker double tap, local refusals, API refusal + retry, all four states, D5 dialog, OTHER label; repository retry-once; interceptor; router), `flutter analyze` 0 warnings (20 pre-existing infos); buyer-mobile 240 tests, 6 infos; seller-web vitest 22 (`verification.test.ts`), `tsc` clean, eslint 0 errors, `next build` clean; API 672 unit / 150 e2e (unchanged security suites), root `pnpm type-check` clean.

**Actually exercised on the isolated dev stack (2026-09-05, disposable sellers, everything deleted afterwards — 0 `example.test` users, 0 raw assets, the 2 image assets left in the folder date from June 2026 and are unrelated):**
- Seller-web, company seller (Chrome DevTools, 1280 px and 390 px): NOT_SUBMITTED with 3 required tiles → `.exe` refused locally (« Format non supporté ») → 6 MB PDF refused locally (« Le fichier dépasse 5 Mo. ») → PDF + PNG + JPEG accepted → PENDING_REVIEW → admin approve → VERIFIED (« Accepté ») → « Remplacer » → warning dialog → upload → PENDING_REVIEW → admin reject with reason → REJECTED with the reason on the card and the tile; four bell rows (reçus / vérifiée / reçus / refusée) all linking to `/dashboard/verification`; profile card shows the status; narrow layout stacks without horizontal overflow.
- Seller-mobile, individual seller (Android emulator, dev flavor pointed at the isolated API): Compte tile with « Non vérifié » → screen with 1 required tile → source sheet → PDF picker → progress → PENDING_REVIEW (« En cours de vérification · PDF, 303 o ») → admin approve → « Vérifié » / « Accepté » → « Remplacer » → dialog « Remplacer ce document ? » → gallery JPEG → success snackbar → PENDING_REVIEW → admin reject → « Vérification refusée » with the reason on the card and the tile; Centre de notifications shows the four SELLER_VERIFICATION rows and tapping one opens the verification screen. Earlier on the same emulator: oversize gallery image refused locally with « Réessayer », and the expired-token upload that exposed the interceptor bug (re-tested green after the fix and a rebuilt APK).

**Not exercised:** a real FCM push tap (emulator has no dev Firebase project — covered by `notification_router_test.dart`), the camera source (emulator camera), iOS.

### Known limitations / left for PR 4–5

- The mobile Centre de notifications loads once on authentication and refreshes on push or pull-to-refresh (pre-existing design, `notifications_provider.dart`); a verification row created while the app is open and no push is delivered appears after pull-to-refresh.
- No admin UI yet (PR 4): approvals/rejections in this pass were done through the admin API. No buyer badge yet (PR 5): `seller.verified` is not exposed to buyers, so a VERIFIED seller sees « Le badge apparaît sur vos fiches produits » before buyers can see it — PR 5 must land before this copy is true in production.

## PR 4 — `feat/admin-verification-review` (2026-09-05): Admin verification review UI

### What the admin gets

- **Seller list** (`/dashboard/sellers`): a « Vérification » column with the four short labels (Non soumis / En attente / Vérifié / Refusé) on every row, a URL-backed `?verification=` select (« Toutes » + the four states) that combines with the existing application-status tabs, and the shop name now links to the seller detail page. The applications endpoint gained a `verification` query param validated against the enum (400 otherwise); `?verification=PENDING_REVIEW` alone is exactly `ADMIN_QUEUES.sellerVerificationsPending()` (spec-pinned), so the Action Center tile and the list can never disagree. The users listing exposes `verificationStatus` in its seller select so the « Tous » tab shows the column too.
- **Action Center**: new queue `sellerVerificationsPending` (counted by `admin-stats.service` from the same where builder) → tile « Vérifications à examiner » linking to `/dashboard/sellers?verification=PENDING_REVIEW`; the dashboard refetches on mount, so the count follows every decision.
- **Seller detail** (`/dashboard/sellers/[id]`): header chips « Compte : … », « Demande : … », « Vérification : … », and the new card « Vérification des documents » (`components/sellers/seller-verification-card.tsx`). The card opens with three tiles that are never conflated — *Compte vendeur* (application + account status), *Examen des documents* (verification status + the relevant date), *Badge « Vérifié »* (Affiché / Non affiché, seller type, city · commune) — then the requirement checklist (`requiredTypes` ✓/○ against `missingTypes`), the live documents (type, label, format, size, submitted/reviewed dates, per-document status and rejection reason), the actions, and a collapsible timeline plus the archived versions (superseded/rejected rows with their retention deadline or « fichier supprimé »).

### Rules stay on the server

The API's `getForAdmin` now returns `actions { approve, reject, revoke }` computed by `allowedAdminActions(status, evidenceComplete)` — the same `from` lists the transitions use — and `approve` itself refuses (409, French message) while a required document is not live, so a badge can never be granted on an incomplete or rejected set, whatever the client sends. The card renders buttons only from `actions`; « Réexaminer et vérifier » is `approve` offered from REJECTED (typically after a revoke, while the accepted evidence is still live). Reason bounds (5–500) mirror `ReviewVerificationDto` for immediate feedback; the DTO stays authoritative.

### Document access

Only the PR 2 mechanism: « Voir le document » calls `documents/:id/url` on click, the card holds the returned link for its `expiresInSeconds` with a visible countdown, offers « Ouvrir » through `window.open` (no `<a href>`, so no autocaptured attribute) and an inline preview for images, and drops the link at expiry (« Le lien de consultation a expiré … Générez un nouveau lien »). One link at a time; a decision or « Actualiser » clears it. Errors map 403/404/410/other to French copy without echoing any URL. Live test with the real 120 s TTL: link fetched at issue (200 image/jpeg), the same URL after expiry → **401 from Cloudinary**, UI shows the expired notice and a working « Générer un nouveau lien » (new signature, 200); PDF opened in a new tab in Chrome's viewer. `SELLER_DOCUMENT_URL_TTL_SECONDS` was not changed.

### Stale state

Every decision is one POST; a 409 (another admin or the seller moved first) reloads the authoritative view and says what changed (« L’état a changé entre-temps : En attente → Vérifié. L’état affiché a été rechargé ; vérifiez avant d’agir de nouveau. »). Exercised live: individual seller approved through the API while the page's « Refuser » dialog was open → 409 → message, card reloaded to VERIFIED with only « Révoquer » left, header chip updated. Submit lock prevents double posts; buttons disable while a dialog is open.

### History

The SELLER_* audit rows are mapped server-side to `{ action, createdAt, reason, actor{name, role}, fromStatus, toStatus, documentType }` — raw before/after payloads (document ids, link TTLs, sizes) are not exposed. Actors are resolved in one `user.findMany`; the seller shows as « … (vendeur) ». An approval's optional note is labelled « Note interne » (it is stored on the profile and audited but never sent to the seller: the feed/email only carry reasons for refusals and revocations, and the seller status hides the note unless REJECTED).

### Sensitive data

No console/Sentry/PostHog call in the new code; the link panel is `ph-no-capture`; `posthog-scrub.ts` additionally rewrites any `cloudinary.com` URL to `[document-link]` (test added). `sentry-scrub.ts` is shared across the three web apps and was left unchanged — no breadcrumb carries the link because it is never an `<a href>` and the `<img>` load does not produce one.

### Authorization (API, live on the isolated stack)

| Caller | GET verification | documents/:id/url | approve / reject / revoke | list `?verification=` |
|---|---|---|---|---|
| unauthenticated | 401 | 401 | 401 | 401 |
| SELLER | 403 | 403 | 403 | 403 |
| SUPPORT | 200 (no storage id, no URL) | 403 | 403 / 403 / 403 | — |
| ADMIN | 200 | 200 | 200 (409 on incomplete evidence / stale) | 200 (400 on unknown value) |

admin-web itself signs any non-ADMIN role out at the dashboard layout (pre-existing: a SUPPORT login succeeded at `/auth/login/email`, then the layout called logout and returned to `/login`), so the card's read-only branch for SUPPORT is defensive only.

### Verification

**Automated:** API 676 unit (`allowedAdminActions` table, approve refused on missing/rejected evidence — also from REJECTED —, re-review from REJECTED with live accepted evidence, history mapping with resolved actors and no raw payload keys, `?verification=` queue reconciliation + 400) / 151 e2e (401 on the filtered list); admin-web vitest 46 (`seller-verification.test.ts`, action-center tile/params, PostHog scrub), `tsc`, eslint (2 pre-existing `<img>` warnings elsewhere), `next build`; root type-check.

**Actually exercised in Chrome (isolated dev stack, disposable fixtures deleted afterwards — 0 `example.test` users, 0 raw assets, the two June-2026 image assets pre-date this work):** dashboard tile « Vérifications à examiner : 2 » → filtered list (2 rows, column, select) → company detail card (3 required ✓, 3 documents, history 4) → JPEG link: inline preview + countdown, curl 200, **expiry → 401 + UI notice + regenerate 200** → PDF link → « Ouvrir le PDF » opened Chrome's PDF viewer → « Vérifier » dialog → VERIFIED (docs Accepté, badge Affiché, only Révoquer, seller feed « Boutique vérifiée ») → history timeline (approval, consultations, submissions with actor names) → « Révoquer » with empty reason refused inline → with reason → REJECTED (« Révoqué le », reason on card, accepted evidence kept, « Réexaminer et vérifier », seller feed « Badge « Vérifié » retiré ») → re-review with internal note → VERIFIED → seller replaced its RCCM through the API → « Actualiser » → PENDING_REVIEW, « Document remplacé · RCCM » in history, old RCCM under « Anciennes versions » with its purge date → **stale 409** on the individual seller → company « Refuser » with reason → REJECTED (RCCM shown « manquant », « Aucune action possible », seller feed and seller status carry the reason) → seller re-submitted → PENDING_REVIEW with actions back → incomplete company: « Non soumis », two « manquant » chips, no action → 500 px viewport: detail stacks with no horizontal overflow, the 10-column list now scrolls inside its card (was clipped by `overflow-hidden`) → empty list state (« Aucun vendeur trouvé » for `?verification=REJECTED`) → API stopped: card error « Impossible de charger la vérification de ce vendeur. » + « Réessayer » → API restarted → retry recovered → dashboard tile down to 1. Loading state = skeleton rows (seen transiently, not screenshotted).

**Not exercised:** a viewport narrower than 500 px (the DevTools window would not resize below that), a SUPPORT user inside admin-web (blocked by the existing layout guard), a real second browser session (the concurrent admin was simulated with the API).

### Known limitations / left open

- The seller detail page is keyed by user id, the verification API by seller profile id; the page passes `sellerProfile.id` down. Nothing links from the list to the *application* KYC photo any more than before.
- PR 5 still has to expose `seller.verified` to buyers and replace the hardcoded « Vérifié » chip; until then the card's « Badge « Vérifié » : Affiché » describes the intended state, not what buyers currently see.

## PR 5 — `feat/buyer-verified-badge` (2026-09-05): Buyer « Vérifié » badge — initiative complete

### What changed for buyers

- **Public contract.** The seller shape every browse endpoint returns (product lists, popular/newest, detail `sellerFlat`) is now exactly `{ id, businessName, verified, official }` — `toPublicSeller()` in `browse.service.ts`, fed by the allow-list select `PUBLIC_SELLER_SELECT` (`id, firstName, lastName, sellerProfile { businessName, verificationStatus }`). `verified` is derived server-side from `verificationStatus === 'VERIFIED'` and nothing else; `official` from the platform seller user id (`common/platform-seller.ts`, the seed's `10000000-…-000000999999`), never from the business name. Neither the status, the documents, notes, reasons, actors, timestamps nor any link reaches a buyer payload (spec + e2e pinned).
- **Hardcoded trust removed.** buyer-web PDP and buyer-mobile PDP rendered « Vérifié » for every seller not named `'Teka RDC Officiel'` and « Officiel » by name comparison; product cards keyed « Officiel » off the name too; the PDP trust strip, the cart and the home hero carried static « Vendeur(s) vérifié(s) » claims. Now: the PDP badge (`components/product/seller-badge.tsx` / `PdpSellerBadge`) renders « Vérifié » only when `seller.verified`, « Officiel » only when `seller.official` (official wins, one badge), nothing otherwise — no public « Non vérifié »; the PDP trust-strip row « Vendeur vérifié » appears only when `seller.verified`; cart and hero say « Vendeurs approuvés (par Teka RDC) », which is true of every seller allowed to sell; cards use `seller.official` for the existing « Officiel » line and carry no « Vérifié » (policy: PDP first, cards stay clean).
- **Copy.** Visible badge « Vérifié »; help text (web `title` + `aria-label`, mobile long-press `Tooltip` + semantics label) « Teka a vérifié les documents justificatifs fournis par ce vendeur. » — no certification/guarantee wording (tested).
- **No seller/store page** exists on either buyer client (Phase 0 §12 confirmed again); JSON-LD `offers.seller` stays `{ @type: Organization, name }`, no verification/certification property added; canonical, robots (`index, follow` on PDPs) and sitemap untouched; SSR HTML of a verified PDP contains no `verificationStatus`/`cloudinary`/note strings (checked).
- **Freshness.** buyer-web fetches the product client-side on every PDP visit (unchanged); buyer-mobile's `productDetailProvider` is now `autoDispose` so every PDP open refetches (pull-to-refresh still works) — a revoked badge cannot outlive the app session. No polling added.
- **Seller/admin copy corrected.** Seller « Non vérifié » hint now says the badge appears « sur vos fiches produits » (there is no shop page); the VERIFIED hint, the email and the admin card already described product pages.

### Verification

**Automated.** API 680 unit (`toPublicSeller`: VERIFIED → true, NOT_SUBMITTED/PENDING_REVIEW/REJECTED/null → false, `official` from the id only, exact key set, over-fetched internals never leak, name fallbacks; the PR 2 select pin now asserts the exact allow-list) / 152 e2e (public detail shape `{ id, businessName, verified, official }`, VERIFIED profile → `verified: true` with no status/note in the body); buyer-web vitest 78 (`seller-badge.test.tsx`: verified/unverified/name-only/official precedence/icon + help text), tsc, eslint (1 pre-existing warning), build; buyer-mobile 245 (`product_model_test`: flags from JSON, defaults false, name never implies; `product_detail_summary_test`: verified badge + tooltip, unverified named « Teka RDC Officiel » shows nothing, official precedence, long name no overflow; card/section-order fixtures now set `official: true` explicitly), analyze 6 pre-existing infos; seller-web 22, seller-mobile verification 17; root type-check.

**Live authorization (isolated stack).** A mock-OTP BUYER got 403 on admin verification GET/url/approve, on the seller status route and on the filtered admin list; PR 2/4 suites untouched.

**Actually exercised (disposable sellers with one product each, deleted afterwards — 0 `example.test` users, 0 QA products, 0 raw assets):**
- Android emulator (dev flavor on the isolated API): VERIFIED PDP « ✓ Vérifié » next to the seller name; PENDING_REVIEW, revoked (REJECTED) and NOT_SUBMITTED PDPs show no badge and no « Non vérifié »; 70-character seller name wraps without overflow; long-press shows the help tooltip; real transitions on one seller through the API — upload → admin approve → open PDP → badge; revoke → back + reopen → badge gone; re-approve → reopen → badge back.
- Chrome (1280 and 500 px): VERIFIED PDP with the « Vendeur vérifié » trust row and the « VÉRIFIÉ » chip (`title` + `aria-label`, icon + text), similar-product cards without any badge; after the same revoke the page shows neither the row nor the chip; after re-approval both return on reload; no horizontal overflow at 500 px.
- API only (public flag after each step): PENDING_REVIEW → VERIFIED true; material identity-document replacement while VERIFIED → PENDING_REVIEW false; reject → false; re-submission → PENDING_REVIEW false; approve → true.

**Not exercised.** « Officiel » live (the dev DB has no platform seller user/products — unit-tested only); a viewport narrower than 500 px on web; iOS.

### Initiative completion audit (PRs 1–5 on the combined `develop` + this branch)

| Contract | Owner | State on the combined branch |
|---|---|---|
| City ↔ Commune | PR 1 `CitiesService.resolveCommune`, `Commune.isActive` | apply/updateProfile/buyer address all go through it; legacy `NULL` communes untouched; admin toggle + list column; no later PR touched it. |
| Verification state machine | PR 2 service, PR 4 `allowedAdminActions` + evidence-gated approve | Single `transition()` (conditional `updateMany` + audit, 409); seller uploads own the NOT_SUBMITTED → PENDING_REVIEW and D5 VERIFIED → PENDING_REVIEW moves; approve/reject/revoke admin-only. |
| Document upload / storage / retention | PR 2 | Row-first Cloudinary ownership, magic bytes, EXIF strip, PDF raw, `purgeAfter` on rejected/superseded, daily sweep, purge on anonymisation; PR 3/4/5 read only. |
| Admin authorization & signed links | PR 2 routes, PR 4 UI | ADMIN-only links (120 s, expiry enforced — re-proven live in PR 4), SUPPORT status-only, SELLER/BUYER 403, unauthenticated 401 (e2e). |
| Notifications | PR 2 `notifyVerification` (feed + push + email fallback) | Consumed by seller surfaces (PR 3 deep links) and admin decisions (PR 4 invokes the API only); reasons only for refusals/revocations. |
| Seller UX | PR 3 | Copy now matches the real placement (« fiches produits »). |
| Admin Action Center | PR 4 `ADMIN_QUEUES.sellerVerificationsPending` | Count and list filter share one where. |
| Public badge / buyer privacy | PR 5 | `{ id, businessName, verified, official }` everywhere; pins in `browse.service.spec` + `browse.e2e-spec`. |
| Migrations | PR 1 `2026-09-05_commune_is_active.sql`, PR 2 `2026-09-05_seller_verification.sql` | Both additive, both in `manual/auto-apply.list` (lines 29–30, after the unrelated search-analytics file already listed at 26), applied to dev only. **Not applied to production.** PR 3/4/5 add no migration. |
| Configuration | PR 2 | `SELLER_DOCUMENT_MAX_MB` (5), `SELLER_DOCUMENT_RETENTION_DAYS` (90), `SELLER_DOCUMENT_URL_TTL_SECONDS` (120) — Joi defaults, no env-file or secret change required; `UserNotificationType.SELLER_VERIFICATION` shipped in the PR 2 migration. Dependencies: `file_picker` (seller-mobile, PR 3) only. |
| Deployment ordering | — | Expand-phase auto-apply runs both files before the rolling swap; old API code tolerates the new nullable/defaulted columns; every legacy seller becomes `NOT_SUBMITTED` (unverified) — so at release every current « Vérifié » chip disappears until an admin verifies someone (accepted in D5). Mobile: buyer-mobile and seller-mobile need a store release for the badge / verification screen; web ships with the deploy. |

Stale copy sweep: no remaining `'Teka RDC Officiel'` comparison in any client; no remaining static « Vendeur(s) vérifié(s) » outside the conditional PDP row; seller/admin/email copy consistent (« fiches produits »). No overlap or conflict between PRs found.

## Final merge status (2026-09-05) and release readiness

| PR | Branch | Merge commit on `develop` |
|---|---|---|
| 1 Commune foundation | `feat/seller-commune-foundation` | #659 `3d4addf` |
| 2 Verification domain + secure upload | `feat/seller-verification-domain` | #660 `1a27585` |
| 3 Seller UX | `feat/seller-verification-ux` | #661 `b5a5ed9` |
| 4 Admin review UI | `feat/admin-verification-review` | #662 `eeeb063` |
| 5 Buyer badge | `feat/buyer-verified-badge` | #663 `ba2abc3` |

`develop` = `ba2abc3`; CI run `33988785536` and CodeQL run `33988785346` green on that SHA. **Nothing deployed, no production migration, no production data touched, no store release.**

### Final cross-PR compatibility check on `ba2abc3`

| Area | Evidence |
|---|---|
| Commune selection | `CitiesService.resolveCommune` is the only city↔commune resolver; used by `sellers.service` (apply/update) and `cities.service`; retired communes hidden publicly, refused on delete while referenced; seller-web vitest 22 / seller-mobile 156 green. **Gap (pre-existing, not closed by PR 1):** `POST /v1/addresses` stores `cityId`/`communeId` from the buyer DTO without checking the commune belongs to the city or is active — data-integrity only (delivery zones key off `cityId`), no security impact. Follow-up below. |
| Verification state machine | One `transition()` (conditional `updateMany` + audit in a transaction, 409 on stale) behind approve/reject/revoke; seller uploads own NOT_SUBMITTED → PENDING_REVIEW and VERIFIED → PENDING_REVIEW (D5); approve refused while evidence incomplete; `allowedAdminActions` mirrors the `from` lists. API 680 unit / 152 e2e green (one `reports.e2e` failure appeared once while the Flutter suites competed for CPU; 3 isolated runs + a second full run green). |
| Document upload / retention | Row-first Cloudinary ownership, magic bytes, EXIF strip, PDF raw, orphan sweep + retention purge on `@Cron(EVERY_DAY_AT_4AM)`, purge on anonymisation — untouched since PR 2, specs green. |
| Admin authorization | Controller roles: seller routes `SELLER`; admin GET `ADMIN, SUPPORT`; link/approve/reject/revoke `ADMIN`; list filter `ADMIN`. Live matrix (PR 4/5): 401 anonymous, 403 SELLER and BUYER, SUPPORT read-only. |
| Buyer public API privacy | Every browse seller is `{ id, businessName, verified, official }` from `toPublicSeller()`; pinned by the select allow-list spec and the e2e VERIFIED case; SSR HTML and JSON-LD carry no internals. |
| Verified / official badges | web `SellerBadge` (2 call sites: PDP card + trust row) and mobile `PdpSellerBadge` render only from the flags; cards use `seller.official`; no name comparison left in any client. |
| Seller web / mobile | `/dashboard/verification` and `/profile/verification` present, notifications deep-link, copy says « fiches produits ». |
| Buyer web / mobile | buyer-web vitest 78 + build; buyer-mobile 245 + analyze (6 pre-existing infos); connectivity layer and `auth_interceptor.dart` still byte-identical between the two Flutter apps. |
| Admin web | vitest 46; `sellerVerificationsPending` tile/filter reconciled with the API queue. |
| Root | `pnpm type-check` clean across the five TS projects. |

### Remaining risks (carry into release notes)

1. **Every legacy seller ships unverified.** The migration sets `verificationStatus = NOT_SUBMITTED` for all sellers, so the current always-on « Vérifié » chip disappears from every PDP at deploy until an admin verifies a seller — accepted in D5, but sellers should be told (seller feed/email exist for the outcome, not for the launch itself; a broadcast is available via admin « Notifications »).
2. **Buyer address commune not validated server-side** (above). Low impact; fix as a small follow-up using `resolveCommune` in `addresses.service`.
3. **« Officiel » not exercised live** (no platform seller in the dev DB); unit-tested only. Production has the seeded « Teka RDC Officiel » user `10000000-…-000000999999`, so cards/PDP will show « Officiel » there exactly where they did before.
4. **Mobile store releases are a separate step**: the web badge and the admin/seller web UI ship with the deploy; buyer-mobile (badge, autoDispose PDP) and seller-mobile (verification screen, interceptor fix) need TestFlight/Play releases — until then mobile users keep the old name-based chip on buyer-mobile.
5. **Cloudinary**: production must hold the `CLOUDINARY_*` credentials already used for the June KYC photo; no new secret. Private authenticated assets and expiry-enforced download URLs were probed on the dev cloud only.
6. **Legacy KYC photo link** (`applications/:id/document`) now uses the expiry-enforced download URL — the admin list's « Voir la pièce » keeps working but links die after 120 s (expected).

### Production deployment order (execute only on explicit approval)

1. **Release PR** `develop → main` with a merge commit (`gh pr merge --merge`, never squash). Contents = the five merge commits above + the payouts release already on `main`; confirm `git diff main..develop --stat` shows only this initiative.
2. **Deploy (automatic on `main`)** — `deploy.yml`: image build → pull on the VPS → **expand phase** `apply-auto.sh` from the new api image runs the un-applied files in `auto-apply.list` order: `2026-09-05_commune_is_active.sql` then `2026-09-05_seller_verification.sql` (both additive + idempotent, recorded in `_manual_migrations`) → rolling swap of api, then the three web apps. If a migration fails the deploy aborts before the swap and the old containers keep serving. No manual `Apply prod migration` dispatch is needed for this initiative.
3. **Env**: nothing to add — `SELLER_DOCUMENT_MAX_MB`, `SELLER_DOCUMENT_RETENTION_DAYS`, `SELLER_DOCUMENT_URL_TTL_SECONDS` have Joi defaults (5 / 90 / 120). Optional overrides only.
4. **Post-deploy verification** (checklist below), then **`main → develop` back-merge** to keep the SHAs aligned.
5. **Mobile** (separate approval): seller-mobile version bump → `release-mobile-ipa.yml` / `release-mobile-aab.yml`; buyer-mobile the same. Web-only rollout is safe in between because the API changes are additive and old mobile builds ignore the new fields.

### Production checklist

**Before the release PR**
- [ ] `develop` == `ba2abc3` (or later docs-only commits), CI + CodeQL green.
- [ ] `apps/api/prisma/migrations/manual/auto-apply.list` ends with the two 2026-09-05 initiative files; both wrapped in `IF NOT EXISTS`/guards (17 and 2 occurrences).
- [ ] Production census (read-only): number of sellers, communes per city, `_manual_migrations` row count — to compare after.
- [ ] Sellers informed that the badge now requires document review (broadcast copy ready).

**Deploy watch**
- [ ] `deploy.yml` run: migration step logs both files as applied (or "already applied" on a re-run); rolling swap healthy.
- [ ] `_manual_migrations` gained exactly the two rows.

**Smoke tests (production, read-only unless stated)**
- [ ] `GET /health`, `/health/ready` 200.
- [ ] `GET /api/v1/browse/products?limit=3` → each `seller` is `{ id, businessName, verified, official }`; no `verificationStatus` string anywhere in the body.
- [ ] A PDP on `teka.cd` renders without the « Vérifié » chip for an ordinary seller; a « Teka RDC Officiel » product still shows « Officiel »; JSON-LD unchanged.
- [ ] `GET /api/v1/admin/sellers/<id>/verification` without cookie → 401; the admin list `?verification=PENDING_REVIEW` → 401.
- [ ] Admin web: Action Center shows « Vérifications à examiner : 0 », seller list shows the « Vérification » column (all « Non soumis »), a seller detail shows the card with « Non soumis » and no actions.
- [ ] Seller web (a real seller, with consent): `/dashboard/verification` loads, shows the required documents for its type; **no upload performed** unless the seller wants to start.
- [ ] Sentry: no new issue tagged `SellerVerification*` / `browse` in the first hour.
- [ ] Cron: next morning, api logs show the retention/orphan sweep ran (nothing to purge yet).

**Rollback**
- Code: redeploy the previous `main` SHA (`6e573a9`, the payouts release) via the standard rollback in `docs/deployment.md` — old code ignores the new columns/table/enum values, so **no schema rollback is needed** and none should be attempted (the migrations are expand-only; reverting them would drop seller evidence).
- Data: nothing to undo — the migrations only add defaults; any verification decisions taken before a rollback stay in the DB and become visible again on re-deploy.
- Mobile: not applicable until a store release is made.

### Follow-ups (not blocking)

- Validate `communeId` ↔ `cityId` on buyer addresses via `resolveCommune` (small API change + test).
- Consider a seller broadcast at launch explaining the new badge.
- Admin-web `sentry-scrub.ts` is shared across the three web apps; if a cloudinary-URL scrub is wanted in Sentry too, change all three together.
