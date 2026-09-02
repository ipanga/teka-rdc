# Seller Catalog Taxonomy — leaf-category invariant

**Started:** 2026-09-02
**Surfaces:** `apps/api`, `apps/seller-web` (seller-mobile needed no change)
**Status:** Phase 1 **merged into `develop`** — PR #615, merge commit `9ecac4b` (true merge commit, not squashed). Not released to `main`.
**Scope note:** Phase 1 only. Workstreams B (search analytics), C (sales analytics) and D (CSV) are
deliberately NOT started — see "Next phase".

## Reported defect

While editing the quantity of a men's shirt, Seller Mobile showed **« Type de peau »** under
*Caractéristiques du produit*.

Product: <https://teka.cd/lubumbashi/lot-de-2-chemises-de-bureau-pour-homme-en-coton-a-manches-longues-bleu-et-noir-h0d799>

## Diagnosis (production, via the public browse API — no DB access)

| Field | Value |
|---|---|
| Product ID | `1a07d699-f9d5-42da-aa23-b999bc84ef37` (`shortCode` `h0d799`) |
| Status | ACTIVE |
| categoryId | `13000000-…-000000000501` = **`Mode > Homme`** — an INTERMEDIATE node |
| Ancestry | `Mode › Homme` (2 levels; a leaf product would show 3) |
| Leaf? | No — 8 children, all with 0 products |
| Specifications | 3, referencing `14000000-…-0000000401 01/02/03` |

Those three attribute ids belong to **`Électroménager > Cuisine`** (`Taille`/`Couleur`/`Matière`), so the
shirt's real values (`M` / `Bleu` / `Coton`) render in **no** seller form. `Type de peau` is **not**
attached to the product — it is served to the *form* because `Mode > Homme` carries it.

Legacy rows still sitting on intermediate nodes:

| Node | Rows |
|---|---|
| `Mode > Homme` | `Type`, **`Type de peau`** |
| `Mode > Enfants` | `Type`, **`Type de cheveux`** |
| `Électroménager > Cuisine` | `Taille`, `Couleur`, `Matière` |
| `Beauté & Santé > Beauté` | `Type`, `Conditionnement` |

## Root cause

The 3-level taxonomy attaches attributes to the **leaf** and expects products to link to the leaf. That
was documented in `getCategoryAttributes`' own docblock and **enforced nowhere** — not on
product↔category assignment, not on attribute serving. This is NOT the July 2026 parent-chain merge bug,
which is intact; every leaf's attribute set is correct.

**Second defect found while tracing it:** `update()` deleted *every* `ProductSpecification` for the
product whenever `specifications` was present. Any caller omitting the invisible legacy rows destroyed
them.

## Fixed

- `ProductsService.assertLeafCategory` — `create()` always; `update()` **only when `categoryId`
  changes**, so legacy products stay editable. Hard 400 naming the category; **never guesses a child**
  (« Homme » holds shirts, trousers and shoes alike).
- `getCategoryAttributes` returns `[]` for an intermediate node.
- `update()` clears only ids the API would serve for the target category (leaf-only) ∪ those the payload
  names. Foreign/legacy rows are preserved. Dead `specOps` binding removed.
- seller-web `CategoryCombobox`: leaves only are selectable; branches remain in the flattened list so a
  legacy category still displays, plus an in-component warning.
- seller-mobile: **no change needed** — its `CategorySelector` already selected leaves only. seller-web
  was the divergence.

## Validation actually performed

Local reproduction in the **dev** DB (dev mirrors prod exactly: same `Type de peau` on `Mode > Homme`,
same foreign `Taille/Couleur/Matière` on `Électroménager > Cuisine`): a product on `Mode > Homme` whose
specs reference the kitchen attribute rows.

**API (local, dev DB) — all passed**
- `getCategoryAttributes(Mode > Homme)` → `[]`
- `getCategoryAttributes(Chemises)` → `Taille, Couleur, Matière`
- `POST` product on `Mode > Homme` → 400 « Homme » est une catégorie intermédiaire…
- `POST` on the `Chemises` leaf → 201
- `PATCH { quantity: 11 }` on the legacy product → 200, and **all 3 hidden specs survived** (verified in DB)

**Seller Web (Chrome, localhost:5100) — all passed**
- Legacy product edit page loads, no crash; « Type de peau » gone → "Aucune caractéristique pour cette catégorie"
- Category field shows « Mode › Homme » + the legacy warning
- Search "homme" lists only leaves (T-shirts, Chemises, …); `Mode › Homme` absent
- Create + `Beauté & Santé › Soins Personnels › Soins du corps` → `Type de peau`, `Volume`, `Date d'expiration`
- Category change → `Électronique › Informatique › Moniteurs` → attributes refresh to `Taille écran`, `Résolution`, `Garantie`

**Seller Mobile (iPhone 17 Pro, iOS 26.5) — partial**
Built, installed (`com.tootiye.tekaseller.dev`) and launched against the local API; login screen renders,
no crash. **Interactive flows were NOT driven**: no `idb`/`cliclick`, and `osascript` returns
`not allowed assistive access (-1719)`, so taps/typing cannot be automated. Its 42 tests pass and no
seller-mobile code changed.

## Gates

API **271 → 287 unit** (16 added), **118 e2e**, `pnpm type-check` clean across 5 projects.
seller-web has **no test framework** (no `test` script), so no component test was added — introducing one
for a single test was judged out of scope.

## Deliberately NOT done

- **No production data touched.** The shirt keeps its wrong category.
- **No migration.** Production has ≥3 ACTIVE products on intermediate nodes (`Mode > Homme`,
  `Supermarché > Boissons`, `Supermarché > Entretien Maison`). `productCount` only counts buyer-visible
  products, so non-ACTIVE ones are unknown without DB access. None is auto-repairable.

## Next phase

Full production audit of affected products (incl. non-ACTIVE) → classified remediation → only then
Workstreams B/C/D, extending `SearchQuery` / `SearchSynonym` / `/v1/admin/reports` rather than building
parallel subsystems.

**Note:** `Supermarché > Boissons` carries the same defect *invisibly* — its legacy rows (`Volume`,
`Type`) look plausible, so no one will report it.

## Phase 2b — legacy product remediation (PR #617, merge commit `6169201`)

**Merged into `develop`. The migration has NOT been run against production.**

`manual/2026-09-03_remediate_legacy_category_products.sql` — self-validating,
idempotent, reversible, and deliberately absent from `auto-apply.list`.

| Product | From → To | Specifications |
|---|---|---|
| `h0d799` | `Mode > Homme` → `Mode > Homme > Chemises` | +3 on the Chemises attributes (Taille=M, Couleur=Bleu, Matière=Coton); the 3 original « Électroménager > Cuisine » rows are preserved |
| `vnkqce` | `Supermarché > Entretien Maison` → `… > Lessive` | none transferred; legacy « Type = Savon de lessive » preserved |
| `rb7t4r` | — | untouched; blocked on the alcohol/restricted-product decision |

### The PDP rendering invariant — and the rule that was REJECTED

The first attempt scoped PDP characteristics to `attribute.categoryId ===
product.categoryId`. A read-only production audit **disconfirmed** it: 18 foreign
specification rows exist across 9 live products, and **7 would have been left with
no characteristics at all** — a 10 kg bag of rice losing « Poids », an Android
phone losing RAM / Mémoire interne / État. Those rows are legitimate: the
pre-3-level taxonomy attached attributes at *subcategory* level and products still
reference them. Classified: 6 owned by an ancestor category, 6 by a soft-deleted
category, 6 by an unrelated live category.

The decisive measurement: **no live product has a duplicate attribute name today.**
The collision is *created* by remediation, which adds the correct leaf's
Taille/Couleur/Matière beside identically named rows from the product's previous
category.

**The invariant in force is therefore:** foreign specifications are preserved and
rendered; characteristics are de-duplicated **by name**, preferring the row whose
attribute belongs to the product's current category. Names are normalised with
`stripAccents()` (the same helper this file already uses for search terms,
mirroring the DB's `f_unaccent`) — exact normalised names only, no fuzzy or synonym
matching. Precedence is deterministic and independent of database row order:
own-category → `sortOrder` → `attributeId`.

### Taxonomy debt recorded here, deliberately not fixed in #617

1. **`vnkqce` still displays « Type = Savon de lessive ».** The Lessive leaf has no
   equivalent `Type` characteristic, so the legacy row remains the only source and
   stays visible. Hiding it would require dropping foreign rows — exactly the rule
   that blanks the 7 products above. Revisit during the systematic
   leaf-characteristics audit.
2. **`Lessive` exposes `Volume`, but the product is sold by weight (1,5 kg).**
   `Poids` is probably the more appropriate characteristic for laundry products.
   Not solved in #617.

### Production ordering requirement — SATISFIED

The de-duplication code had to reach production **before** the data migration ran, or
buyers would have seen doubled characteristics on `h0d799`. That ordering was honoured:
code first (release #618), then the two migrations, each verified before the next.

## RELEASED to production — 2026-09-02

Release PR **#618** (`develop → main`, merge commit `ce76525`, 16 commits / 14 files /
+1,632 −23), back-merged so `main == develop == ce76525`. Deploy run `33667591201`: all
5 jobs green. Carried Phases 1 (#615), 2a (#616), 2b (#617) and the seller/admin
consistency fix (#619).

**Neither migration ran during the deploy.** The expand phase read `auto-apply.list` and
skipped its four already-applied entries; the two taxonomy files are not listed, so
`apply-auto.sh` never saw them.

**The new code was proven live behaviourally**, not from CI: `GET
/v1/browse/categories/13000000-…-000000000501/attributes` (« Mode > Homme ») returned
`[]`, where production had previously returned `Type, Type de peau`.

**Compatibility confirmed before any data mutation** — the products that would have been
blanked by the rejected rule still render their characteristics: `2mjco7` Riz
« Poids = 10kg », `foyug0` Android « Mémoire interne / RAM / État », `pocc99` Huiles,
`d3k7ei` Mixeurs.

### Migrations applied — by hand, via `Apply prod migration`

**1. `2026-09-02_prune_invalid_brand_category_links.sql`** — run `33668468256`,
`INSERT 0 121 / DELETE 121`.

| | Before | After |
|---|---|---|
| Brands | 49 | 49 *(none deleted)* |
| Links (live brands) | 433 | **314** |
| → leaf | 314 | **314** *(none removed)* |
| → intermediate | 66 | **0** |
| → soft-deleted | 53 | **0** |

Leaf coverage identical in every top-level category. Seller dropdowns verified in
production: Chemises → Autre/Nike/Lacoste · Soins du corps → Autre/Nivea · Moniteurs →
Autre/HP/Dell/Asus/Acer · Parfums Homme → Autre/**Lacoste** (the deliberately kept link
survived) · « Mode > Homme » (intermediate) → 0. `Autre` intact; `brandId = NULL`
products unaffected; a branded product still resolves its brand.

**2. `2026-09-03_remediate_legacy_category_products.sql`** — run `33668783372`.

```
NOTICE: h0d799: remediated → Chemises (3 specs created, legacy specs preserved)
NOTICE: vnkqce: remediated → Lessive (1 legacy specs preserved, none transferred)
```

`h0d799` → « Mode > Homme > Chemises »; the buyer PDP renders Taille=M / Couleur=Bleu /
Matière=Coton exactly once each, while **all 6 rows remain stored** (3 new Chemises rows
plus the 3 original « Électroménager > Cuisine » rows, preserved). `vnkqce` → « … >
Lessive », legacy `Type = Savon de lessive` preserved and visible, no mapping invented.
`rb7t4r` untouched — `updatedAt` is still 2026-07-27, weeks before these migrations.

### Migration tracking — a gap worth knowing

`_manual_migrations` records **only auto-applied** files; `apply-migration.yml` writes no
tracking row, so neither migration above appears there. The same is true of
`2026-09-01_archive_duplicate_buyer_addresses.sql`, so this is pre-existing rather than
new. Both are nonetheless self-recording, and both were verified in production:

- `brand_categories_archive_20260902` — `intermediate_category=68, soft_deleted_category=53`
- `product_remediation_20260903` — `category_repointed=2, spec_inserted=3`

Neither was re-run in production to test idempotency; the dev double-runs stand as that
proof. **Adding a tracking write to `apply-migration.yml` is a sensible follow-up.**

### Not verified

Sentry was **not** checked — no `sentry-cli` and no auth token available from the working
environment. Health endpoints and all three web surfaces were verified instead.
seller-mobile was never interactively exercised (`osascript` returns `-1719`, no
`idb`/`cliclick`); the API response it consumes was verified.
