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

## PR 1 — `feat/seller-commune-foundation` (2026-09-05)

**Root cause of the profile inconsistency.** `UpdateSellerProfileDto` had no `communeId` and `SellersService.updateProfile` validated `cityId` alone, so an approved seller could move their town while `communeId` kept pointing at a commune of the previous town; the only coupling lived inline in `apply()`. Both profile screens simply had no commune field.

**Reused, not rebuilt.** `Commune` model + `SellerProfile.communeId` relation (June migration, in prod), `GET /v1/cities` + `GET /v1/cities/:id/communes` (public), the existing onboarding cascades on both clients, the admin cities CRUD, the admin detail rows.

**Schema / migration.** One additive, idempotent file `2026-09-05_commune_is_active.sql` (`communes.isActive BOOLEAN NOT NULL DEFAULT TRUE` + `(cityId, isActive)` index), appended to `auto-apply.list`. Every existing commune stays active, old code never reads the column. Justification: without it, retiring a commune is a hard `DELETE … ON DELETE SET NULL` that silently erases seller and address locations; the flag lets admins retire (hidden from pickers, refused for new selections) while existing rows keep their reference.

**API.** `CitiesService.resolveCommune(communeId, expectedCityId?)` is the single source of truth (exists, active, active city, belongs to the sent city → returns the commune's own `cityId`); `assertActiveCity`, `cityHasActiveCommunes`. `apply` and `updateProfile` both go through it: a commune derives the city; a city alone is accepted only when it has no active library (D2) and, on a town change, clears the old commune; `communeId: null` clears only where no library exists; legacy `NULL` stays untouched. `ApplySellerDto.communeId` is optional at the DTO layer (the service requires it per city); `UpdateSellerProfileDto.communeId` added. Public commune listing returns active communes only; the admin listing includes retired ones; admin `PATCH` toggles `isActive`; admin `DELETE` is refused (409) while sellers/addresses reference the commune. `/me`, `GET /v1/sellers/profile`, the admin sellers list and the admin users list now carry `city { id, name }` + `commune { id, name }`.

**Clients.** seller-mobile: `core/utils/commune_rules.dart` (required / retained / hint, unit-tested) shared by the shop profile (new Ville → Commune → Adresse cascade, `showAppSnackbar`, API error passthrough) and the application (commune required only when the library is non-empty). seller-web: `lib/commune-rules.ts` (vitest) shared by `/dashboard/profile` (new cascade with retry) and `/devenir-vendeur` (conditional requirement). admin-web: « Ville / Commune » column on the sellers list; retire/restore toggle + 409-aware delete on the cities page. Buyer surfaces untouched.

**Legacy compatibility.** Production has two approved sellers with `communeId = NULL`: they load, edit and save without a commune as long as the town is unchanged; picking a commune or changing town applies the rule. No backfill.

